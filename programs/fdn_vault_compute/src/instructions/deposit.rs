//! `deposit` — USDC in, shares out. ADR-004 §Instructions §2.
//!
//! Flow:
//!   1. access::require_not_paused
//!   2. Enforce deposit_cap
//!   3. (optional) SAS attestation check if vault.requires_attestation
//!   4. shares = math::assets_to_shares(amount, total_assets, total_supply)
//!   5. (to_buffer, to_managed) = math::split_deposit_to_buffer(...)
//!   6. SPL transfer: depositor_usdc → buffer_usdc (to_buffer)
//!   7. SPL transfer: depositor_usdc → managed_usdc (to_managed)
//!   8. Token-2022 mint_to: share_mint → depositor_share_acct (vault_authority signs)
//!   9. share_lockup.locked_until = now + vault.share_lockup_seconds
//!  10. vault.total_assets += amount; total_supply += shares; nav recompute
//!  11. invariants::enforce
//!  12. emit Deposit
//!
//! SAS enforcement is stubbed — flag it as follow-up before mainnet since ADR-004
//! §Institutional Verification is part of post-MVP scope anyway.

use crate::access::require_not_paused;
use crate::constants::{
    BUFFER_USDC_SEED, MANAGED_USDC_SEED, SHARE_LOCKUP_SEED, SHARE_MINT_SEED,
    VAULT_AUTHORITY_SEED, VAULT_SEED,
};
use crate::errors::VaultError;
use crate::events::Deposit as DepositEvent;
use crate::invariants::enforce as enforce_invariants;
use crate::math::{assets_to_shares, compute_nav_per_share, split_deposit_to_buffer};
use crate::state::{ShareLockup, VaultState};
use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint as SplMint, Token, TokenAccount as SplTokenAccount};
use anchor_spl::token_2022::Token2022;
use anchor_spl::token_interface::{
    self, Mint as MintInterface, TokenAccount as TokenAccountInterface,
};

