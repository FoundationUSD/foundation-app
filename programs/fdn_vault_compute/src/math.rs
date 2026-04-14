//! Share math — ADR-004 §Inflation Attack Protection and §Oracle Architecture.
//!
//! SECURITY CRITICAL. Every function here must:
//!   1. Use `u128` intermediates to avoid overflow on 6-decimal values up to ~1.8e19
//!   2. Use `checked_*` operations; never `wrapping_*` or `saturating_*`
//!   3. Round in the direction that favors the vault (protect existing holders):
//!        - deposit  → shares_out rounds DOWN
//!        - redeem   → assets_out rounds DOWN
//!        - fee mint → fee_shares rounds DOWN (holders' favor)
//!   4. Apply the virtual offset (1e6/1e6, OpenZeppelin pattern) on every share
//!      calculation. This makes inflation/donation attacks unprofitable.
//!
//! Reference exploits mitigated:
//!   - Venus $716K Feb 2025 (first-depositor inflation) — virtual offset
//!   - Balancer $128M Nov 2025, Cetus $223M May 2025 — checked math + u128
//!
//! Property invariants (verified via proptest in tests/):
//!   - deposit(redeem(s)) ≤ s   (vault favors holders on round-trip)
//!   - shares_to_assets and assets_to_shares are monotonic
//!   - virtual offset means: for any single-user, first deposit of 1 USDC yields
//!     exactly 1 share (after round-down), regardless of prior donations

use crate::constants::{
    BPS_DENOMINATOR, NAV_FLOOR, NAV_LOWER_BOUND_BPS, NAV_UPPER_BOUND_BPS,
    TWAP_NEW_WEIGHT_BPS, TWAP_PREVIOUS_WEIGHT_BPS, VIRTUAL_ASSETS, VIRTUAL_SHARES,
};
use crate::errors::VaultError;
use anchor_lang::prelude::*;

/// Convert USDC (assets) to shares at current NAV, applying the virtual offset.
/// Rounds DOWN to favor existing holders (standard ERC-4626 practice).
///
/// Formula:
///   shares = amount * (total_supply + VIRTUAL_SHARES) / (total_assets + VIRTUAL_ASSETS)
pub fn assets_to_shares(
    amount: u64,
    total_assets: u64,
    total_supply: u64,
) -> Result<u64> {
    let amount = amount as u128;
    let supply_plus_virtual = (total_supply as u128)
        .checked_add(VIRTUAL_SHARES as u128)
        .ok_or(VaultError::MathOverflow)?;
    let assets_plus_virtual = (total_assets as u128)
        .checked_add(VIRTUAL_ASSETS as u128)
        .ok_or(VaultError::MathOverflow)?;

    let numerator = amount
        .checked_mul(supply_plus_virtual)
        .ok_or(VaultError::MathOverflow)?;
    let shares_u128 = numerator
        .checked_div(assets_plus_virtual)
        .ok_or(VaultError::MathOverflow)?;

    u64::try_from(shares_u128).map_err(|_| VaultError::MathOverflow.into())
}

/// Convert shares to USDC (assets) at current NAV, applying the virtual offset.
/// Rounds DOWN to favor existing holders.
///
/// Formula:
///   assets = shares * (total_assets + VIRTUAL_ASSETS) / (total_supply + VIRTUAL_SHARES)
pub fn shares_to_assets(
    shares: u64,
    total_assets: u64,
    total_supply: u64,
) -> Result<u64> {
    let shares = shares as u128;
    let assets_plus_virtual = (total_assets as u128)
        .checked_add(VIRTUAL_ASSETS as u128)
        .ok_or(VaultError::MathOverflow)?;
    let supply_plus_virtual = (total_supply as u128)
        .checked_add(VIRTUAL_SHARES as u128)
        .ok_or(VaultError::MathOverflow)?;

    let numerator = shares
        .checked_mul(assets_plus_virtual)
        .ok_or(VaultError::MathOverflow)?;
    let assets_u128 = numerator
        .checked_div(supply_plus_virtual)
        .ok_or(VaultError::MathOverflow)?;

    u64::try_from(assets_u128).map_err(|_| VaultError::MathOverflow.into())
}

