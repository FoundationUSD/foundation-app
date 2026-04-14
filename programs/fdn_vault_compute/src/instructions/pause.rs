//! `pause` — any of the 3 pause guardians can immediately halt the vault.
//! ADR-004 §Admin and Governance.

use crate::access::require_pause_guardian;
use crate::constants::VAULT_SEED;
use crate::events::Paused;
use crate::state::VaultState;
use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct Pause<'info> {
    pub guardian: Signer<'info>,

    #[account(
        mut,
        seeds = [VAULT_SEED, vault.asset_symbol.as_ref()],
        bump = vault.bump,
    )]
    pub vault: Account<'info, VaultState>,
}

pub fn handler(ctx: Context<Pause>) -> Result<()> {
    let vault = &mut ctx.accounts.vault;
    require_pause_guardian(vault, &ctx.accounts.guardian.key())?;

    // Idempotent: pausing an already-paused vault is a no-op that still emits.
    vault.paused = true;

    emit!(Paused {
        vault: vault.key(),
        guardian: ctx.accounts.guardian.key(),
        timestamp: Clock::get()?.unix_timestamp,
    });
    Ok(())
}
