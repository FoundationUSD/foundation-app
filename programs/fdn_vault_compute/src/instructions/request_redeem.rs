//! `request_redeem` — escrow shares, create RedeemRequest. ADR-004 §Instructions §4.
//!
//! Used when buffer is insufficient for instant `redeem` or when `queue_mode = true`.
//! Flow:
//!   1. require_not_paused
//!   2. require share_lockup.locked_until <= now
//!      (Escrow transfer triggers the hook; hook enforces source lockup. So a user
//!       within their 24h lockup cannot even queue. This matches ADR-004 literally —
//!       the queue path is for post-lockup redemptions that hit a liquidity-thin
//!       buffer, not for bypassing the arb shield.)
//!   3. assert shares > 0 and redeemer holds >= shares
//!   4. Token-2022 transfer: redeemer_share_acct → redeem_escrow (redeemer signs)
//!   5. populate RedeemRequest: vault, user, request_id = vault.next_request_id,
//!      shares, request_time = now, status = Pending
//!   6. vault.next_request_id += 1
//!   7. emit RedeemRequested
//!
//! Note on supply/asset accounting: shares are NOT burned here — they're escrowed.
//! Actual burn + total_supply/total_assets decrement happens in `process_withdrawals`
//! when the operator has USDC available to fulfill the request.

use crate::access::require_not_paused;
use crate::constants::{
    REDEEM_ESCROW_SEED, REDEEM_REQUEST_SEED, SHARE_LOCKUP_SEED, VAULT_SEED,
};
use crate::errors::VaultError;
use crate::events::RedeemRequested;
use crate::state::{RedeemRequest, RedeemStatus, ShareLockup, VaultState};
use anchor_lang::prelude::*;
use anchor_spl::token_2022::Token2022;
use anchor_spl::token_interface::{
    self, Mint as MintInterface, TokenAccount as TokenAccountInterface,
};

#[derive(Accounts)]
#[instruction(shares: u64)]
pub struct RequestRedeem<'info> {
    #[account(mut)]
    pub redeemer: Signer<'info>,

    #[account(
        mut,
        seeds = [VAULT_SEED, vault.asset_symbol.as_ref()],
        bump = vault.bump,
        has_one = share_mint @ VaultError::AccountMismatch,
        has_one = redeem_escrow @ VaultError::AccountMismatch,
    )]
    pub vault: Account<'info, VaultState>,

    #[account(
        seeds = [SHARE_LOCKUP_SEED, vault.key().as_ref(), redeemer.key().as_ref()],
        bump = share_lockup.bump,
    )]
    pub share_lockup: Account<'info, ShareLockup>,

    /// Fresh RedeemRequest at seeds [b"redeem_request", vault, user, next_request_id].
    /// Monotonic request_id means each request gets a unique PDA.
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

    #[account(mut)]
    pub share_mint: InterfaceAccount<'info, MintInterface>,

    #[account(
        mut,
        token::token_program = token_2022,
        token::mint = share_mint,
        token::authority = redeemer,
    )]
    pub redeemer_share_acct: InterfaceAccount<'info, TokenAccountInterface>,

    #[account(
        mut,
        seeds = [REDEEM_ESCROW_SEED, vault.key().as_ref()],
        bump = vault.redeem_escrow_bump,
    )]
    pub redeem_escrow: InterfaceAccount<'info, TokenAccountInterface>,

    pub token_2022: Program<'info, Token2022>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<RequestRedeem>, shares: u64) -> Result<()> {
    let clock = Clock::get()?;
    let now = clock.unix_timestamp;
    let vault_key = ctx.accounts.vault.key();
    let redeemer_key = ctx.accounts.redeemer.key();

    // Access checks ────────────────────────────────────────────────────────────
    require_not_paused(&ctx.accounts.vault)?;
    require!(shares > 0, VaultError::MathOverflow);
    // Lockup must be expired — the Token-2022 transfer hook will enforce this at the
    // CPI level anyway. We pre-check here for a cleaner error message.
    require!(
        ctx.accounts.share_lockup.locked_until <= now,
        VaultError::LockupActive
    );

    // Escrow: transfer shares redeemer → redeem_escrow. Transfer hook fires and
    // verifies source lockup (already checked above).
    // NOTE: use `transfer_checked` on Token-2022 because the transfer-hook extension
    // requires decimals to be verified — regular `transfer` returns UnsupportedMethod
    // on mints with TransferHook per Token-2022 spec.
    token_interface::transfer_checked(
        CpiContext::new(
            ctx.accounts.token_2022.to_account_info(),
            token_interface::TransferChecked {
                from: ctx.accounts.redeemer_share_acct.to_account_info(),
                mint: ctx.accounts.share_mint.to_account_info(),
                to: ctx.accounts.redeem_escrow.to_account_info(),
                authority: ctx.accounts.redeemer.to_account_info(),
            },
        ),
        shares,
        ctx.accounts.share_mint.decimals,
    )?;

    // RedeemRequest state ──────────────────────────────────────────────────────
    let req_id = ctx.accounts.vault.next_request_id;
    let request = &mut ctx.accounts.redeem_request;
    request.vault = vault_key;
    request.user = redeemer_key;
    request.request_id = req_id;
    request.shares = shares;
    request.request_time = now;
    request.status = RedeemStatus::Pending as u8;
    request.fill_amount = 0;
    request.bump = ctx.bumps.redeem_request;

    ctx.accounts.vault.next_request_id = ctx
        .accounts
        .vault
        .next_request_id
        .checked_add(1)
        .ok_or(VaultError::MathOverflow)?;

    emit!(RedeemRequested {
        vault: vault_key,
        user: redeemer_key,
        request_id: req_id,
        shares,
        timestamp: now,
    });
    Ok(())
}
