//! `process_withdrawals` — operator fulfills ONE pending RedeemRequest at a time.
//! ADR-004 §Instructions §5.
//!
//! Design decision: ADR-004 spec'd batching up to 10 requests per tx. For simplicity
//! and auditability, v0 processes one request per ix. Client-side a keeper sends N
//! back-to-back txs in a single batch. Batch limit is enforced client-side at 10 to
//! stay under Solana's per-tx compute budget.
//!
//! Flow:
//!   1. require operator signer
//!   2. require redeem_request.status == Pending
//!   3. assets = math::shares_to_assets(request.shares, total_assets, total_supply)
//!   4. require buffer_usdc.amount >= assets
//!   5. Token-2022 burn: redeem_escrow → burn (vault_authority signs)
//!   6. SPL transfer: buffer_usdc → pending_claims_usdc (vault_authority signs)
//!   7. request.status = Claimable; request.fill_amount = assets
//!   8. vault.total_assets -= assets; total_supply -= request.shares; refresh nav
//!   9. invariants::enforce
//!  10. emit WithdrawalsProcessed

use crate::access::require_operator;
use crate::constants::{
    BUFFER_USDC_SEED, PENDING_CLAIMS_SEED, REDEEM_ESCROW_SEED, REDEEM_REQUEST_SEED,
    VAULT_AUTHORITY_SEED, VAULT_SEED,
};
use crate::errors::VaultError;
use crate::events::WithdrawalsProcessed;
use crate::invariants::enforce as enforce_invariants;
use crate::math::{compute_nav_per_share, shares_to_assets};
use crate::state::{RedeemRequest, RedeemStatus, VaultState};
use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint as SplMint, Token, TokenAccount as SplTokenAccount};
use anchor_spl::token_2022::Token2022;
use anchor_spl::token_interface::{
    self, Mint as MintInterface, TokenAccount as TokenAccountInterface,
};

#[derive(Accounts)]
#[instruction(request_id: u64)]
pub struct ProcessWithdrawals<'info> {
    pub operator: Signer<'info>,

    #[account(
        mut,
        seeds = [VAULT_SEED, vault.asset_symbol.as_ref()],
        bump = vault.bump,
        has_one = usdc_mint @ VaultError::AccountMismatch,
        has_one = share_mint @ VaultError::AccountMismatch,
        has_one = buffer_usdc @ VaultError::AccountMismatch,
        has_one = managed_usdc @ VaultError::AccountMismatch,
        has_one = redeem_escrow @ VaultError::AccountMismatch,
        has_one = pending_claims_usdc @ VaultError::AccountMismatch,
    )]
    pub vault: Account<'info, VaultState>,

    #[account(
        mut,
        seeds = [
            REDEEM_REQUEST_SEED,
            vault.key().as_ref(),
            redeem_request.user.as_ref(),
            &request_id.to_le_bytes(),
        ],
        bump = redeem_request.bump,
    )]
    pub redeem_request: Account<'info, RedeemRequest>,

    pub usdc_mint: Account<'info, SplMint>,

    #[account(mut)]
    pub share_mint: InterfaceAccount<'info, MintInterface>,

    /// CHECK: signer-only PDA; seed-validated.
    #[account(
        seeds = [VAULT_AUTHORITY_SEED, vault.key().as_ref()],
        bump = vault.authority_bump,
    )]
    pub vault_authority: UncheckedAccount<'info>,

    #[account(
        mut,
        seeds = [REDEEM_ESCROW_SEED, vault.key().as_ref()],
        bump = vault.redeem_escrow_bump,
    )]
    pub redeem_escrow: InterfaceAccount<'info, TokenAccountInterface>,

    #[account(
        mut,
        seeds = [BUFFER_USDC_SEED, vault.key().as_ref()],
        bump = vault.buffer_bump,
    )]
    pub buffer_usdc: Account<'info, SplTokenAccount>,

    /// Read-only — needed for invariant I2 (asset backing).
    pub managed_usdc: Account<'info, SplTokenAccount>,

    #[account(
        mut,
        seeds = [PENDING_CLAIMS_SEED, vault.key().as_ref()],
        bump = vault.pending_claims_bump,
    )]
    pub pending_claims_usdc: Account<'info, SplTokenAccount>,

    pub token_program: Program<'info, Token>,
    pub token_2022: Program<'info, Token2022>,
}

