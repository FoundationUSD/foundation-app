//! `drain_managed` — operator pulls USDC from the managed PDA for cross-chain
//! deployment (daily 1PM UTC batch). ADR-004 §Instructions §9.
//!
//! Security: destination is operator-controlled but permissionless caller is blocked
//! by `require_operator`. The drain is safe because:
//!   - Buffer USDC is NOT touched — only the managed pool, which was already earmarked
//!     for Ethereum deployment.
//!   - Operator compromise CAN drain managed, but cannot mint shares or move buffer.
//!     Blast radius matches ADR-004 §Operator Compromise Containment.

use crate::access::require_operator;
use crate::constants::VAULT_SEED;
use crate::errors::VaultError;
use crate::state::VaultState;
use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct DrainManaged<'info> {
    pub operator: Signer<'info>,

    #[account(
        mut,
        seeds = [VAULT_SEED, vault.asset_symbol.as_ref()],
        bump = vault.bump,
    )]
    pub vault: Account<'info, VaultState>,
    // TODO: managed_usdc (source), bridge source account (destination),
    // vault_authority PDA, token_program.
}

pub fn handler(ctx: Context<DrainManaged>, _amount: u64) -> Result<()> {
    require_operator(&ctx.accounts.vault, &ctx.accounts.operator.key())?;
    // TODO(ADR-004 §drain_managed):
    //   1. require_not_paused
    //   2. assert amount <= managed_balance
    //   3. SPL transfer managed_usdc → bridge destination (vault_authority signs)
    //   4. NOTE: total_assets is NOT decremented here — the USDC is still "ours",
    //      just sitting on Ethereum instead of Solana. Decremented only on loss events.
    //   5. invariants::enforce (I2 will tighten as buffer+managed shrinks)
    //   6. emit ManagedDrained
    err!(VaultError::NotImplemented)
}
