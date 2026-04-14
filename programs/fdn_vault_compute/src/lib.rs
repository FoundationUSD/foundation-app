//! fdn_vault_compute — Foundation compute-RWA vault program.
//!
//! Spec: dataroom/solana/ADR-004-vault-architecture.md
//!
//! One program, multi-instance. Each underlying asset gets its own VaultState PDA
//! keyed by `asset_symbol` (e.g. "fdnGAIB", "fdnAI", "fdnAETHIR").

use anchor_lang::prelude::*;

declare_id!("2PLMStk5P2GNKMH3ciK7N62wifwZZL9fmjcef4S7Ezop");

pub mod access;
pub mod constants;
pub mod errors;
pub mod events;
pub mod instructions;
pub mod invariants;
pub mod math;
pub mod rate_limit;
pub mod state;
pub mod token;

pub use instructions::*;

#[program]
pub mod fdn_vault_compute {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>, params: InitializeParams) -> Result<()> {
        instructions::initialize::handler(ctx, params)
    }

    pub fn initialize_token_accounts(ctx: Context<InitializeTokenAccounts>) -> Result<()> {
        instructions::initialize_token_accounts::handler(ctx)
    }

    pub fn deposit(ctx: Context<Deposit>, amount: u64) -> Result<()> {
        instructions::deposit::handler(ctx, amount)
    }

    pub fn redeem(ctx: Context<Redeem>, shares: u64) -> Result<()> {
        instructions::redeem::handler(ctx, shares)
    }

    pub fn request_redeem(ctx: Context<RequestRedeem>, shares: u64) -> Result<()> {
        instructions::request_redeem::handler(ctx, shares)
    }

    pub fn process_withdrawals(
        ctx: Context<ProcessWithdrawals>,
        request_id: u64,
    ) -> Result<()> {
        instructions::process_withdrawals::handler(ctx, request_id)
    }

    pub fn claim_redeem(ctx: Context<ClaimRedeem>, request_id: u64) -> Result<()> {
        instructions::claim_redeem::handler(ctx, request_id)
    }

    pub fn update_nav(
        ctx: Context<UpdateNav>,
        new_nav: u64,
        oracle_proof: Vec<u8>,
    ) -> Result<()> {
        instructions::update_nav::handler(ctx, new_nav, oracle_proof)
    }

    pub fn harvest_fees(ctx: Context<HarvestFees>) -> Result<()> {
        instructions::harvest_fees::handler(ctx)
    }

    pub fn drain_managed(ctx: Context<DrainManaged>, amount: u64) -> Result<()> {
        instructions::drain_managed::handler(ctx, amount)
    }

    pub fn pause(ctx: Context<Pause>) -> Result<()> {
        instructions::pause::handler(ctx)
    }

    pub fn unpause(ctx: Context<Unpause>) -> Result<()> {
        instructions::unpause::handler(ctx)
    }
}
