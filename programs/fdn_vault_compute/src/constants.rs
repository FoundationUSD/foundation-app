//! Constants — ADR-004 defaults. Changes require Squads 3-of-5 + 48h timelock.

use anchor_lang::prelude::*;

/// Virtual offset — OpenZeppelin pattern, ADR-004 §Inflation Attack Protection.
pub const VIRTUAL_ASSETS: u64 = 1_000_000; // +1 USDC virtual
pub const VIRTUAL_SHARES: u64 = 1_000_000; // +1M virtual shares

/// Buffer parameters (bps).
pub const BUFFER_TARGET_BPS: u16 = 1500; // 15%
pub const BUFFER_MINIMUM_BPS: u16 = 500; // 5%

/// Security controls.
pub const SHARE_LOCKUP_SECONDS: i64 = 86_400; // 24h anti-arb
pub const MAX_REDEEM_PER_EPOCH_BPS: u16 = 1000; // 10%/24h
pub const EPOCH_DURATION_SECONDS: i64 = 86_400;

/// Fees (bps).
pub const MANAGEMENT_FEE_BPS: u16 = 50; // 0.5% annual
pub const PERFORMANCE_FEE_BPS: u16 = 1000; // 10% above HWM

/// Governance timelock.
pub const TIMELOCK_SECONDS: i64 = 172_800; // 48h

/// Oracle params.
pub const NAV_STALENESS_MAX_SECONDS: i64 = 26 * 3600; // 26h
pub const PYTH_STALENESS_MAX_SECONDS: i64 = 60;
pub const NAV_UPPER_BOUND_BPS: u16 = 10_500; // TWAP * 1.05
pub const NAV_LOWER_BOUND_BPS: u16 = 9_800;  // TWAP * 0.98
pub const NAV_FLOOR: u64 = 1_000_000; // $1.00 USDC circuit breaker
pub const TWAP_PREVIOUS_WEIGHT_BPS: u16 = 7_000; // 70%
pub const TWAP_NEW_WEIGHT_BPS: u16 = 3_000;      // 30%

/// Batch limits.
pub const MAX_WITHDRAWALS_PER_BATCH: usize = 10;

/// Seed prefixes.
pub const VAULT_SEED: &[u8] = b"vault";
pub const SHARE_MINT_SEED: &[u8] = b"share_mint";
pub const VAULT_AUTHORITY_SEED: &[u8] = b"vault_authority";
pub const BUFFER_USDC_SEED: &[u8] = b"buffer_usdc";
pub const MANAGED_USDC_SEED: &[u8] = b"managed_usdc";
pub const SHARE_LOCKUP_SEED: &[u8] = b"share_lockup";
pub const REDEEM_REQUEST_SEED: &[u8] = b"redeem_request";
pub const FEE_TREASURY_SEED: &[u8] = b"fee_treasury";

/// USDC decimals — 6 on both mainnet and devnet.
pub const USDC_DECIMALS: u8 = 6;
pub const SHARE_DECIMALS: u8 = 6;
pub const BPS_DENOMINATOR: u64 = 10_000;
pub const SECONDS_PER_YEAR: u64 = 31_536_000;
