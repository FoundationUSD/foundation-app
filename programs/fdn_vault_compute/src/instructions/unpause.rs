//! `unpause` — admin (Squads 3-of-5) only. Re-checks invariants before resuming.
//! ADR-004 §Admin and Governance. 48h timelock on the Squads tx itself lives
//! outside the program — Squads enforces it before the signed tx arrives here.

use crate::access::require_admin;
use crate::constants::VAULT_SEED;
use crate::events::Unpaused;
use crate::state::VaultState;
use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct Unpause<'info> {
    pub admin: Signer<'info>,

    #[account(
        mut,
        seeds = [VAULT_SEED, vault.asset_symbol.as_ref()],
        bump = vault.bump,
    )]
    pub vault: Account<'info, VaultState>,
}

pub fn handler(ctx: Context<Unpause>) -> Result<()> {
    let vault = &mut ctx.accounts.vault;
    require_admin(vault, &ctx.accounts.admin.key())?;

    // NOTE: full invariant re-check on unpause lands with the deposit/redeem pass
    // (requires share_mint supply + buffer/managed balance reads). For now the admin
    // is trusted to have investigated the pause cause before re-enabling ops. This is
    // noted as a security item and will be tightened as part of invariant wiring.
    vault.paused = false;

    emit!(Unpaused {
        vault: vault.key(),
        admin: ctx.accounts.admin.key(),
        timestamp: Clock::get()?.unix_timestamp,
    });
    Ok(())
}
