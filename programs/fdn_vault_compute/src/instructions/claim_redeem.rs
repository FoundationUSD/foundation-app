//! `claim_redeem` — user withdraws USDC from a Claimable RedeemRequest.
//! ADR-004 §Instructions §6.
//!
//! Pure token movement: USDC is already sitting in `pending_claims_usdc` from
//! `process_withdrawals`. No NAV math, no invariant re-check needed (no state math).
//!
//! Flow:
//!   1. require redeem_request.status == Claimable (user can't claim pending reqs)
//!   2. SPL transfer: pending_claims_usdc → redeemer_usdc (vault_authority signs)
//!   3. request.status = Completed
//!   4. emit RedeemClaimed

use crate::constants::{
    PENDING_CLAIMS_SEED, REDEEM_REQUEST_SEED, VAULT_AUTHORITY_SEED, VAULT_SEED,
};
use crate::errors::VaultError;
use crate::events::RedeemClaimed;
use crate::state::{RedeemRequest, RedeemStatus, VaultState};
use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint as SplMint, Token, TokenAccount as SplTokenAccount};

#[derive(Accounts)]
#[instruction(request_id: u64)]
pub struct ClaimRedeem<'info> {
    pub redeemer: Signer<'info>,

    #[account(
        seeds = [VAULT_SEED, vault.asset_symbol.as_ref()],
        bump = vault.bump,
        has_one = usdc_mint @ VaultError::AccountMismatch,
        has_one = pending_claims_usdc @ VaultError::AccountMismatch,
    )]
    pub vault: Account<'info, VaultState>,

    #[account(
        mut,
        seeds = [
            REDEEM_REQUEST_SEED,
            vault.key().as_ref(),
            redeemer.key().as_ref(),
            &request_id.to_le_bytes(),
        ],
        bump = redeem_request.bump,
        constraint = redeem_request.user == redeemer.key() @ VaultError::AccountMismatch,
    )]
    pub redeem_request: Account<'info, RedeemRequest>,

    pub usdc_mint: Account<'info, SplMint>,

    /// CHECK: signer-only PDA; seed-validated.
    #[account(
        seeds = [VAULT_AUTHORITY_SEED, vault.key().as_ref()],
        bump = vault.authority_bump,
    )]
    pub vault_authority: UncheckedAccount<'info>,

    #[account(
        mut,
        seeds = [PENDING_CLAIMS_SEED, vault.key().as_ref()],
        bump = vault.pending_claims_bump,
    )]
    pub pending_claims_usdc: Account<'info, SplTokenAccount>,

    #[account(
        mut,
        token::mint = usdc_mint,
        token::authority = redeemer,
    )]
    pub redeemer_usdc: Account<'info, SplTokenAccount>,

    pub token_program: Program<'info, Token>,
}

pub fn handler(ctx: Context<ClaimRedeem>, _request_id: u64) -> Result<()> {
    let clock = Clock::get()?;
    let now = clock.unix_timestamp;
    let vault_key = ctx.accounts.vault.key();

    require!(
        ctx.accounts.redeem_request.status == RedeemStatus::Claimable as u8,
        VaultError::RequestNotClaimable
    );

    let amount = ctx.accounts.redeem_request.fill_amount;
    require!(amount > 0, VaultError::MathOverflow);

    // Transfer USDC from pending_claims → redeemer (PDA signer) ────────────────
    let auth_bump = ctx.accounts.vault.authority_bump;
    let auth_bump_arr = [auth_bump];
    let auth_seeds: &[&[u8]] = &[VAULT_AUTHORITY_SEED, vault_key.as_ref(), &auth_bump_arr];
    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            token::Transfer {
                from: ctx.accounts.pending_claims_usdc.to_account_info(),
                to: ctx.accounts.redeemer_usdc.to_account_info(),
                authority: ctx.accounts.vault_authority.to_account_info(),
            },
            &[auth_seeds],
        ),
        amount,
    )?;

    // Mark Completed — idempotency guard: re-calling claim_redeem on Completed
    // status reverts via the `status == Claimable` check above.
    ctx.accounts.redeem_request.status = RedeemStatus::Completed as u8;

    emit!(RedeemClaimed {
        vault: vault_key,
        user: ctx.accounts.redeemer.key(),
        request_id: ctx.accounts.redeem_request.request_id,
        amount,
        timestamp: now,
    });
    Ok(())
}
