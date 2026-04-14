//! `process_withdrawals` — operator batches up to 10 pending RedeemRequests,
//! burns locked shares, fulfills USDC. ADR-004 §Instructions §5.

use crate::access::require_operator;
use crate::constants::{MAX_WITHDRAWALS_PER_BATCH, VAULT_SEED};
use crate::errors::VaultError;
use crate::state::VaultState;
use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct ProcessWithdrawals<'info> {
    pub operator: Signer<'info>,

    #[account(
        mut,
        seeds = [VAULT_SEED, vault.asset_symbol.as_ref()],
        bump = vault.bump,
    )]
    pub vault: Account<'info, VaultState>,
    // TODO: RedeemRequest accounts passed via remaining_accounts (up to 10), plus
    // share_mint, vault_share_escrow, buffer_usdc, managed_usdc, fill target accts.
}

pub fn handler(ctx: Context<ProcessWithdrawals>, request_ids: Vec<u64>) -> Result<()> {
    require_operator(&ctx.accounts.vault, &ctx.accounts.operator.key())?;
    if request_ids.len() > MAX_WITHDRAWALS_PER_BATCH {
        return err!(VaultError::BatchTooLarge);
    }
    // TODO(ADR-004 §process_withdrawals):
    //   For each request_id (resolved from remaining_accounts):
    //     - require status == Pending
    //     - assets = math::shares_to_assets(request.shares, total_assets, total_supply)
    //     - SPL burn escrowed shares
    //     - SPL transfer buffer/managed → operator-designated fill account
    //     - request.status = Claimable; request.fill_amount = assets
    //     - total_assets -= assets; total_supply -= request.shares
    //   invariants::enforce at the end
    //   emit WithdrawalsProcessed
    err!(VaultError::NotImplemented)
}