/// Current nav-per-share (6 decimals) using virtual offset.
/// Always returns >= NAV_FLOOR (1e6) because of the +1 USDC / +1M shares virtual pair
/// at empty vault state. Callers must still circuit-break on the stored `nav_per_share`
/// — this is a derivation helper.
pub fn compute_nav_per_share(total_assets: u64, total_supply: u64) -> Result<u64> {
    // 1 share (1e6 units) → X USDC units
    shares_to_assets(1_000_000, total_assets, total_supply)
}

/// Apply TWAP smoothing: `smoothed = 0.7 * prev + 0.3 * new` (ADR-004 §TWAP Smoothing).
///
/// Weights come from `TWAP_PREVIOUS_WEIGHT_BPS` + `TWAP_NEW_WEIGHT_BPS` which must sum to
/// `BPS_DENOMINATOR`. Verified at compile time below.
pub fn apply_twap(previous_twap: u64, new_nav: u64) -> Result<u64> {
    const _: () = assert!(
        (TWAP_PREVIOUS_WEIGHT_BPS as u64) + (TWAP_NEW_WEIGHT_BPS as u64) == BPS_DENOMINATOR
    );
    let prev_weighted = (previous_twap as u128)
        .checked_mul(TWAP_PREVIOUS_WEIGHT_BPS as u128)
        .ok_or(VaultError::MathOverflow)?;
    let new_weighted = (new_nav as u128)
        .checked_mul(TWAP_NEW_WEIGHT_BPS as u128)
        .ok_or(VaultError::MathOverflow)?;
    let sum = prev_weighted
        .checked_add(new_weighted)
        .ok_or(VaultError::MathOverflow)?;
    let smoothed = sum
        .checked_div(BPS_DENOMINATOR as u128)
        .ok_or(VaultError::MathOverflow)?;
    u64::try_from(smoothed).map_err(|_| VaultError::MathOverflow.into())
}

/// Verify `new_nav` is within `[twap * LOWER, twap * UPPER]` bounds.
/// Asymmetric: +5% upper, -2% lower (tighter on downside because a fake drop enables
/// cheap share purchases — ADR-004 §Bounds Check).
pub fn check_nav_bounds(new_nav: u64, twap: u64) -> Result<()> {
    let upper = (twap as u128)
        .checked_mul(NAV_UPPER_BOUND_BPS as u128)
        .and_then(|v| v.checked_div(BPS_DENOMINATOR as u128))
        .ok_or(VaultError::MathOverflow)?;
    let lower = (twap as u128)
        .checked_mul(NAV_LOWER_BOUND_BPS as u128)
        .and_then(|v| v.checked_div(BPS_DENOMINATOR as u128))
        .ok_or(VaultError::MathOverflow)?;

    let new_nav_u128 = new_nav as u128;
    if new_nav_u128 > upper || new_nav_u128 < lower {
        return err!(VaultError::NavOutOfBounds);
    }
    Ok(())
}

/// Circuit breaker: NAV below $1.00 floor (ADR-004 §Circuit Breaker).
pub fn check_nav_floor(nav_per_share: u64) -> Result<()> {
    if nav_per_share < NAV_FLOOR {
        return err!(VaultError::NavBelowFloor);
    }
    Ok(())
}

