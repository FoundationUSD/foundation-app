//! Instruction contexts. Account validation will be filled in Week 1 implementation.
//! See ADR-004 §Instructions for required signers, PDAs, and constraints.

use anchor_lang::prelude::*;

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct InitializeParams {
    pub asset_symbol: [u8; 16],
    pub underlying_kind: u8,
    pub admin: Pubkey,
    pub operator: Pubkey,
    pub pause_authorities: [Pubkey; 3],
    pub fee_treasury: Pubkey,
    pub deposit_cap: u64,
    pub requires_attestation: bool,
    pub attestation_schema: Pubkey,
    pub attestation_issuer: Pubkey,
}

#[derive(Accounts)]
pub struct Initialize {}

#[derive(Accounts)]
pub struct Deposit {}

#[derive(Accounts)]
pub struct Redeem {}

#[derive(Accounts)]
pub struct RequestRedeem {}

#[derive(Accounts)]
pub struct ProcessWithdrawals {}

#[derive(Accounts)]
pub struct ClaimRedeem {}

#[derive(Accounts)]
pub struct UpdateNav {}

#[derive(Accounts)]
pub struct HarvestFees {}

#[derive(Accounts)]
pub struct DrainManaged {}

#[derive(Accounts)]
pub struct Pause {}

#[derive(Accounts)]
pub struct Unpause {}
