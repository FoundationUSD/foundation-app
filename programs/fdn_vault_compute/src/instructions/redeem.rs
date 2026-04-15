//! `redeem` — burn shares, transfer USDC from buffer. ADR-004 §Instructions §3.
//!
//! Instant path only. When buffer insufficient, rate-limit exceeded, or queue_mode
//! active, caller must use `request_redeem` instead.
//!
//! Flow:
//!   1. access::require_not_paused
//!   2. require !vault.queue_mode
//!   3. require share_lockup.locked_until <= now (LockupActive otherwise)
//!   4. assets = math::shares_to_assets(shares, total_assets, total_supply)
//!   5. rate_limit::consume(vault, assets, now)
//!   6. require buffer_balance >= assets (BufferInsufficient otherwise)
//!   7. Token-2022 burn from redeemer_share_acct (redeemer signs)
//!   8. SPL transfer: buffer_usdc → redeemer_usdc (vault_authority signs)
//!   9. vault accounting + nav recompute
//!  10. invariants::enforce
//!  11. emit Redeem

use crate::access::require_not_paused;
use crate::constants::{
    BUFFER_USDC_SEED, SHARE_LOCKUP_SEED, VAULT_AUTHORITY_SEED, VAULT_SEED,
};
use crate::errors::VaultError;
use crate::events::Redeem as RedeemEvent;
use crate::invariants::enforce as enforce_invariants;
use crate::math::{compute_nav_per_share, shares_to_assets};
use crate::rate_limit;
use crate::state::{ShareLockup, VaultState};
use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint as SplMint, Token, TokenAccount as SplTokenAccount};
use anchor_spl::token_2022::Token2022;
use anchor_spl::token_interface::{
    self, Mint as MintInterface, TokenAccount as TokenAccountInterface,
};

#[derive(Accounts)]
pub struct Redeem<'info> {
    #[account(mut)]
    pub redeemer: Signer<'info>,

    #[account(
        mut,
        seeds = [VAULT_SEED, vault.asset_symbol.as_ref()],
        bump = vault.bump,
        has_one = usdc_mint @ VaultError::AccountMismatch,
        has_one = share_mint @ VaultError::AccountMismatch,
        has_one = buffer_usdc @ VaultError::AccountMismatch,
        has_one = managed_usdc @ VaultError::AccountMismatch,
    )]
    pub vault: Box<Account<'info, VaultState>>,

    #[account(
        seeds = [SHARE_LOCKUP_SEED, vault.key().as_ref(), redeemer.key().as_ref()],
        bump = share_lockup.bump,
    )]
    pub share_lockup: Box<Account<'info, ShareLockup>>,

    pub usdc_mint: Box<Account<'info, SplMint>>,

    #[account(mut)]
    pub share_mint: Box<InterfaceAccount<'info, MintInterface>>,

    /// CHECK: signer-only PDA; seed-validated.
    #[account(
        seeds = [VAULT_AUTHORITY_SEED, vault.key().as_ref()],
        bump = vault.authority_bump,
    )]
    pub vault_authority: UncheckedAccount<'info>,

    #[account(
        mut,
        token::token_program = token_2022,
        token::mint = share_mint,
        token::authority = redeemer,
    )]
    pub redeemer_share_acct: Box<InterfaceAccount<'info, TokenAccountInterface>>,

    #[account(
        mut,
        token::mint = usdc_mint,
        token::authority = redeemer,
    )]
    pub redeemer_usdc: Box<Account<'info, SplTokenAccount>>,

    #[account(
        mut,
        seeds = [BUFFER_USDC_SEED, vault.key().as_ref()],
        bump = vault.buffer_bump,
    )]
    pub buffer_usdc: Box<Account<'info, SplTokenAccount>>,

    /// Read-only; needed for invariant I2 check (buffer + managed <= total_assets).
    pub managed_usdc: Box<Account<'info, SplTokenAccount>>,

    pub token_program: Program<'info, Token>,
    pub token_2022: Program<'info, Token2022>,
}

pub fn handler(ctx: Context<Redeem>, shares: u64) -> Result<()> {
    let clock = Clock::get()?;
    let now = clock.unix_timestamp;
    let vault_key = ctx.accounts.vault.key();

    // Access + input + lockup + queue-mode checks ─────────────────────────────
    require_not_paused(&ctx.accounts.vault)?;
    require!(shares > 0, VaultError::MathOverflow);
    require!(
        !ctx.accounts.vault.queue_mode,
        VaultError::QueueModeActive
    );
    require!(
        ctx.accounts.share_lockup.locked_until <= now,
        VaultError::LockupActive
    );

    // Compute assets to release ────────────────────────────────────────────────
    let assets = shares_to_assets(
        shares,
        ctx.accounts.vault.total_assets,
        ctx.accounts.vault.total_supply,
    )?;
    require!(assets > 0, VaultError::MathOverflow);

    // Rate limit (10% of TVL per 24h epoch) + buffer sufficiency ───────────────
    {
        let vault = &mut ctx.accounts.vault;
        rate_limit::consume(vault, assets, now)?;
    }
    require!(
        ctx.accounts.buffer_usdc.amount >= assets,
        VaultError::BufferInsufficient
    );

    // Burn shares (redeemer signs — not PDA) ───────────────────────────────────
    token_interface::burn(
        CpiContext::new(
            ctx.accounts.token_2022.to_account_info(),
            token_interface::Burn {
                mint: ctx.accounts.share_mint.to_account_info(),
                from: ctx.accounts.redeemer_share_acct.to_account_info(),
                authority: ctx.accounts.redeemer.to_account_info(),
            },
        ),
        shares,
    )?;

    // Transfer USDC from buffer — vault_authority PDA signs ────────────────────
    let auth_bump = ctx.accounts.vault.authority_bump;
    let auth_bump_arr = [auth_bump];
    let auth_seeds: &[&[u8]] = &[VAULT_AUTHORITY_SEED, vault_key.as_ref(), &auth_bump_arr];
    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            token::Transfer {
                from: ctx.accounts.buffer_usdc.to_account_info(),
                to: ctx.accounts.redeemer_usdc.to_account_info(),
                authority: ctx.accounts.vault_authority.to_account_info(),
            },
            &[auth_seeds],
        ),
        assets,
    )?;

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

    emit!(RedeemEvent {
        vault: vault_key,
        user: ctx.accounts.redeemer.key(),
        shares,
        amount: assets,
        nav_per_share: vault.nav_per_share,
        timestamp: now,
    });
    Ok(())
}