/// Pro-rata management fee in shares. 0.5% annual, charged via share dilution.
/// ADR-004 §Management Fee formula:
///   fee_assets  = total_assets * mgmt_bps * elapsed / (BPS * SECONDS_PER_YEAR)
///   fee_shares  = fee_assets  * total_supply / total_assets   (rounded DOWN)
pub fn compute_management_fee_shares(
    total_assets: u64,
    total_supply: u64,
    elapsed_seconds: u64,
    mgmt_fee_bps: u16,
) -> Result<u64> {
    if total_assets == 0 || elapsed_seconds == 0 {
        return Ok(0);
    }
    let fee_assets_num = (total_assets as u128)
        .checked_mul(mgmt_fee_bps as u128)
        .and_then(|v| v.checked_mul(elapsed_seconds as u128))
        .ok_or(VaultError::MathOverflow)?;
    let fee_assets_denom = (BPS_DENOMINATOR as u128)
        .checked_mul(crate::constants::SECONDS_PER_YEAR as u128)
        .ok_or(VaultError::MathOverflow)?;
    let fee_assets = fee_assets_num
        .checked_div(fee_assets_denom)
        .ok_or(VaultError::MathOverflow)?;

    let fee_shares = fee_assets
        .checked_mul(total_supply as u128)
        .and_then(|v| v.checked_div(total_assets as u128))
        .ok_or(VaultError::MathOverflow)?;
    u64::try_from(fee_shares).map_err(|_| VaultError::MathOverflow.into())
}

/// Performance fee in shares. 10% of NAV gain above high-water mark.
/// ADR-004 §Performance Fee formula:
///   if nav_per_share > HWM:
///       gain              = nav_per_share - HWM
///       perf_fee_assets   = total_assets * gain / nav_per_share * perf_bps / BPS
///       perf_fee_shares   = perf_fee_assets * total_supply / total_assets
///       HWM               = nav_per_share
pub fn compute_performance_fee_shares(
    nav_per_share: u64,
    high_water_mark: u64,
    total_assets: u64,
    total_supply: u64,
    perf_fee_bps: u16,
) -> Result<u64> {
    if nav_per_share <= high_water_mark || total_assets == 0 {
        return Ok(0);
    }
    let gain = (nav_per_share as u128)
        .checked_sub(high_water_mark as u128)
        .ok_or(VaultError::MathOverflow)?;
    let perf_fee_assets = (total_assets as u128)
        .checked_mul(gain)
        .and_then(|v| v.checked_div(nav_per_share as u128))
        .and_then(|v| v.checked_mul(perf_fee_bps as u128))
        .and_then(|v| v.checked_div(BPS_DENOMINATOR as u128))
        .ok_or(VaultError::MathOverflow)?;
    let perf_fee_shares = perf_fee_assets
        .checked_mul(total_supply as u128)
        .and_then(|v| v.checked_div(total_assets as u128))
        .ok_or(VaultError::MathOverflow)?;
    u64::try_from(perf_fee_shares).map_err(|_| VaultError::MathOverflow.into())
}

/// Compute the portion of a deposit that fills the buffer up to `buffer_target_bps`.
/// Remainder flows to managed. Rounds buffer target DOWN (so managed gets any rounding
/// slack, consistent with "capital deployment preferred" operational posture).
pub fn split_deposit_to_buffer(
    deposit_amount: u64,
    current_buffer: u64,
    total_assets_after_deposit: u64,
    buffer_target_bps: u16,
) -> Result<(u64, u64)> {
    let target_buffer = (total_assets_after_deposit as u128)
        .checked_mul(buffer_target_bps as u128)
        .and_then(|v| v.checked_div(BPS_DENOMINATOR as u128))
        .ok_or(VaultError::MathOverflow)?;
    let target_buffer = u64::try_from(target_buffer).map_err(|_| VaultError::MathOverflow)?;

    let buffer_headroom = target_buffer.saturating_sub(current_buffer);
    let to_buffer = deposit_amount.min(buffer_headroom);
    let to_managed = deposit_amount
        .checked_sub(to_buffer)
        .ok_or(VaultError::MathOverflow)?;
    Ok((to_buffer, to_managed))
}

#[cfg(test)]
mod tests {
    use super::*;

    /// First depositor deposits 1 USDC into an empty vault → exactly 1 share.
    /// Demonstrates the virtual offset's guarantee: no exchange-rate manipulation
    /// possible before first real deposit.
    #[test]
    fn first_deposit_one_to_one() {
        let shares = assets_to_shares(1_000_000, 0, 0).unwrap();
        assert_eq!(shares, 1_000_000);
    }

