//! Rate limiter — ADR-004 §Rate Limit.
//!
//! 10% of TVL per 24h epoch via instant-redeem path. Queue path is not rate-limited
//! (async and operator-controlled).
//!
//! Epoch auto-advances: on each redeem, if `now - epoch_start >= EPOCH_DURATION_SECONDS`,
//! reset `redeemed_this_epoch = 0` and `epoch_start = now` before accounting. Without
//! this, `redeemed_this_epoch` would grow unbounded and the limit would degrade to
//! cumulative (breaking the "per 24h" guarantee).

use crate::constants::{BPS_DENOMINATOR, EPOCH_DURATION_SECONDS};
use crate::errors::VaultError;
use crate::state::VaultState;
use anchor_lang::prelude::*;

/// Roll the epoch forward if the clock has advanced past it. Safe to call before every
/// redeem/request_redeem.
pub fn maybe_advance_epoch(vault: &mut VaultState, now: i64) {
    if now.saturating_sub(vault.epoch_start) >= EPOCH_DURATION_SECONDS {
        vault.epoch_start = now;
        vault.redeemed_this_epoch = 0;
    }
}

/// Compute max-redeemable USDC in the current epoch given TVL and bps cap.
pub fn epoch_cap(total_assets: u64, max_redeem_per_epoch_bps: u16) -> Result<u64> {
    let cap = (total_assets as u128)
        .checked_mul(max_redeem_per_epoch_bps as u128)
        .and_then(|v| v.checked_div(BPS_DENOMINATOR as u128))
        .ok_or(VaultError::MathOverflow)?;
    u64::try_from(cap).map_err(|_| VaultError::MathOverflow.into())
}

/// Check-and-record a redeem against the current epoch. Mutates `redeemed_this_epoch`.
pub fn consume(
    vault: &mut VaultState,
    assets_out: u64,
    now: i64,
) -> Result<()> {
    maybe_advance_epoch(vault, now);
    let cap = epoch_cap(vault.total_assets, vault.max_redeem_per_epoch_bps)?;
    let new_total = vault
        .redeemed_this_epoch
        .checked_add(assets_out)
        .ok_or(VaultError::MathOverflow)?;
    if new_total > cap {
        return err!(VaultError::RateLimitExceeded);
    }
    vault.redeemed_this_epoch = new_total;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::constants::MAX_REDEEM_PER_EPOCH_BPS;

    fn mk_vault() -> VaultState {
        let mut v = VaultState::default();
        v.total_assets = 10_000_000_000; // 10,000 USDC
        v.max_redeem_per_epoch_bps = MAX_REDEEM_PER_EPOCH_BPS;
        v.epoch_start = 1_000_000;
        v
    }

    #[test]
    fn epoch_cap_is_ten_percent() {
        let cap = epoch_cap(10_000_000_000, MAX_REDEEM_PER_EPOCH_BPS).unwrap();
        assert_eq!(cap, 1_000_000_000); // 1,000 USDC
    }

    #[test]
    fn consume_accumulates_within_cap() {
        let mut v = mk_vault();
        consume(&mut v, 500_000_000, 1_000_100).unwrap();
        consume(&mut v, 400_000_000, 1_000_200).unwrap();
        assert_eq!(v.redeemed_this_epoch, 900_000_000);
    }

    #[test]
    fn consume_rejects_over_cap() {
        let mut v = mk_vault();
        consume(&mut v, 900_000_000, 1_000_100).unwrap();
        let err = consume(&mut v, 200_000_000, 1_000_200);
        assert!(err.is_err());
    }

    #[test]
    fn epoch_auto_advances_after_24h() {
        let mut v = mk_vault();
        consume(&mut v, 900_000_000, 1_000_100).unwrap();
        // 24h+1s later — epoch resets, full cap available again
        let next = 1_000_000 + EPOCH_DURATION_SECONDS + 1;
        consume(&mut v, 900_000_000, next).unwrap();
        assert_eq!(v.redeemed_this_epoch, 900_000_000);
        assert_eq!(v.epoch_start, next);
    }
}
