//! `deposit` — USDC in, shares out. ADR-004 §Instructions §2.
//!
//! Handler is stubbed until Token-2022 mint CPI + buffer/managed accounts land.
//! The Accounts context already encodes:
//!   - depositor is the signer paying USDC
//!   - vault PDA is writable and not-paused (checked in handler)
//!   - ShareLockup PDA created-if-needed, writable
//!   - Optional SAS accounts passed via `remaining_accounts` when requires_attestation
//!   - Deposit cap enforced in handler

use crate::constants::{SHARE_LOCKUP_SEED, VAULT_SEED};
use crate::errors::VaultError;
use crate::state::{ShareLockup, VaultState};
use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct Deposit<'info> {
    #[account(mut)]
    pub depositor: Signer<'info>,

    #[account(
        mut,
        seeds = [VAULT_SEED, vault.asset_symbol.as_ref()],
        bump = vault.bump,
    )]
    pub vault: Account<'info, VaultState>,

    /// Per-user lockup PDA. Created on first deposit; `locked_until` overwritten each
    /// subsequent deposit to `now + 86400`.
    #[account(
        init_if_needed,
        payer = depositor,
        space = ShareLockup::SPACE,
        seeds = [SHARE_LOCKUP_SEED, vault.key().as_ref(), depositor.key().as_ref()],
        bump,
    )]
    pub share_lockup: Account<'info, ShareLockup>,

    pub system_program: Program<'info, System>,
    // TODO: token_program (Token-2022), share_mint, depositor_usdc, buffer_usdc,
    // managed_usdc, vault_authority PDA, optional SAS attestation account.
}

pub fn handler(_ctx: Context<Deposit>, _amount: u64) -> Result<()> {
    // TODO(ADR-004 §deposit):
    //   1. require_not_paused
    //   2. assert amount > 0 and total_assets + amount <= deposit_cap
    //   3. if requires_attestation: load SAS attestation from remaining_accounts, validate
    //   4. shares = math::assets_to_shares(amount, total_assets, total_supply)
    //   5. (to_buffer, to_managed) = math::split_deposit_to_buffer(...)
    //   6. SPL transfer depositor_usdc → buffer + managed
    //   7. SPL mint shares to depositor (Token-2022 via vault_authority PDA signer)
    //   8. share_lockup.locked_until = now + vault.share_lockup_seconds
    //   9. total_assets += amount; total_supply += shares; nav refresh
    //  10. invariants::enforce
    //  11. emit Deposit
    err!(VaultError::NotImplemented)
}
