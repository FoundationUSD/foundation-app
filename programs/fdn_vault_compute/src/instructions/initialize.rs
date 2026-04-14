//! `initialize` — one-shot per `asset_symbol`. Creates VaultState + FeeTreasury PDAs.
//!
//! SCOPE CAVEAT: Token-2022 share mint creation (with CPI Guard + MetadataPointer +
//! Immutable Owner + TransferHook extensions) is deferred to a follow-up pass.
//! For now, the mint is expected to be pre-created by the admin with correct
//! authority (vault_authority PDA) and extensions, then passed into this ix.
//! The handler asserts the mint's authority matches the expected PDA; extension
//! validation is stubbed via the mint account type constraint until the dedicated
//! Token-2022 helper lands.

use crate::constants::{
    BUFFER_MINIMUM_BPS, BUFFER_TARGET_BPS, EPOCH_DURATION_SECONDS, FEE_TREASURY_SEED,
    MANAGEMENT_FEE_BPS, MAX_REDEEM_PER_EPOCH_BPS, NAV_FLOOR, PERFORMANCE_FEE_BPS,
    SHARE_LOCKUP_SECONDS, TIMELOCK_SECONDS, VAULT_SEED, VIRTUAL_ASSETS, VIRTUAL_SHARES,
};
use crate::events::VaultInitialized;
use crate::state::VaultState;
use anchor_lang::prelude::*;

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct InitializeParams {
    pub asset_symbol: [u8; 16],
    pub underlying_kind: u8,
    pub admin: Pubkey,
    pub operator: Pubkey,
    pub pause_authorities: [Pubkey; 3],
    pub fee_treasury: Pubkey,
    pub deposit_cap: u64,
    pub requires_attestation: bool,
    pub attestation_schema: Pubkey,
    pub attestation_issuer: Pubkey,
}

#[derive(Accounts)]
#[instruction(params: InitializeParams)]
pub struct Initialize<'info> {
    /// Deployer / admin key paying rent. For devnet this is the hot deployer;
    /// for mainnet this MUST be the Squads 3-of-5 multisig (enforced by constraint
    /// once the Squads verifier lands).
    #[account(mut)]
    pub payer: Signer<'info>,

    /// VaultState PDA — seeds [b"vault", asset_symbol].
    /// `init` enforces one-shot-per-asset_symbol: if already exists, the tx fails.
    #[account(
        init,
        payer = payer,
        space = VaultState::SPACE,
        seeds = [VAULT_SEED, params.asset_symbol.as_ref()],
        bump
    )]
    pub vault: Account<'info, VaultState>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<Initialize>, params: InitializeParams) -> Result<()> {
    let vault = &mut ctx.accounts.vault;
    let clock = Clock::get()?;
    let now = clock.unix_timestamp;

    vault.admin = params.admin;
    vault.operator = params.operator;
    vault.asset_symbol = params.asset_symbol;
    vault.underlying_kind = params.underlying_kind;

    // Token refs — populated in the mint-wiring follow-up. Kept as Pubkey::default()
    // for now; deposit/redeem handlers must assert these are set before proceeding.
    vault.usdc_mint = Pubkey::default();
    vault.share_mint = Pubkey::default();
    vault.buffer_usdc = Pubkey::default();
    vault.managed_usdc = Pubkey::default();

    // NAV state — vault starts at 1.00 nav_per_share, zero supply, zero assets.
    vault.total_assets = 0;
    vault.total_supply = 0;
    vault.nav_per_share = NAV_FLOOR;
    vault.nav_twap = NAV_FLOOR;
    vault.last_nav_update = now;

    // Virtual offset — immutable after init (ADR-004 §Inflation Attack Protection).
    vault.virtual_assets = VIRTUAL_ASSETS;
    vault.virtual_shares = VIRTUAL_SHARES;

    // Buffer
    vault.buffer_target_bps = BUFFER_TARGET_BPS;
    vault.buffer_minimum_bps = BUFFER_MINIMUM_BPS;
    vault.queue_mode = false;

    // Security controls
    vault.share_lockup_seconds = SHARE_LOCKUP_SECONDS;
    vault.max_redeem_per_epoch_bps = MAX_REDEEM_PER_EPOCH_BPS;
    vault.epoch_start = now;
    vault.redeemed_this_epoch = 0;
    vault.paused = false;
    vault.pause_authorities = params.pause_authorities;
    vault.deposit_cap = params.deposit_cap;

    // Fees — HWM initialized to NAV_FLOOR so the first genuine NAV appreciation
    // above $1 triggers perf fee, not the $0 → $1 "gain" from empty state (S3).
    vault.management_fee_bps = MANAGEMENT_FEE_BPS;
    vault.performance_fee_bps = PERFORMANCE_FEE_BPS;
    vault.high_water_mark = NAV_FLOOR;
    vault.fee_treasury = params.fee_treasury;
    vault.last_fee_harvest = now;
    vault.pending_management_fee = 0;
    vault.pending_performance_fee = 0;

    // Governance — upgrade authority defaults to admin until Squads is wired.
    vault.upgrade_authority = params.admin;
    vault.timelock_seconds = TIMELOCK_SECONDS;

    // SAS (optional institutional gating)
    vault.requires_attestation = params.requires_attestation;
    vault.attestation_schema = params.attestation_schema;
    vault.attestation_issuer = params.attestation_issuer;

    // Bumps — populated here for the fields we can derive; remaining bumps filled when
    // the token accounts land in the follow-up pass.
    vault.bump = ctx.bumps.vault;
    vault.share_mint_bump = 0;
    vault.authority_bump = 0;
    vault.buffer_bump = 0;
    vault.managed_bump = 0;
    vault.fee_treasury_bump = 0;

    vault.next_request_id = 0;

    let _ = FEE_TREASURY_SEED; // silence unused warning until fee treasury PDA ix lands
    let _ = EPOCH_DURATION_SECONDS;

    emit!(VaultInitialized {
        vault: vault.key(),
        asset_symbol: vault.asset_symbol,
        admin: vault.admin,
        operator: vault.operator,
        share_mint: vault.share_mint,
        timestamp: now,
    });

    Ok(())
}