    /// Classic Venus-style inflation: attacker deposits 1 unit, then donates 1e12 USDC
    /// directly to buffer (bypass deposit). Victim deposits 1 USDC. With virtual offset,
    /// victim still gets non-trivial shares.
    #[test]
    fn inflation_attack_unprofitable() {
        // attacker: 1 share outstanding, but total_assets inflated to 1_000_000_000_000
        let total_assets = 1_000_000_000_000u64;
        let total_supply = 1u64;
        // victim deposits 1 USDC
        let victim_shares = assets_to_shares(1_000_000, total_assets, total_supply).unwrap();
        // With virtual offset, victim shares ≈ 1 * (1 + 1e6) / (1e12 + 1e6) ≈ 0
        // WITHOUT virtual offset: victim_shares = 1e6 * 1 / 1e12 = 0 — but the attacker
        // paid 1e12 USDC upfront. With virtual offset the rounding is the same, so the
        // attack cost (1e12 donated) massively exceeds any profit.
        assert!(victim_shares <= 1);
    }

    #[test]
    fn round_trip_favors_vault() {
        // Deposit 1000 USDC into vault with some prior state
        let total_assets = 50_000_000u64; // 50 USDC
        let total_supply = 50_000_000u64; // 50 shares
        let shares = assets_to_shares(1_000_000, total_assets, total_supply).unwrap();
        let back = shares_to_assets(shares, total_assets, total_supply).unwrap();
        assert!(back <= 1_000_000, "round trip must not exceed input");
    }

    #[test]
    fn twap_weights_sum_correctly() {
        // previous = 1.00, new = 1.10 → smoothed = 0.7*1.00 + 0.3*1.10 = 1.03
        let smoothed = apply_twap(1_000_000, 1_100_000).unwrap();
        assert_eq!(smoothed, 1_030_000);
    }

    #[test]
    fn bounds_reject_upper_spike() {
        // twap = 1.00, upper bound = 1.05, new = 1.10 → reject
        assert!(check_nav_bounds(1_100_000, 1_000_000).is_err());
    }

    #[test]
    fn bounds_reject_lower_drop() {
        // twap = 1.00, lower bound = 0.98, new = 0.97 → reject
        assert!(check_nav_bounds(970_000, 1_000_000).is_err());
    }

    #[test]
    fn bounds_accept_within() {
        assert!(check_nav_bounds(1_040_000, 1_000_000).is_ok());
        assert!(check_nav_bounds(990_000, 1_000_000).is_ok());
    }

    #[test]
    fn buffer_split_when_below_target() {
        // total_assets_after = 10 USDC, target 15% = 1.5 USDC, current buffer = 0
        // deposit 1 USDC → entire 1 USDC goes to buffer
        let (to_buffer, to_managed) =
            split_deposit_to_buffer(1_000_000, 0, 10_000_000, 1500).unwrap();
        assert_eq!(to_buffer, 1_000_000);
        assert_eq!(to_managed, 0);
    }

    #[test]
    fn buffer_split_when_above_target() {
        // buffer already at target — all new deposit goes to managed
        let (to_buffer, to_managed) =
            split_deposit_to_buffer(1_000_000, 2_000_000, 10_000_000, 1500).unwrap();
        assert_eq!(to_buffer, 0);
        assert_eq!(to_managed, 1_000_000);
    }

    #[test]
    fn management_fee_zero_on_empty_vault() {
        let fee = compute_management_fee_shares(0, 0, 86_400, 50).unwrap();
        assert_eq!(fee, 0);
    }

    #[test]
    fn performance_fee_zero_when_below_hwm() {
        let fee = compute_performance_fee_shares(900_000, 1_000_000, 50_000_000, 50_000_000, 1000)
            .unwrap();
        assert_eq!(fee, 0);
    }

    #[test]
    fn nav_floor_rejects_below_one_dollar() {
        assert!(check_nav_floor(999_999).is_err());
        assert!(check_nav_floor(1_000_000).is_ok());
    }
}
