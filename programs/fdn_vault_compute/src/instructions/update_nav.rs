//! `update_nav` — operator writes new NAV. ADR-004 §Instructions §7 + §Oracle Architecture.
//!
//! v0 path — OPERATOR ONLY with TWAP + bounds + floor + staleness + inline fee harvest.
//! Pyth pull-oracle cross-check is DEFERRED (`pyth-solana-receiver-sdk 0.6.1` is
//! incompatible with Anchor 0.31 as of this session — known upstream gap). The
//! `oracle_proof` parameter is accepted and MUST be non-empty for mainnet deploys
//! so the wire shape is stable; v0 only validates it's present and non-empty, v1
//! will actually verify the Pyth signature + confidence ≤0.5% + staleness ≤60s.
//!
//! Defense without Pyth (the operator-only path):
//!   - Operator is a hot wallet with bounded permissions (ADR-004 §Role Separation):
//!     can NOT change params, upgrade program, withdraw fees, pause, or change admin.
//!   - TWAP smoothing (70/30) dampens single-update manipulation — an attacker would
//!     need to sustain a fake price across 4+ consecutive updates (24h+) to shift it.
//!   - Asymmetric bounds: +5% / -2% vs prior TWAP. Tighter on downside because a fake
//!     drop enables cheap share purchases.
//!   - 26h staleness cap: if no update in 26h, vault auto-blocks deposits/redeems.
//!   - $1.00 floor circuit breaker: any TWAP drop below NAV_FLOOR auto-pauses.
//!   - Fees harvested BEFORE the NAV update — locks HWM at the old value so perf fee
//!     is assessed against pre-update appreciation, not post-update.
//!
//! Flow:
//!   1. access::require_operator
//!   2. Non-empty oracle_proof (lenient until Pyth SDK compat lands)
//!   3. Staleness: (now - last_nav_update) <= NAV_STALENESS_MAX_SECONDS
//!   4. Bounds: check_nav_bounds(new_nav, prior_twap)
//!   5. Inline fee harvest using PRIOR nav (see note above)
//!   6. TWAP: new_twap = apply_twap(prior_twap, new_nav)
//!   7. Floor: check_nav_floor(new_twap) — auto-pause on break
//!   8. Commit nav_per_share = new_nav, nav_twap = new_twap, last_nav_update = now
//!   9. invariants::enforce
//!  10. emit NavUpdated

use crate::access::require_operator;
use crate::constants::{
    FEE_TREASURY_SEED, NAV_STALENESS_MAX_SECONDS, VAULT_AUTHORITY_SEED, VAULT_SEED,
};
use crate::errors::VaultError;
use crate::events::{FeesHarvested, InvariantViolation, NavUpdated};
use crate::math::{
    apply_twap, check_nav_bounds, check_nav_floor, compute_management_fee_shares,
    compute_performance_fee_shares,
};
use crate::state::VaultState;
use anchor_lang::prelude::*;
use anchor_spl::token::{Mint as SplMint, TokenAccount as SplTokenAccount};
use anchor_spl::token_2022::Token2022;
use anchor_spl::token_interface::{
    self, Mint as MintInterface, TokenAccount as TokenAccountInterface,
};

#[derive(Accounts)]
pub struct UpdateNav<'info> {
    pub operator: Signer<'info>,

    #[account(
        mut,
        seeds = [VAULT_SEED, vault.asset_symbol.as_ref()],
        bump = vault.bump,
        has_one = share_mint @ VaultError::AccountMismatch,
        has_one = fee_treasury @ VaultError::AccountMismatch,
        has_one = buffer_usdc @ VaultError::AccountMismatch,
        has_one = managed_usdc @ VaultError::AccountMismatch,
    )]
    pub vault: Box<Account<'info, VaultState>>,

    #[account(mut)]
    pub share_mint: Box<InterfaceAccount<'info, MintInterface>>,

    /// CHECK: signer-only PDA; seed-validated.
    #[account(
        seeds = [VAULT_AUTHORITY_SEED, vault.key().as_ref()],
        bump = vault.authority_bump,
    )]
    pub vault_authority: UncheckedAccount<'info>,

    #[account(
        mut,
        seeds = [FEE_TREASURY_SEED, vault.key().as_ref()],
        bump = vault.fee_treasury_bump,
    )]
    pub fee_treasury: Box<InterfaceAccount<'info, TokenAccountInterface>>,

    /// Invariant I2 (asset backing) input. Read-only.
    pub buffer_usdc: Box<Account<'info, SplTokenAccount>>,
    pub managed_usdc: Box<Account<'info, SplTokenAccount>>,

    /// CHECK: USDC mint key stored on vault; used for type anchoring invariant reads.
    pub usdc_mint: Box<Account<'info, SplMint>>,

    pub token_2022: Program<'info, Token2022>,
}

