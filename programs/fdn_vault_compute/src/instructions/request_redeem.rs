//! `request_redeem` — escrow shares, create RedeemRequest. Used when queue_mode
//! active or instant buffer path insufficient. ADR-004 §Instructions §4.

use crate::constants::{REDEEM_REQUEST_SEED, VAULT_SEED};
use crate::errors::VaultError;
use crate::state::{RedeemRequest, VaultState};
use anchor_lang::prelude::*;

#[derive(Accounts)]
#[instruction(shares: u64)]
pub struct RequestRedeem<'info> {
    #[account(mut)]
    pub redeemer: Signer<'info>,

    #[account(
        mut,
        seeds = [VAULT_SEED, vault.asset_symbol.as_ref()],
        bump = vault.bump,
    )]
    pub vault: Account<'info, VaultState>,

    /// RedeemRequest PDA seeded by (vault, user, next_request_id). Monotonic
    /// counter avoids per-user replay — each request gets a fresh address.
    #[account(
        init,
        payer = redeemer,
        space = RedeemRequest::SPACE,
        seeds = [
            REDEEM_REQUEST_SEED,
            vault.key().as_ref(),
            redeemer.key().as_ref(),
            &vault.next_request_id.to_le_bytes(),
        ],
        bump,
    )]
    pub redeem_request: Account<'info, RedeemRequest>,

    pub system_program: Program<'info, System>,
    // TODO: share_mint, redeemer_share_acct, vault_share_escrow (PDA-owned), token_program.
}

pub fn handler(_ctx: Context<RequestRedeem>, _shares: u64) -> Result<()> {
    // TODO(ADR-004 §request_redeem):
    //   1. require_not_paused
    //   2. assert shares > 0 and redeemer holds >= shares
    //   3. escrow: SPL transfer redeemer_share_acct → vault_share_escrow
    //   4. populate RedeemRequest: vault, user, request_id, shares, request_time, status=Pending
    //   5. vault.next_request_id += 1
    //   6. invariants::enforce
    //   7. emit RedeemRequested
    err!(VaultError::NotImplemented)
}
