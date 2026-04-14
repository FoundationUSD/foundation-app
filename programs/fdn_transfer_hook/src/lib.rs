//! fdn_transfer_hook — 24h lockup enforcement for Foundation vault share tokens.
//!
//! Spec: dataroom/solana/ADR-004-vault-architecture.md §Transfer Hook Architecture
//!
//! Attached to the vault share mint via Token-2022 TransferHook extension.
//! Executed by Token-2022 on every transfer. Minimal (~80 lines), read-only
//! accounts, zero external CPI. Immutable from deploy — upgrade authority
//! revoked in the same tx as the first deploy.
//!
//! Logic:
//!   1. Load source ShareLockup; reject if `locked_until > clock.unix_timestamp`
//!   2. Destination lockup inherits `max(dest.locked_until, src.locked_until)`
//!
//! No balance changes. No token moves. No callbacks.

use anchor_lang::prelude::*;

declare_id!("Fv1tHooK1111111111111111111111111111111111");

#[program]
pub mod fdn_transfer_hook {
    use super::*;

    /// Invoked by Token-2022 on every transfer of the bound share mint.
    pub fn execute(_ctx: Context<Execute>, _amount: u64) -> Result<()> {
        // TODO(ADR-004): load source ShareLockup, enforce `now >= locked_until`,
        // propagate lockup to destination via `max(dest.locked_until, src.locked_until)`.
        err!(HookError::NotImplemented)
    }

    /// Required by `spl-transfer-hook-interface`: declare the extra accounts
    /// Token-2022 must pass into `execute`.
    pub fn initialize_extra_account_meta_list(
        _ctx: Context<InitializeExtraAccountMetaList>,
    ) -> Result<()> {
        // TODO: write ExtraAccountMetaList with source/dest ShareLockup PDAs.
        err!(HookError::NotImplemented)
    }
}

#[derive(Accounts)]
pub struct Execute {}

#[derive(Accounts)]
pub struct InitializeExtraAccountMetaList {}

#[error_code]
pub enum HookError {
    #[msg("Hook not yet implemented")]
    NotImplemented,
    #[msg("Transfer blocked: 24h lockup active")]
    LockupActive,
}