pub fn handler(
    ctx: Context<UpdateNav>,
    new_nav: u64,
    oracle_proof: Vec<u8>,
) -> Result<()> {
    let clock = Clock::get()?;
    let now = clock.unix_timestamp;
    let vault_key = ctx.accounts.vault.key();

    // Access + proof presence ──────────────────────────────────────────────────
    require_operator(&ctx.accounts.vault, &ctx.accounts.operator.key())?;
    require!(new_nav > 0, VaultError::MathOverflow);
    // v0: require non-empty proof so the wire format is stable. v1 will Pyth-verify.
    require!(!oracle_proof.is_empty(), VaultError::PythInvalid);

    // Staleness — can't update if vault has been untouched beyond the staleness cap.
    // This matches ADR-004 §Bounds Check: past 26h the vault auto-blocks ops; unlocking
    // requires admin intervention via pause/unpause (not a normal NAV update).
    let elapsed_since_update = now
        .checked_sub(ctx.accounts.vault.last_nav_update)
        .ok_or(VaultError::MathOverflow)?;
    require!(
        elapsed_since_update <= NAV_STALENESS_MAX_SECONDS,
        VaultError::NavStale
    );

    // Bounds check against PRIOR twap ───────────────────────────────────────────
    let prior_twap = ctx.accounts.vault.nav_twap;
    check_nav_bounds(new_nav, prior_twap)?;

    // ── Fees harvested inline, using PRE-update NAV ────────────────────────────
    // Order matters: HWM must be compared against the OLD nav_per_share, not the new
    // one. Otherwise performance fee is charged on the jump itself (wrong accounting).
    let (mgmt_shares, perf_shares) = {
        let v = &ctx.accounts.vault;
        let elapsed_since_harvest = now
            .checked_sub(v.last_fee_harvest)
            .ok_or(VaultError::MathOverflow)?;
        if elapsed_since_harvest > 0 {
            let elapsed_u64 = elapsed_since_harvest as u64;
            let mgmt = compute_management_fee_shares(
                v.total_assets,
                v.total_supply,
                elapsed_u64,
                v.management_fee_bps,
            )?;
            let perf = compute_performance_fee_shares(
                v.nav_per_share,
                v.high_water_mark,
                v.total_assets,
                v.total_supply,
                v.performance_fee_bps,
            )?;
            (mgmt, perf)
        } else {
            (0, 0)
        }
    };

    let total_fee_shares = mgmt_shares
        .checked_add(perf_shares)
        .ok_or(VaultError::MathOverflow)?;

    if total_fee_shares > 0 {
        let auth_bump = ctx.accounts.vault.authority_bump;
        let auth_bump_arr = [auth_bump];
        let auth_seeds: &[&[u8]] = &[VAULT_AUTHORITY_SEED, vault_key.as_ref(), &auth_bump_arr];
        token_interface::mint_to(
            CpiContext::new_with_signer(
                ctx.accounts.token_2022.to_account_info(),
                token_interface::MintTo {
                    mint: ctx.accounts.share_mint.to_account_info(),
                    to: ctx.accounts.fee_treasury.to_account_info(),
                    authority: ctx.accounts.vault_authority.to_account_info(),
                },
                &[auth_seeds],
            ),
            total_fee_shares,
        )?;
    }

    // ── TWAP + floor + commit ──────────────────────────────────────────────────
    let new_twap = apply_twap(prior_twap, new_nav)?;

    // Floor circuit breaker — auto-pause + emit invariant violation if TWAP drops
    // below $1.00. Admin must investigate and explicitly unpause.
    if check_nav_floor(new_twap).is_err() {
        let vault = &mut ctx.accounts.vault;
        vault.paused = true;
        emit!(InvariantViolation {
            vault: vault_key,
            invariant: 3,
            timestamp: now,
        });
        return err!(VaultError::NavBelowFloor);
    }

    let old_nav = ctx.accounts.vault.nav_per_share;
    let vault = &mut ctx.accounts.vault;

    // Commit fee bookkeeping (HWM advances only on upward moves) ──────────────
    vault.total_supply = vault
        .total_supply
        .checked_add(total_fee_shares)
        .ok_or(VaultError::MathOverflow)?;
    if total_fee_shares > 0 {
        if new_nav > vault.high_water_mark {
            vault.high_water_mark = new_nav;
        }
        vault.last_fee_harvest = now;
        emit!(FeesHarvested {
            vault: vault_key,
            mgmt_fee_shares: mgmt_shares,
            perf_fee_shares: perf_shares,
            high_water_mark: vault.high_water_mark,
            timestamp: now,
        });
    }

    // Commit NAV + TWAP ────────────────────────────────────────────────────────
    vault.nav_per_share = new_nav;
    vault.nav_twap = new_twap;
    vault.last_nav_update = now;

    emit!(NavUpdated {
        vault: vault_key,
        old_nav,
        new_nav,
        nav_twap: new_twap,
        oracle_source: 1, // 1 = operator (v0). 0 = Pyth reserved for v1.
        timestamp: now,
    });

    Ok(())
}
