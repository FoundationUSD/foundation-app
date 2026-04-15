//! `drain_managed` — operator pulls USDC from the managed PDA for cross-chain
//! deployment (daily 1PM UTC batch). ADR-004 §Instructions §9.
//!
//! Security (ADR-004 §Operator Compromise Containment):
//!   - Destination is passed in as a token account and trusted to be the bridge
//!     source or operator-designated fill account; operator must already have a
//!     destination wallet configured off-chain.
//!   - Operator compromise CAN drain the managed pool — this is acceptable because
//!     those funds were already earmarked for Ethereum deployment. Compromised
//!     operator CANNOT touch buffer_usdc, mint shares, change params, or pause.
//!   - `total_assets` is NOT decremented here: the USDC is still Foundation-owned,
//!     just sitting on Ethereum instead of Solana after the bridge completes.
//!     Decremented only on confirmed loss events (separate admin ix, not yet written).

use crate::access::{require_not_paused, require_operator};
use crate::constants::{MANAGED_USDC_SEED, VAULT_AUTHORITY_SEED, VAULT_SEED};
use crate::errors::VaultError;
use crate::events::ManagedDrained;
use crate::state::VaultState;
use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint as SplMint, Token, TokenAccount as SplTokenAccount};

#[derive(Accounts)]
pub struct DrainManaged<'info> {
    pub operator: Signer<'info>,

    #[account(
        mut,
        seeds = [VAULT_SEED, vault.asset_symbol.as_ref()],
        bump = vault.bump,
        has_one = usdc_mint @ VaultError::AccountMismatch,
        has_one = managed_usdc @ VaultError::AccountMismatch,
    )]
    pub vault: Box<Account<'info, VaultState>>,

    pub usdc_mint: Box<Account<'info, SplMint>>,

    /// CHECK: signer-only PDA; seed-validated.
    #[account(
        seeds = [VAULT_AUTHORITY_SEED, vault.key().as_ref()],
        bump = vault.authority_bump,
    )]
    pub vault_authority: UncheckedAccount<'info>,

    #[account(
        mut,
        seeds = [MANAGED_USDC_SEED, vault.key().as_ref()],
        bump = vault.managed_bump,
    )]
    pub managed_usdc: Box<Account<'info, SplTokenAccount>>,

    /// Destination USDC account — typically the CCTP V2 TokenMessenger burn account
    /// or a Stargate pool account. Operator responsible for supplying the right target.
    #[account(
        mut,
        token::mint = usdc_mint,
    )]
    pub destination: Box<Account<'info, SplTokenAccount>>,

    pub token_program: Program<'info, Token>,
}

pub fn handler(ctx: Context<DrainManaged>, amount: u64) -> Result<()> {
    require_operator(&ctx.accounts.vault, &ctx.accounts.operator.key())?;
    require_not_paused(&ctx.accounts.vault)?;
    require!(amount > 0, VaultError::MathOverflow);
    require!(
        ctx.accounts.managed_usdc.amount >= amount,
        VaultError::BufferInsufficient
    );

    let vault_key = ctx.accounts.vault.key();
    let auth_bump = ctx.accounts.vault.authority_bump;
    let auth_bump_arr = [auth_bump];
    let auth_seeds: &[&[u8]] = &[VAULT_AUTHORITY_SEED, vault_key.as_ref(), &auth_bump_arr];

    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            token::Transfer {
                from: ctx.accounts.managed_usdc.to_account_info(),
                to: ctx.accounts.destination.to_account_info(),
                authority: ctx.accounts.vault_authority.to_account_info(),
            },
            &[auth_seeds],
        ),
        amount,
    )?;

    emit!(ManagedDrained {
        vault: vault_key,
        amount,
        destination: ctx.accounts.destination.key(),
        timestamp: Clock::get()?.unix_timestamp,
    });
    Ok(())
}
