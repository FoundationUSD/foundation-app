//! VaultState, ShareLockup, RedeemRequest PDAs. Field ordering follows ADR-004 §State Design.

use anchor_lang::prelude::*;

#[account]
#[derive(Default)]
pub struct VaultState {
    // Identity
    pub admin: Pubkey,
    pub operator: Pubkey,
    pub asset_symbol: [u8; 16],
    pub underlying_kind: u8, // 0=sAID, 1=sUSDai, 2=ATH, 3=XBIT

    // Token references
    pub usdc_mint: Pubkey,
    pub share_mint: Pubkey,       // Token-2022 mint
    pub buffer_usdc: Pubkey,      // PDA-owned USDC token account
    pub managed_usdc: Pubkey,     // PDA-owned USDC token account

    // NAV state
    pub total_assets: u64,
    pub total_supply: u64,
    pub nav_per_share: u64,
    pub nav_twap: u64,
    pub last_nav_update: i64,

    // Virtual offset — set at init, immutable
    pub virtual_assets: u64,
    pub virtual_shares: u64,

    // Buffer
    pub buffer_target_bps: u16,
    pub buffer_minimum_bps: u16,
    pub queue_mode: bool,

    // Security controls
    pub share_lockup_seconds: i64,
    pub max_redeem_per_epoch_bps: u16,
    pub epoch_start: i64,
    pub redeemed_this_epoch: u64,
    pub paused: bool,
    pub pause_authorities: [Pubkey; 3],
    pub deposit_cap: u64,

    // Fees
    pub management_fee_bps: u16,
    pub performance_fee_bps: u16,
    pub high_water_mark: u64,
    pub fee_treasury: Pubkey,
    pub last_fee_harvest: i64,
    pub pending_management_fee: u64,
    pub pending_performance_fee: u64,

    // Governance
    pub upgrade_authority: Pubkey,
    pub timelock_seconds: i64,

    // SAS (optional institutional gating)
    pub requires_attestation: bool,
    pub attestation_schema: Pubkey,
    pub attestation_issuer: Pubkey,

    // Bumps
    pub bump: u8,
    pub share_mint_bump: u8,
    pub authority_bump: u8,
    pub buffer_bump: u8,
    pub managed_bump: u8,
    pub fee_treasury_bump: u8,

    // Monotonic counter for RedeemRequest seeds
    pub next_request_id: u64,
}

#[account]
#[derive(Default)]
pub struct ShareLockup {
    pub vault: Pubkey,
    pub user: Pubkey,
    pub locked_until: i64,
    pub bump: u8,
}

#[account]
#[derive(Default)]
pub struct RedeemRequest {
    pub vault: Pubkey,
    pub user: Pubkey,
    pub request_id: u64,
    pub shares: u64,
    pub request_time: i64,
    pub status: u8,       // 0=Pending, 1=Claimable, 2=Completed
    pub fill_amount: u64,
    pub bump: u8,
}

#[repr(u8)]
pub enum RedeemStatus {
    Pending = 0,
    Claimable = 1,
    Completed = 2,
}
