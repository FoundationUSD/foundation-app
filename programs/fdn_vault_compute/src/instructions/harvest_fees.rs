//! `harvest_fees` — mgmt (0.5% annual) + perf (10% above HWM), minted as shares
//! to the fee treasury. ADR-004 §Fee Architecture.
//!
//! Permissionless by design: anyone can trigger the harvest. Fees always flow to
//! `vault.fee_treasury`, never to the caller, so griefing cost = tx fee and the
//! upside is that harvest lands promptly around NAV updates (called inline by
//! `update_nav` once that ix is implemented).
//!
//! Flow:
//!   1. elapsed = now - vault.last_fee_harvest
//!   2. mgmt_shares = math::compute_management_fee_shares(...)
//!   3. perf_shares = math::compute_performance_fee_shares(...)
//!   4. Token-2022 mint_to: share_mint → fee_treasury (vault_authority signs)
//!   5. total_supply += (mgmt + perf)
//!   6. if nav_per_share > HWM: update HWM
//!   7. last_fee_harvest = now
//!   8. emit FeesHarvested

use crate::constants::{FEE_TREASURY_SEED, VAULT_AUTHORITY_SEED, VAULT_SEED};
use crate::errors::VaultError;
use crate::events::FeesHarvested;
use crate::math::{compute_management_fee_shares, compute_performance_fee_shares};
use crate::state::VaultState;
use anchor_lang::prelude::*;
use anchor_spl::token_2022::Token2022;
use anchor_spl::token_interface::{
    self, Mint as MintInterface, TokenAccount as TokenAccountInterface,
};

#[derive(Accounts)]
pub struct HarvestFees<'info> {
    pub caller: Signer<'info>,

    #[account(
        mut,
        seeds = [VAULT_SEED, vault.asset_symbol.as_ref()],
        bump = vault.bump,
        has_one = share_mint @ VaultError::AccountMismatch,
        has_one = fee_treasury @ VaultError::AccountMismatch,
    )]
    pub vault: Account<'info, VaultState>,

    #[account(mut)]
    pub share_mint: InterfaceAccount<'info, MintInterface>,

    #[account(
        mut,
        seeds = [FEE_TREASURY_SEED, vault.key().as_ref()],
        bump = vault.fee_treasury_bump,
    )]
    pub fee_treasury: InterfaceAccount<'info, TokenAccountInterface>,

    /// CHECK: signer-only PDA; seed-validated.
    #[account(
        seeds = [VAULT_AUTHORITY_SEED, vault.key().as_ref()],
        bump = vault.authority_bump,
    )]
    pub vault_authority: UncheckedAccount<'info>,

    pub token_2022: Program<'info, Token2022>,
}

pub fn handler(ctx: Context<HarvestFees>) -> Result<()> {
    let clock = Clock::get()?;
    let now = clock.unix_timestamp;
    let vault_key = ctx.accounts.vault.key();

    let elapsed = now
        .checked_sub(ctx.accounts.vault.last_fee_harvest)
        .ok_or(VaultError::MathOverflow)?;
    // Guard: clock went backwards (shouldn't happen on-chain but cheap to check).
    if elapsed <= 0 {
        return Ok(());
    }
    let elapsed_u64 = elapsed as u64;

    let mgmt_shares = compute_management_fee_shares(
        ctx.accounts.vault.total_assets,
        ctx.accounts.vault.total_supply,
        elapsed_u64,
        ctx.accounts.vault.management_fee_bps,
    )?;
    let perf_shares = compute_performance_fee_shares(
        ctx.accounts.vault.nav_per_share,
        ctx.accounts.vault.high_water_mark,
        ctx.accounts.vault.total_assets,
        ctx.accounts.vault.total_supply,
        ctx.accounts.vault.performance_fee_bps,
    )?;

    let total_fee_shares = mgmt_shares
        .checked_add(perf_shares)
        .ok_or(VaultError::MathOverflow)?;

    if total_fee_shares > 0 {
        let auth_bump = ctx.accounts.vault.authority_bump;
        let auth_bump_arr = [auth_bump];
        let auth_seeds: &[&[u8]] = &[VAULT_AUTHORITY_SEED, vault_key.as_ref(), &auth_bump_arr];
        token_interface::mint_to(
            CpiContext::new_with_signer(
                ctx.accounts.token_2022.to_account_info(),
                token_interface::MintTo {
                    mint: ctx.accounts.share_mint.to_account_info(),
                    to: ctx.accounts.fee_treasury.to_account_info(),
                    authority: ctx.accounts.vault_authority.to_account_info(),
                },
                &[auth_seeds],
            ),
            total_fee_shares,
        )?;
    }

    // VaultState accounting ────────────────────────────────────────────────────
    let vault = &mut ctx.accounts.vault;
    vault.total_supply = vault
        .total_supply
        .checked_add(total_fee_shares)
        .ok_or(VaultError::MathOverflow)?;

    // Update HWM only on upward moves — prevents double-charging perf fee on recoveries.
    if vault.nav_per_share > vault.high_water_mark {
        vault.high_water_mark = vault.nav_per_share;
    }
    vault.last_fee_harvest = now;

    emit!(FeesHarvested {
        vault: vault_key,
        mgmt_fee_shares: mgmt_shares,
        perf_fee_shares: perf_shares,
        high_water_mark: vault.high_water_mark,
        timestamp: now,
    });
    Ok(())
}
