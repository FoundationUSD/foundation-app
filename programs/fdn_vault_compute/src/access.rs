//! Access control — ADR-004 §Admin and Governance / §Role Separation.
//!
//! Three distinct roles:
//!   - admin (Squads 3-of-5 multisig) — parameter changes, upgrade, unpause
//!   - operator (hot wallet)          — update_nav, drain_managed, process_withdrawals
//!   - pause guardians (3 keys)       — pause() only; MUST be separate from Squads signers
//!
//! SECURITY: pause_authorities are deliberately distinct keys from Squads signers.
//! If they overlap, a single key compromise gives the attacker pause power PLUS one
//! vote toward the 3-of-5 threshold, collapsing defense-in-depth.

use crate::errors::VaultError;
use crate::state::VaultState;
use anchor_lang::prelude::*;

pub fn require_admin(vault: &VaultState, signer: &Pubkey) -> Result<()> {
    if vault.admin != *signer {
        return err!(VaultError::UnauthorizedAdmin);
    }
    Ok(())
}

pub fn require_operator(vault: &VaultState, signer: &Pubkey) -> Result<()> {
    if vault.operator != *signer {
        return err!(VaultError::UnauthorizedOperator);
    }
    Ok(())
}

pub fn require_pause_guardian(vault: &VaultState, signer: &Pubkey) -> Result<()> {
    if !vault.pause_authorities.contains(signer) {
        return err!(VaultError::UnauthorizedGuardian);
    }
    Ok(())
}

pub fn require_not_paused(vault: &VaultState) -> Result<()> {
    if vault.paused {
        return err!(VaultError::VaultPaused);
    }
    Ok(())
}
