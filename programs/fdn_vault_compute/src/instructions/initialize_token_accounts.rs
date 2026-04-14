//! `initialize_token_accounts` — phase 2 of vault init. Creates the three PDA-owned
//! token accounts that hold vault capital and fees. Must be called AFTER `initialize`
//! because Anchor's `init` on token accounts validates `token::mint` during its
//! pre-handler phase, and the share mint doesn't exist until `initialize` runs.
//!
//! Accounts created:
//!   - `buffer_usdc`   — SPL Token (legacy) USDC, instant-redemption reserve
//!   - `managed_usdc`  — SPL Token (legacy) USDC, pending cross-chain deployment
//!   - `fee_treasury`  — Token-2022 share account, accumulates mgmt + perf fees
//!
//! Permissionless: anyone can pay rent. Idempotent: re-running reverts via
//! `TokenAccountsAlreadySet` (checked on `vault.buffer_usdc != Pubkey::default()`).

use crate::constants::{
    BUFFER_USDC_SEED, FEE_TREASURY_SEED, MANAGED_USDC_SEED, VAULT_AUTHORITY_SEED, VAULT_SEED,
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

    /// Share mint (Token-2022), already created by `initialize`. Read-only here.
    pub share_mint: InterfaceAccount<'info, MintInterface>,

    /// Mint authority / token-account authority PDA. Used as `token::authority` below.
    /// CHECK: signer-only PDA; seed-validated.
    #[account(
        seeds = [VAULT_AUTHORITY_SEED, vault.key().as_ref()],
        bump = vault.authority_bump,
    )]
    pub vault_authority: UncheckedAccount<'info>,

    /// Buffer USDC — instant redemption reserve. Target 15% of TVL.
    #[account(
        init,
        payer = payer,
        token::mint = usdc_mint,
        token::authority = vault_authority,
        seeds = [BUFFER_USDC_SEED, vault.key().as_ref()],
        bump,
    )]
    pub buffer_usdc: Account<'info, TokenAccount>,

    /// Managed USDC — pending cross-chain deployment. Drained daily by batch keeper.
    #[account(
        init,
        payer = payer,
        token::mint = usdc_mint,
        token::authority = vault_authority,
        seeds = [MANAGED_USDC_SEED, vault.key().as_ref()],
        bump,
    )]
    pub managed_usdc: Account<'info, TokenAccount>,

    /// Fee treasury — Token-2022 share account. Accumulates mgmt + perf fees.
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

    pub token_program: Program<'info, Token>,
    pub token_2022: Program<'info, Token2022>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn handler(ctx: Context<InitializeTokenAccounts>) -> Result<()> {
    let vault = &mut ctx.accounts.vault;

    if vault.buffer_usdc != Pubkey::default()
        || vault.managed_usdc != Pubkey::default()
    {
        return err!(VaultError::TokenAccountsAlreadySet);
    }

    vault.buffer_usdc = ctx.accounts.buffer_usdc.key();
    vault.managed_usdc = ctx.accounts.managed_usdc.key();
    // fee_treasury pubkey was set during `initialize` from params; we re-pin it here to
    // the actual PDA now that it exists, so off-chain consumers read the PDA that holds
    // shares rather than a forward-declared address.
    vault.fee_treasury = ctx.accounts.fee_treasury.key();

    vault.buffer_bump = ctx.bumps.buffer_usdc;
    vault.managed_bump = ctx.bumps.managed_usdc;
    vault.fee_treasury_bump = ctx.bumps.fee_treasury;

    Ok(())
}
