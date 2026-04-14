//! `redeem` — burn shares, transfer USDC from buffer. ADR-004 §Instructions §3.
//!
//! Instant path only. If buffer insufficient or queue_mode active, caller must use
//! `request_redeem` instead.

use crate::constants::{SHARE_LOCKUP_SEED, VAULT_SEED};
use crate::errors::VaultError;
use crate::state::{ShareLockup, VaultState};
use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct Redeem<'info> {
    #[account(mut)]
    pub redeemer: Signer<'info>,

    #[account(
        mut,
        seeds = [VAULT_SEED, vault.asset_symbol.as_ref()],
        bump = vault.bump,
    )]
    pub vault: Account<'info, VaultState>,

    #[account(
        seeds = [SHARE_LOCKUP_SEED, vault.key().as_ref(), redeemer.key().as_ref()],
        bump = share_lockup.bump,
    )]
    pub share_lockup: Account<'info, ShareLockup>,
    // TODO: token_program, share_mint (burn), redeemer_share_acct, redeemer_usdc,
    // buffer_usdc, vault_authority PDA.
}

pub fn handler(_ctx: Context<Redeem>, _shares: u64) -> Result<()> {
    // TODO(ADR-004 §redeem):
    //   1. require_not_paused
    //   2. require !vault.queue_mode
    //   3. require share_lockup.locked_until <= now (LockupActive otherwise)
    //   4. assets = math::shares_to_assets(shares, total_assets, total_supply)
    //   5. rate_limit::consume(vault, assets, now)
    //   6. require buffer_balance >= assets (BufferInsufficient otherwise)
    //   7. SPL burn shares from redeemer_share_acct
    //   8. SPL transfer buffer → redeemer_usdc (vault_authority signs)
    //   9. total_assets -= assets; total_supply -= shares; refresh nav
    //  10. invariants::enforce
    //  11. emit Redeem
    err!(VaultError::NotImplemented)
}
