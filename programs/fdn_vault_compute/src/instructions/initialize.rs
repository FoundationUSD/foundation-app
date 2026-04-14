//! `initialize` — one-shot per `asset_symbol`. Creates VaultState PDA + Token-2022
//! share mint with MetadataPointer + TransferHook extensions. ADR-004 §Instructions §1.
//!
//! What THIS ix does:
//!   - Creates VaultState at seeds `[b"vault", asset_symbol]`
//!   - Creates share mint at seeds `[b"share_mint", vault]` with extensions
//!   - Stores mint authority = `vault_authority` PDA (seeds `[b"vault_authority", vault]`)
//!   - Populates virtual offset, HWM at NAV_FLOOR, buffer params, fee params, SAS fields
//!
//! What a SEPARATE `initialize_token_accounts` ix handles (not yet implemented):
//!   - Creates buffer_usdc, managed_usdc, fee_treasury PDA-owned token accounts
//!     (these require the share mint to exist first, so Anchor can validate `token::mint`
//!     during its pre-handler account validation phase — can't do in same ix as mint creation)

use crate::constants::{
    BUFFER_MINIMUM_BPS, BUFFER_TARGET_BPS, FDN_TRANSFER_HOOK_PROGRAM_ID,
    MANAGEMENT_FEE_BPS, MAX_REDEEM_PER_EPOCH_BPS, NAV_FLOOR, PERFORMANCE_FEE_BPS,
    SHARE_LOCKUP_SECONDS, SHARE_MINT_SEED, TIMELOCK_SECONDS, VAULT_AUTHORITY_SEED,
    VAULT_SEED, VIRTUAL_ASSETS, VIRTUAL_SHARES,
};
use crate::errors::VaultError;
use crate::events::VaultInitialized;
use crate::state::VaultState;
use crate::token::create_share_mint;
use anchor_lang::prelude::*;
use anchor_spl::token::Mint;
use anchor_spl::token_2022::Token2022;

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
    /// Deployer paying rent. Devnet: hot deployer. Mainnet: Squads 3-of-5.
    #[account(mut)]
    pub payer: Signer<'info>,

    /// VaultState PDA — one-shot-per-asset_symbol via `init`.
    #[account(
        init,
        payer = payer,
        space = VaultState::SPACE,
        seeds = [VAULT_SEED, params.asset_symbol.as_ref()],
        bump,
    )]
    pub vault: Account<'info, VaultState>,

    /// Share mint — Token-2022 PDA, created in handler via `create_share_mint` helper.
    /// Marked `mut` so the system-program `create_account` CPI can write to it.
    /// CHECK: ownership + extension validation handled by Token-2022 program during CPI.
    #[account(
        mut,
        seeds = [SHARE_MINT_SEED, vault.key().as_ref()],
        bump,
    )]
    pub share_mint: UncheckedAccount<'info>,

    /// Mint authority PDA. No data; pure signer. Derived but not created (rent-free).
    /// CHECK: used only as `invoke_signed` signer. Seed-validated.
    #[account(
        seeds = [VAULT_AUTHORITY_SEED, vault.key().as_ref()],
        bump,
    )]
    pub vault_authority: UncheckedAccount<'info>,

    /// USDC mint reference (SPL Token legacy, not Token-2022). Stored in VaultState
    /// so deposit/redeem can validate against it.
    pub usdc_mint: Account<'info, Mint>,

    /// `fdn_transfer_hook` program. Recorded on the share mint's TransferHook
    /// extension so every share transfer dispatches to the 24h lockup enforcer.
    /// CHECK: address pinned at runtime via the `constraint` below.
    #[account(
        constraint = transfer_hook_program.key() == FDN_TRANSFER_HOOK_PROGRAM_ID
            @ VaultError::TransferHookMismatch,
    )]
    pub transfer_hook_program: UncheckedAccount<'info>,

    pub token_2022: Program<'info, Token2022>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn handler(ctx: Context<Initialize>, params: InitializeParams) -> Result<()> {
    let vault_key = ctx.accounts.vault.key();
    let clock = Clock::get()?;
    let now = clock.unix_timestamp;

    // ── Phase 1: create the Token-2022 share mint with extensions ──────────────
    let share_mint_bump = ctx.bumps.share_mint;
    let bump_arr = [share_mint_bump];
    let mint_signer_seeds: &[&[u8]] = &[SHARE_MINT_SEED, vault_key.as_ref(), &bump_arr];

    create_share_mint(
        &ctx.accounts.payer.to_account_info(),
        &ctx.accounts.share_mint.to_account_info(),
        &ctx.accounts.vault_authority.key(),
        &ctx.accounts.transfer_hook_program.key(),
        None, // metadata_address — populated later via a dedicated `publish_metadata` ix
        &ctx.accounts.token_2022.to_account_info(),
        &ctx.accounts.system_program.to_account_info(),
        mint_signer_seeds,
    )?;

    // ── Phase 2: populate VaultState ───────────────────────────────────────────
    let vault = &mut ctx.accounts.vault;

    // Identity
    vault.admin = params.admin;
    vault.operator = params.operator;
    vault.asset_symbol = params.asset_symbol;
    vault.underlying_kind = params.underlying_kind;

    // Token refs
    vault.usdc_mint = ctx.accounts.usdc_mint.key();
    vault.share_mint = ctx.accounts.share_mint.key();
    // buffer/managed/fee_treasury token accounts are created in a follow-up ix and
    // stored there. Leave zeroed; deposit/redeem handlers MUST assert these are set.
    vault.buffer_usdc = Pubkey::default();
    vault.managed_usdc = Pubkey::default();

    // NAV
    vault.total_assets = 0;
    vault.total_supply = 0;
    vault.nav_per_share = NAV_FLOOR;
    vault.nav_twap = NAV_FLOOR;
    vault.last_nav_update = now;

    // Virtual offset — immutable from here (ADR-004 §Inflation Attack Protection)
    vault.virtual_assets = VIRTUAL_ASSETS;
    vault.virtual_shares = VIRTUAL_SHARES;

    // Buffer
    vault.buffer_target_bps = BUFFER_TARGET_BPS;
    vault.buffer_minimum_bps = BUFFER_MINIMUM_BPS;
    vault.queue_mode = false;

    // Security
    vault.share_lockup_seconds = SHARE_LOCKUP_SECONDS;
    vault.max_redeem_per_epoch_bps = MAX_REDEEM_PER_EPOCH_BPS;
    vault.epoch_start = now;
    vault.redeemed_this_epoch = 0;
    vault.paused = false;
    vault.pause_authorities = params.pause_authorities;
    vault.deposit_cap = params.deposit_cap;

    // Fees — HWM seeded at NAV_FLOOR so first genuine appreciation above $1 is the
    // only thing that triggers perf fee (fixes security finding S3).
    vault.management_fee_bps = MANAGEMENT_FEE_BPS;
    vault.performance_fee_bps = PERFORMANCE_FEE_BPS;
    vault.high_water_mark = NAV_FLOOR;
    vault.fee_treasury = params.fee_treasury;
    vault.last_fee_harvest = now;
    vault.pending_management_fee = 0;
    vault.pending_performance_fee = 0;

    // Governance — on devnet, upgrade authority defaults to admin. Mainnet initialize
    // MUST pass Squads multisig as admin → upgrade authority becomes the Squads pubkey.
    vault.upgrade_authority = params.admin;
    vault.timelock_seconds = TIMELOCK_SECONDS;

    // SAS (optional institutional gating) — off by default.
    vault.requires_attestation = params.requires_attestation;
    vault.attestation_schema = params.attestation_schema;
    vault.attestation_issuer = params.attestation_issuer;

    // Bumps
    vault.bump = ctx.bumps.vault;
    vault.share_mint_bump = share_mint_bump;
    vault.authority_bump = ctx.bumps.vault_authority;
    vault.buffer_bump = 0; // set in initialize_token_accounts
    vault.managed_bump = 0;
    vault.fee_treasury_bump = 0;

    vault.next_request_id = 0;

    emit!(VaultInitialized {
        vault: vault_key,
        asset_symbol: vault.asset_symbol,
        admin: vault.admin,
        operator: vault.operator,
        share_mint: vault.share_mint,
        timestamp: now,
    });

    Ok(())
}