/// SECURITY / ENG NOTE: `Box<>` every heavy account to keep each stack frame under
/// Solana's 4KB limit. Without Box, Anchor's inline validation code for all these
/// token accounts overflows the stack at runtime ("Access violation in stack frame").
/// This was caught by the devnet smoke test — unit tests and `cargo check` pass
/// regardless since the overflow only happens in the SBF VM.
#[derive(Accounts)]
pub struct Deposit<'info> {
    #[account(mut)]
    pub depositor: Signer<'info>,

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

    /// Per-user 24h lockup. `init_if_needed` is scoped to this crate only (see Cargo.toml
    /// security note). Safe here because seeds bind the PDA to a single (vault, user).
    #[account(
        init_if_needed,
        payer = depositor,
        space = ShareLockup::SPACE,
        seeds = [SHARE_LOCKUP_SEED, vault.key().as_ref(), depositor.key().as_ref()],
        bump,
    )]
    pub share_lockup: Box<Account<'info, ShareLockup>>,

    pub usdc_mint: Box<Account<'info, SplMint>>,

    #[account(mut)]
    pub share_mint: Box<InterfaceAccount<'info, MintInterface>>,

    /// Vault authority PDA — signs the Token-2022 `mint_to` CPI.
    /// CHECK: signer-only PDA; seed-validated below.
    #[account(
        seeds = [VAULT_AUTHORITY_SEED, vault.key().as_ref()],
        bump = vault.authority_bump,
    )]
    pub vault_authority: UncheckedAccount<'info>,

    /// Depositor's USDC source account (any ATA or arbitrary account they own).
    #[account(
        mut,
        token::mint = usdc_mint,
        token::authority = depositor,
    )]
    pub depositor_usdc: Box<Account<'info, SplTokenAccount>>,

    /// Buffer USDC — PDA-owned by vault_authority. Target 15% of TVL.
    #[account(
        mut,
        seeds = [BUFFER_USDC_SEED, vault.key().as_ref()],
        bump = vault.buffer_bump,
        token::mint = usdc_mint,
        token::authority = vault_authority,
    )]
    pub buffer_usdc: Box<Account<'info, SplTokenAccount>>,

    /// Managed USDC — PDA-owned by vault_authority. Drained daily to Ethereum.
    #[account(
        mut,
        seeds = [MANAGED_USDC_SEED, vault.key().as_ref()],
        bump = vault.managed_bump,
        token::mint = usdc_mint,
        token::authority = vault_authority,
    )]
    pub managed_usdc: Box<Account<'info, SplTokenAccount>>,

    /// Depositor's share receipt (Token-2022). Must be pre-created by the depositor.
    /// Account-level CPI Guard + Immutable Owner should be set by the client when
    /// creating this account (ADR-004 §Token-2022 Share Token Design).
    #[account(
        mut,
        token::token_program = token_2022,
        token::mint = share_mint,
        token::authority = depositor,
    )]
    pub depositor_share_acct: Box<InterfaceAccount<'info, TokenAccountInterface>>,

    pub token_program: Program<'info, Token>,
    pub token_2022: Program<'info, Token2022>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<Deposit>, amount: u64) -> Result<()> {
    let clock = Clock::get()?;
    let now = clock.unix_timestamp;
    let vault_key = ctx.accounts.vault.key();

    // Access + input validation ────────────────────────────────────────────────
    require_not_paused(&ctx.accounts.vault)?;
    require!(amount > 0, VaultError::MathOverflow);

    let new_total_assets = ctx
        .accounts
        .vault
        .total_assets
        .checked_add(amount)
        .ok_or(VaultError::MathOverflow)?;
    require!(
        new_total_assets <= ctx.accounts.vault.deposit_cap,
        VaultError::DepositCapExceeded
    );

    // SAS gate — optional institutional tier. TODO: load attestation from
    // remaining_accounts and validate against vault.attestation_schema / issuer.
    if ctx.accounts.vault.requires_attestation {
        return err!(VaultError::NotImplemented);
    }

    // Share calculation (virtual offset protects against inflation attack) ─────
    let shares = assets_to_shares(
        amount,
        ctx.accounts.vault.total_assets,
        ctx.accounts.vault.total_supply,
    )?;
    require!(shares > 0, VaultError::MathOverflow);

    // Buffer / managed split ───────────────────────────────────────────────────
    let current_buffer = ctx.accounts.buffer_usdc.amount;
    let (to_buffer, to_managed) = split_deposit_to_buffer(
        amount,
        current_buffer,
        new_total_assets,
        ctx.accounts.vault.buffer_target_bps,
    )?;

    // USDC transfers (SPL Token legacy) ────────────────────────────────────────
    if to_buffer > 0 {
        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                token::Transfer {
                    from: ctx.accounts.depositor_usdc.to_account_info(),
                    to: ctx.accounts.buffer_usdc.to_account_info(),
                    authority: ctx.accounts.depositor.to_account_info(),
                },
            ),
            to_buffer,
        )?;
    }
    if to_managed > 0 {
        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                token::Transfer {
                    from: ctx.accounts.depositor_usdc.to_account_info(),
                    to: ctx.accounts.managed_usdc.to_account_info(),
                    authority: ctx.accounts.depositor.to_account_info(),
                },
            ),
            to_managed,
        )?;
    }

    // Share mint (Token-2022, vault_authority PDA signs) ───────────────────────
    let auth_bump = ctx.accounts.vault.authority_bump;
    let auth_bump_arr = [auth_bump];
    let auth_seeds: &[&[u8]] = &[VAULT_AUTHORITY_SEED, vault_key.as_ref(), &auth_bump_arr];
    token_interface::mint_to(
        CpiContext::new_with_signer(
            ctx.accounts.token_2022.to_account_info(),
            token_interface::MintTo {
                mint: ctx.accounts.share_mint.to_account_info(),
                to: ctx.accounts.depositor_share_acct.to_account_info(),
                authority: ctx.accounts.vault_authority.to_account_info(),
            },
            &[auth_seeds],
        ),
        shares,
    )?;

    // ShareLockup update — every deposit refreshes to now + 24h ────────────────
    let lockup = &mut ctx.accounts.share_lockup;
    lockup.vault = vault_key;
    lockup.user = ctx.accounts.depositor.key();
    lockup.locked_until = now
        .checked_add(ctx.accounts.vault.share_lockup_seconds)
        .ok_or(VaultError::MathOverflow)?;
    lockup.bump = ctx.bumps.share_lockup;

    // VaultState accounting ────────────────────────────────────────────────────
    let vault = &mut ctx.accounts.vault;
    vault.total_assets = new_total_assets;
    vault.total_supply = vault
        .total_supply
        .checked_add(shares)
        .ok_or(VaultError::MathOverflow)?;
    vault.nav_per_share = compute_nav_per_share(vault.total_assets, vault.total_supply)?;

    // Invariants LAST (checks-effects-interactions) ────────────────────────────
    ctx.accounts.share_mint.reload()?;
    ctx.accounts.buffer_usdc.reload()?;
    ctx.accounts.managed_usdc.reload()?;
    enforce_invariants(
        vault,
        vault_key,
        ctx.accounts.share_mint.supply,
        ctx.accounts.buffer_usdc.amount,
        ctx.accounts.managed_usdc.amount,
        &clock,
    )?;

    emit!(DepositEvent {
        vault: vault_key,
        user: ctx.accounts.depositor.key(),
        amount,
        shares,
        nav_per_share: vault.nav_per_share,
        locked_until: lockup.locked_until,
        timestamp: now,
    });
    let _ = SHARE_MINT_SEED; // silence unused-const warning for now
    Ok(())
}
