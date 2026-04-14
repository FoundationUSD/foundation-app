//! `claim_redeem` — user claims USDC from a Claimable request. ADR-004 §Instructions §6.

use crate::constants::{REDEEM_REQUEST_SEED, VAULT_SEED};
use crate::errors::VaultError;
use crate::state::{RedeemRequest, VaultState};
use anchor_lang::prelude::*;

#[derive(Accounts)]
#[instruction(request_id: u64)]
pub struct ClaimRedeem<'info> {
    pub redeemer: Signer<'info>,

    #[account(
        seeds = [VAULT_SEED, vault.asset_symbol.as_ref()],
        bump = vault.bump,
    )]
    pub vault: Account<'info, VaultState>,

    #[account(
        mut,
        seeds = [
            REDEEM_REQUEST_SEED,
            vault.key().as_ref(),
            redeemer.key().as_ref(),
            &request_id.to_le_bytes(),
        ],
        bump = redeem_request.bump,
        has_one = user @ VaultError::AccountMismatch,
    )]
    pub redeem_request: Account<'info, RedeemRequest>,

    /// Matches `redeem_request.user`. Redundant with `has_one`, kept for Anchor's check.
    /// CHECK: validated by `has_one` above.
    pub user: UncheckedAccount<'info>,
    // TODO: operator-designated fill account, redeemer_usdc (destination), token_program.
}

pub fn handler(_ctx: Context<ClaimRedeem>, _request_id: u64) -> Result<()> {
    // TODO(ADR-004 §claim_redeem):
    //   1. require redeem_request.status == Claimable
    //   2. SPL transfer fill_account → redeemer_usdc (operator-signed fill)
    //   3. redeem_request.status = Completed
    //   4. emit RedeemClaimed
    err!(VaultError::NotImplemented)
}
