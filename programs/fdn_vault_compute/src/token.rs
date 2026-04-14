//! Token-2022 share mint creation.
//!
//! Spec: ADR-004 §Token-2022 Share Token Design.
//!
//! Extensions enabled on the mint:
//!   - MetadataPointer — points to off-chain/on-chain metadata describing the vault
//!   - TransferHook    — dispatches every transfer through `fdn_transfer_hook` for
//!                       the 24h anti-arb lockup enforcement
//!
//! Extensions NOT on the mint (applied at TOKEN ACCOUNT level in user onboarding):
//!   - CPI Guard       — prevents vault share accounts from being drained via
//!                       unexpected CPI forwarding
//!   - Immutable Owner — prevents account reassignment (anti-hijack)
//!
//! Extensions explicitly EXCLUDED per ADR-004:
//!   - Permanent Delegate     — rug vector, $50M+ Q1 2026 losses
//!   - Confidential Transfers — zero-day in Apr 2025
//!   - Non-Transferable       — breaks P0 collateral composability
//!   - Transfer Fee           — breaks lending composability
//!   - Default Account State (Frozen) — requires KYC gating
//!
//! The mint authority is the `vault_authority` PDA (seeds `[b"vault_authority", vault]`).
//! Freeze authority is `None` — permissionless vault, no account freezes.

use anchor_lang::prelude::*;
use anchor_lang::solana_program::{program::invoke_signed, system_instruction};
use anchor_spl::token_2022::spl_token_2022::{
    extension::{
        metadata_pointer::instruction::initialize as init_metadata_pointer,
        transfer_hook::instruction::initialize as init_transfer_hook,
        ExtensionType,
    },
    instruction::initialize_mint2,
    state::Mint as MintState,
};

use crate::constants::SHARE_DECIMALS;
use crate::errors::VaultError;

/// Create a Token-2022 mint PDA with MetadataPointer + TransferHook extensions enabled.
///
/// Order of operations is important and spec'd by Token-2022:
///   1. `system_program::create_account` sized for the mint + all extensions
///   2. Initialize each extension's config BEFORE `initialize_mint2`
///   3. `initialize_mint2` locks the base mint state
///
/// Attempting (2) after (3) will fail — extensions must be configured on the raw
/// uninitialized buffer before the mint base state is set.
#[allow(clippy::too_many_arguments)]
pub fn create_share_mint<'info>(
    payer: &AccountInfo<'info>,
    mint: &AccountInfo<'info>,
    mint_authority: &Pubkey,
    transfer_hook_program_id: &Pubkey,
    metadata_address: Option<Pubkey>,
    token_2022_program: &AccountInfo<'info>,
    system_program: &AccountInfo<'info>,
    mint_signer_seeds: &[&[u8]],
) -> Result<()> {
    let extensions = [
        ExtensionType::MetadataPointer,
        ExtensionType::TransferHook,
    ];
    let mint_space = ExtensionType::try_calculate_account_len::<MintState>(&extensions)
        .map_err(|_| VaultError::MathOverflow)?;
    let rent_lamports = Rent::get()?.minimum_balance(mint_space);

    // Phase 1 — allocate the account owned by Token-2022 program.
    invoke_signed(
        &system_instruction::create_account(
            payer.key,
            mint.key,
            rent_lamports,
            mint_space as u64,
            token_2022_program.key,
        ),
        &[payer.clone(), mint.clone(), system_program.clone()],
        &[mint_signer_seeds],
    )?;

    // Phase 2a — MetadataPointer. Authority = mint_authority (vault_authority PDA) so
    // the vault can set/update the pointer later when metadata is published.
    invoke_signed(
        &init_metadata_pointer(
            token_2022_program.key,
            mint.key,
            Some(*mint_authority),
            metadata_address,
        )?,
        &[mint.clone(), token_2022_program.clone()],
        &[mint_signer_seeds],
    )?;

    // Phase 2b — TransferHook. Authority = mint_authority (so hook program can be
    // updated if we ever redeploy the hook to a new address). Points at the current
    // `fdn_transfer_hook` program.
    invoke_signed(
        &init_transfer_hook(
            token_2022_program.key,
            mint.key,
            Some(*mint_authority),
            Some(*transfer_hook_program_id),
        )?,
        &[mint.clone(), token_2022_program.clone()],
        &[mint_signer_seeds],
    )?;

    // Phase 3 — initialize the mint base state.
    // Freeze authority is None — vault shares are permissionlessly transferable
    // (subject only to the 24h transfer hook lockup).
    invoke_signed(
        &initialize_mint2(
            token_2022_program.key,
            mint.key,
            mint_authority,
            None,
            SHARE_DECIMALS,
        )?,
        &[mint.clone(), token_2022_program.clone()],
        &[mint_signer_seeds],
    )?;

    Ok(())
}
