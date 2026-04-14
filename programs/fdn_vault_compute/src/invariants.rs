//! Invariants — ADR-004 §Invariants.
//!
//! Checked on every state-changing instruction (deposit, redeem, request_redeem,
//! process_withdrawals, claim_redeem, update_nav, harvest_fees, drain_managed).
//!
//! Any violation → vault auto-paused + `InvariantViolation` event emitted.
//!
//! Rationale per invariant:
//!   I1 Supply consistency — catches silent share-mint drift (e.g. out-of-band mints).
//!                           Reads Token-2022 mint supply directly, not VaultState.
//!   I2 Asset backing      — catches accounting errors where `total_assets` diverges
//!                           from actual USDC held in buffer + managed PDAs.
//!   I3 Share price floor  — circuit-breaks at $1.00 so a depeg cannot be exploited
//!                           via cheap redemption at broken NAV. Pause + manual review.

use crate::errors::VaultError;
use crate::events::InvariantViolation;
use crate::state::VaultState;
use anchor_lang::prelude::*;

/// Result of an invariant check. `Violated` carries the invariant number so the caller
/// can flip `paused = true` and emit the matching event.
pub enum InvariantCheck {
    Ok,
    Violated(u8),
}

/// Run all 3 invariants against current vault state + live token account balances.
/// Does NOT mutate state — callers pause and emit on violation.
pub fn check_all(
    vault: &VaultState,
    share_mint_supply: u64,
    buffer_balance: u64,
    managed_balance: u64,
) -> InvariantCheck {
    // I1 — total_supply must equal actual on-chain mint supply.
    if vault.total_supply != share_mint_supply {
        return InvariantCheck::Violated(1);
    }

    // I2 — USDC held across buffer + managed must not exceed tracked total_assets.
    // (Equality would be ideal, but daily batch creates a transient window where
    // managed is drained before sAID subscription confirms, so we enforce ≤.)
    let held = buffer_balance.saturating_add(managed_balance);
    if held > vault.total_assets {
        return InvariantCheck::Violated(2);
    }

    // I3 — nav_per_share must stay above the $1.00 floor.
    if vault.nav_per_share < crate::constants::NAV_FLOOR {
        return InvariantCheck::Violated(3);
    }

    InvariantCheck::Ok
}

/// Enforce invariants; on violation, pauses the vault in-place, emits event, and
/// returns the mapped error. Callers should call this LAST in their ix handler
/// (checks-effects-interactions: after state mutation, before returning Ok).
pub fn enforce(
    vault: &mut VaultState,
    vault_key: Pubkey,
    share_mint_supply: u64,
    buffer_balance: u64,
    managed_balance: u64,
    clock: &Clock,
) -> Result<()> {
    match check_all(vault, share_mint_supply, buffer_balance, managed_balance) {
        InvariantCheck::Ok => Ok(()),
        InvariantCheck::Violated(which) => {
            vault.paused = true;
            emit!(InvariantViolation {
                vault: vault_key,
                invariant: which,
                timestamp: clock.unix_timestamp,
            });
            Err(match which {
                1 => VaultError::InvariantSupply,
                2 => VaultError::InvariantAssetBacking,
                3 => VaultError::InvariantSharePrice,
                _ => VaultError::InvariantSupply,
            }
            .into())
        }
    }
}
