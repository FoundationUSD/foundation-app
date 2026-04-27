//! VaultState, ShareLockup, RedeemRequest PDAs. Field ordering follows ADR-004 §State Design.

use anchor_lang::prelude::*;

impl VaultState {
    /// Fixed on-chain size: 8 (Anchor discriminator) + sum of all fields.
    /// Hand-computed because `#[derive(InitSpace)]` doesn't support `[Pubkey; 3]`.
    /// If fields are added/removed, update this AND add a migration path for existing accounts.
    pub const SPACE: usize = 8   // discriminator
        + 32 + 32 + 16 + 1       // admin, operator, asset_symbol, underlying_kind
        + 32 + 32 + 32 + 32      // usdc_mint, share_mint, buffer_usdc, managed_usdc
        + 8 + 8 + 8 + 8 + 8      // total_assets, total_supply, nav_per_share, nav_twap, last_nav_update
        + 8 + 8                  // virtual_assets, virtual_shares
        + 2 + 2 + 1              // buffer_target_bps, buffer_minimum_bps, queue_mode
        + 8 + 2 + 8 + 8 + 1      // lockup, epoch params, paused
        + 32 * 3 + 8             // pause_authorities[3], deposit_cap
        + 2 + 2 + 8 + 32 + 8 + 8 + 8  // fee fields
        + 32 + 8                 // upgrade_authority, timelock_seconds
        + 1 + 32 + 32            // SAS fields
        + 32 + 32                // redeem_escrow + pending_claims_usdc
        + 8                      // 8 bumps (was 6)
        + 8                      // next_request_id
        // ── AWY basket extension (zeroed when basket_enabled=false) ────────────
        + 1                      // basket_enabled
        + 32 * 4                 // basket_underlyings[4]
        + 2  * 4                 // basket_weights_bps[4]
        + 8  * 4                 // basket_nav_per_leg[4]
        + 8  * 4                 // basket_twap_per_leg[4]
        + 8  * 4                 // basket_last_nav_update_per_leg[4]
        + 8                      // last_rebalance
        + 8                      // rebalance_interval_seconds
        + 2                      // max_slippage_bps
        + 64;                    // reserved for future fields, zero-allocated
}

impl ShareLockup {
    pub const SPACE: usize = 8 + 32 + 32 + 8 + 1;
}

impl RedeemRequest {
    pub const SPACE: usize = 8 + 32 + 32 + 8 + 8 + 8 + 1 + 8 + 1;
}

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

    // Queue-path token accounts
    pub redeem_escrow: Pubkey,        // PDA share account, holds escrowed shares
    pub pending_claims_usdc: Pubkey,  // PDA USDC account, holds fulfilled redemptions

    // Bumps
    pub bump: u8,
    pub share_mint_bump: u8,
    pub authority_bump: u8,
    pub buffer_bump: u8,
    pub managed_bump: u8,
    pub fee_treasury_bump: u8,
    pub redeem_escrow_bump: u8,
    pub pending_claims_bump: u8,

    // Monotonic counter for RedeemRequest seeds
    pub next_request_id: u64,

    // ── AWY basket extension ──────────────────────────────────────────────────
    // All fields zero/default when `basket_enabled = false` so single-asset vaults
    // (fdnSMOKE, fdnGAIB) keep their existing semantics. Enabled via a separate
    // `enable_basket` ix after `initialize_token_accounts` runs (basket vaults
    // also need 4 leg-token accounts, created by a forthcoming ix).
    pub basket_enabled: bool,
    /// Mints of the 4 leg underlyings, fixed index order. AWY: [ONyc, PRIME, syrupUSDC, USDY].
    pub basket_underlyings: [Pubkey; 4],
    /// Target weights in bps; must sum to 10_000.
    pub basket_weights_bps: [u16; 4],
    /// Last known per-leg NAV in 6-decimal USDC units.
    pub basket_nav_per_leg: [u64; 4],
    /// Per-leg TWAP for bounds-check parity with the single-asset path (A3).
    pub basket_twap_per_leg: [u64; 4],
    /// Per-leg last-update timestamp; any stale leg blocks basket NAV update (A5).
    pub basket_last_nav_update_per_leg: [i64; 4],
    pub last_rebalance: i64,
    pub rebalance_interval_seconds: i64,
    /// Slippage cap applied per Jupiter swap leg.
    pub max_slippage_bps: u16,
    // NOTE: `VaultState::SPACE` reserves an additional 64 bytes after this field for
    // forward-compatible additions without account realloc. Bytes are zero-filled by
    // `init` and unused by serialization until a future field is appended here.
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
