//! `harvest_fees` — mgmt (0.5% annual) + perf (10% above HWM), minted as shares
//! to the fee treasury. ADR-004 §Fee Architecture.

use crate::constants::VAULT_SEED;
use crate::errors::VaultError;
use crate::state::VaultState;
use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct HarvestFees<'info> {
    /// Permissionless: anyone can trigger a fee harvest. Fees always flow to the
    /// vault's fee_treasury PDA, never to the caller, so griefing cost = tx fee and
    /// the upside is that harvest happens promptly at NAV updates.
    pub caller: Signer<'info>,

    #[account(
        mut,
        seeds = [VAULT_SEED, vault.asset_symbol.as_ref()],
        bump = vault.bump,
    )]
    pub vault: Account<'info, VaultState>,
    // TODO: share_mint (mint authority CPI), fee_treasury token account, token_program.
}

pub fn handler(_ctx: Context<HarvestFees>) -> Result<()> {
    // TODO(ADR-004 §harvest_fees):
    //   1. elapsed = now - vault.last_fee_harvest
    //   2. mgmt_shares = math::compute_management_fee_shares(...)
    //   3. perf_shares = math::compute_performance_fee_shares(...)
    //   4. SPL mint (mgmt_shares + perf_shares) to fee_treasury (vault_authority signs)
    //   5. vault.total_supply += (mgmt + perf)
    //   6. if nav_per_share > HWM: vault.high_water_mark = nav_per_share
    //   7. vault.last_fee_harvest = now
    //   8. emit FeesHarvested
    err!(VaultError::NotImplemented)
}
