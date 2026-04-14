//! `initialize_token_accounts` — phase 2 of vault init. Creates all PDA-owned token
//! accounts that hold vault capital, fees, escrowed shares, and pending claim USDC.
//! Must be called AFTER `initialize` because Anchor's `init` on token accounts
//! validates `token::mint` pre-handler; the share mint doesn't exist until `initialize`
//! has run.
//!
//! Accounts created (5 total):
//!   - `buffer_usdc`         — SPL Token USDC, instant-redemption reserve
//!   - `managed_usdc`        — SPL Token USDC, pending cross-chain deployment
//!   - `fee_treasury`        — Token-2022 share account, accumulates mgmt + perf fees
//!   - `redeem_escrow`       — Token-2022 share account, holds escrowed shares
//!                             awaiting burn in `process_withdrawals`
//!   - `pending_claims_usdc` — SPL Token USDC, holds fulfilled redemption USDC
//!                             awaiting user `claim_redeem` pickup
//!
//! Permissionless + idempotent.

use crate::constants::{
    BUFFER_USDC_SEED, FEE_TREASURY_SEED, MANAGED_USDC_SEED, PENDING_CLAIMS_SEED,
    REDEEM_ESCROW_SEED, VAULT_AUTHORITY_SEED, VAULT_SEED,
};
use crate::errors::VaultError;
use crate::state::VaultState;
use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};
use anchor_spl::token_2022::Token2022;
use anchor_spl::token_interface::{Mint as MintInterface, TokenAccount as TokenAccountInterface};

#[derive(Accounts)]
pub struct InitializeTokenAccounts<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(
        mut,
        seeds = [VAULT_SEED, vault.asset_symbol.as_ref()],
        bump = vault.bump,
        has_one = usdc_mint @ VaultError::AccountMismatch,
        has_one = share_mint @ VaultError::AccountMismatch,
    )]
    pub vault: Account<'info, VaultState>,

    pub usdc_mint: Account<'info, Mint>,

    pub share_mint: InterfaceAccount<'info, MintInterface>,

    /// CHECK: signer-only PDA; seed-validated.
    #[account(
        seeds = [VAULT_AUTHORITY_SEED, vault.key().as_ref()],
        bump = vault.authority_bump,
    )]
    pub vault_authority: UncheckedAccount<'info>,

    #[account(
        init,
        payer = payer,
        token::mint = usdc_mint,
        token::authority = vault_authority,
        seeds = [BUFFER_USDC_SEED, vault.key().as_ref()],
        bump,
    )]
    pub buffer_usdc: Account<'info, TokenAccount>,

    #[account(
        init,
        payer = payer,
        token::mint = usdc_mint,
        token::authority = vault_authority,
        seeds = [MANAGED_USDC_SEED, vault.key().as_ref()],
        bump,
    )]
    pub managed_usdc: Account<'info, TokenAccount>,

    #[account(
        init,
        payer = payer,
        token::mint = share_mint,
        token::authority = vault_authority,
        token::token_program = token_2022,
        seeds = [FEE_TREASURY_SEED, vault.key().as_ref()],
        bump,
    )]
    pub fee_treasury: InterfaceAccount<'info, TokenAccountInterface>,

    /// Shares escrowed during `request_redeem`, burned during `process_withdrawals`.
    #[account(
        init,
        payer = payer,
        token::mint = share_mint,
        token::authority = vault_authority,
        token::token_program = token_2022,
        seeds = [REDEEM_ESCROW_SEED, vault.key().as_ref()],
        bump,
    )]
    pub redeem_escrow: InterfaceAccount<'info, TokenAccountInterface>,

    /// USDC set aside during `process_withdrawals`, withdrawn in `claim_redeem`.
    /// Separating this from `buffer_usdc` ensures fulfilled redemptions can't be
    /// front-run-drained by subsequent instant redeems.
    #[account(
        init,
        payer = payer,
        token::mint = usdc_mint,
        token::authority = vault_authority,
        seeds = [PENDING_CLAIMS_SEED, vault.key().as_ref()],
        bump,
    )]
    pub pending_claims_usdc: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub token_2022: Program<'info, Token2022>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn handler(ctx: Context<InitializeTokenAccounts>) -> Result<()> {
    let vault = &mut ctx.accounts.vault;

    if vault.buffer_usdc != Pubkey::default() || vault.managed_usdc != Pubkey::default() {
        return err!(VaultError::TokenAccountsAlreadySet);
    }

    vault.buffer_usdc = ctx.accounts.buffer_usdc.key();
    vault.managed_usdc = ctx.accounts.managed_usdc.key();
    vault.fee_treasury = ctx.accounts.fee_treasury.key();
    vault.redeem_escrow = ctx.accounts.redeem_escrow.key();
    vault.pending_claims_usdc = ctx.accounts.pending_claims_usdc.key();

    vault.buffer_bump = ctx.bumps.buffer_usdc;
    vault.managed_bump = ctx.bumps.managed_usdc;
    vault.fee_treasury_bump = ctx.bumps.fee_treasury;
    vault.redeem_escrow_bump = ctx.bumps.redeem_escrow;
    vault.pending_claims_bump = ctx.bumps.pending_claims_usdc;

    Ok(())
}