pub fn handler(ctx: Context<ProcessWithdrawals>, _request_id: u64) -> Result<()> {
    let clock = Clock::get()?;
    let now = clock.unix_timestamp;
    let vault_key = ctx.accounts.vault.key();

    require_operator(&ctx.accounts.vault, &ctx.accounts.operator.key())?;

    // Request must be pending ─────────────────────────────────────────────────
    require!(
        ctx.accounts.redeem_request.status == RedeemStatus::Pending as u8,
        VaultError::RequestNotClaimable
    );

    // Compute USDC payout from the request's escrowed shares ───────────────────
    let shares = ctx.accounts.redeem_request.shares;
    let assets = shares_to_assets(
        shares,
        ctx.accounts.vault.total_assets,
        ctx.accounts.vault.total_supply,
    )?;
    require!(assets > 0, VaultError::MathOverflow);
    require!(
        ctx.accounts.buffer_usdc.amount >= assets,
        VaultError::BufferInsufficient
    );

    // Burn escrowed shares ─────────────────────────────────────────────────────
    let auth_bump = ctx.accounts.vault.authority_bump;
    let auth_bump_arr = [auth_bump];
    let auth_seeds: &[&[u8]] = &[VAULT_AUTHORITY_SEED, vault_key.as_ref(), &auth_bump_arr];
    token_interface::burn(
        CpiContext::new_with_signer(
            ctx.accounts.token_2022.to_account_info(),
            token_interface::Burn {
                mint: ctx.accounts.share_mint.to_account_info(),
                from: ctx.accounts.redeem_escrow.to_account_info(),
                authority: ctx.accounts.vault_authority.to_account_info(),
            },
            &[auth_seeds],
        ),
        shares,
    )?;

    // Move USDC buffer → pending_claims (isolates fulfilled amount from next ixs)
    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            token::Transfer {
                from: ctx.accounts.buffer_usdc.to_account_info(),
                to: ctx.accounts.pending_claims_usdc.to_account_info(),
                authority: ctx.accounts.vault_authority.to_account_info(),
            },
            &[auth_seeds],
        ),
        assets,
    )?;

    // Mark Claimable ───────────────────────────────────────────────────────────
    let request = &mut ctx.accounts.redeem_request;
    request.status = RedeemStatus::Claimable as u8;
    request.fill_amount = assets;

    // VaultState accounting ────────────────────────────────────────────────────
    let vault = &mut ctx.accounts.vault;
    vault.total_assets = vault
        .total_assets
        .checked_sub(assets)
        .ok_or(VaultError::MathOverflow)?;
    vault.total_supply = vault
        .total_supply
        .checked_sub(shares)
        .ok_or(VaultError::MathOverflow)?;
    vault.nav_per_share = compute_nav_per_share(vault.total_assets, vault.total_supply)?;

    // Invariants LAST ──────────────────────────────────────────────────────────
    ctx.accounts.share_mint.reload()?;
    ctx.accounts.buffer_usdc.reload()?;
    enforce_invariants(
        vault,
        vault_key,
        ctx.accounts.share_mint.supply,
        ctx.accounts.buffer_usdc.amount,
        ctx.accounts.managed_usdc.amount,
        &clock,
    )?;

    let req_id = ctx.accounts.redeem_request.request_id;
    emit!(WithdrawalsProcessed {
        vault: vault_key,
        request_ids: vec![req_id],
        total_filled: assets,
        timestamp: now,
    });
    Ok(())
}
