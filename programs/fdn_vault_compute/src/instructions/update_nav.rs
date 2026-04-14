//! `update_nav` — operator writes new NAV. ADR-004 §Instructions §7.
//!
//! Validation layers (all must pass):
//!   1. Pyth pull-oracle proof valid + confidence ≤0.5% + staleness ≤60s
//!   2. Submitted `new_nav` within ±1% of Pyth-derived price
//!   3. Apply TWAP smoothing (70/30)
//!   4. Smoothed NAV within +5%/-2% bounds of prior TWAP
//!   5. NAV >= $1.00 floor (circuit breaker if below)
//!   6. Prior NAV ≤ 26h stale (else reject — operator must unfreeze via admin path)
//!   7. Harvest fees BEFORE updating NAV (locks HWM reference at old value)

use crate::access::require_operator;
use crate::constants::VAULT_SEED;
use crate::errors::VaultError;
use crate::state::VaultState;
use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct UpdateNav<'info> {
    pub operator: Signer<'info>,

    #[account(
        mut,
        seeds = [VAULT_SEED, vault.asset_symbol.as_ref()],
        bump = vault.bump,
    )]
    pub vault: Account<'info, VaultState>,
    // TODO: pyth_price_update account (PriceUpdateV2 from pyth-solana-receiver-sdk once
    // the Anchor 0.31-compatible version is available), fee_treasury, share_mint.
}

pub fn handler(
    ctx: Context<UpdateNav>,
    _new_nav: u64,
    _oracle_proof: Vec<u8>,
) -> Result<()> {
    require_operator(&ctx.accounts.vault, &ctx.accounts.operator.key())?;
    // TODO(ADR-004 §update_nav):
    //   1. Validate Pyth proof from price_update account
    //   2. Cross-check new_nav within ±1% of Pyth price
    //   3. new_twap = math::apply_twap(vault.nav_twap, new_nav)
    //   4. math::check_nav_bounds(new_nav, vault.nav_twap)
    //   5. math::check_nav_floor(new_twap) — auto-pause + InvariantViolation if below
    //   6. assert (now - vault.last_nav_update) <= NAV_STALENESS_MAX_SECONDS
    //   7. harvest_fees::handler (inline call)
    //   8. vault.nav_per_share = new_nav; vault.nav_twap = new_twap; vault.last_nav_update = now
    //   9. invariants::enforce
    //  10. emit NavUpdated
    err!(VaultError::NotImplemented)
}
