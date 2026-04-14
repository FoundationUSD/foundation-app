//! fdn_transfer_hook — 24h lockup enforcement for Foundation vault share tokens.
//!
//! Spec: dataroom/solana/ADR-004-vault-architecture.md §Transfer Hook Architecture
//!
//! This program is attached to the vault share mint via Token-2022 `TransferHook`
//! extension. Token-2022 invokes `execute` on every transfer of the bound share token
//! — including transfers between two user wallets. This is the only on-chain defense
//! against the "deposit → transfer to clean wallet → redeem from that wallet within
//! the 24h lockup window" arb path.
//!
//! Hardening properties per ADR-004:
//!   - Minimal code (<100 lines of logic)
//!   - All accounts passed to execute are read-only (enforced by Token-2022)
//!   - NO external CPI, NO token moves, NO callbacks — single state read + time compare
//!   - Upgrade authority REVOKED in the same tx as first deploy (see deploy runbook)
//!
//! Dispatch: Token-2022 uses a namespaced discriminator from
//! `spl-transfer-hook-interface`, not Anchor's `global:<name>` hash. We use Anchor's
//! `fallback` mechanism to catch the interface-specific discriminator and forward to
//! our handler.

use anchor_lang::prelude::*;
use anchor_lang::solana_program::program_error::ProgramError;
use spl_tlv_account_resolution::{
    account::ExtraAccountMeta, seeds::Seed, state::ExtraAccountMetaList,
};
use spl_transfer_hook_interface::instruction::{ExecuteInstruction, TransferHookInstruction};

declare_id!("3hBtJLskNbhbdzjA8imqiR9uaWMKrvUEiwseenAwgCTs");

/// Layout of the vault program's `ShareLockup` PDA — kept in sync manually to avoid
/// a circular dep with `fdn_vault_compute`. If that program changes ShareLockup's
/// field order, this struct MUST update in the same PR.
///
/// Anchor account layout: 8-byte discriminator + fields below.
#[account]
pub struct ShareLockup {
    pub vault: Pubkey,
    pub user: Pubkey,
    pub locked_until: i64,
    pub bump: u8,
}

#[program]
pub mod fdn_transfer_hook {
    use super::*;

    /// Declare the ExtraAccountMetaList — tells Token-2022 which additional accounts
    /// to pass into `execute`. For us: the source user's ShareLockup PDA, with the
    /// vault pubkey baked into the seeds as a literal byte string (Token-2022
    /// resolves it at CPI time from the mint+owner pair).
    ///
    /// Seeds per source_lockup: [b"share_lockup", vault_literal(32B), owner_key].
    /// Token-2022 account indices during execute:
    ///   0: source_token, 1: mint, 2: dest_token, 3: owner, 4: extra_meta_list
    pub fn initialize_extra_account_meta_list(
        ctx: Context<InitializeExtraAccountMetaList>,
        vault: Pubkey,
    ) -> Result<()> {
        let metas = [ExtraAccountMeta::new_with_seeds(
            &[
                Seed::Literal {
                    bytes: b"share_lockup".to_vec(),
                },
                Seed::Literal {
                    bytes: vault.to_bytes().to_vec(),
                },
                Seed::AccountKey { index: 3 }, // owner
            ],
            false, // is_signer
            false, // is_writable (v0: source-only enforcement, dest propagation in v1)
        )?];

        let account_size = ExtraAccountMetaList::size_of(metas.len())?;
        let extra_metas_account = &mut ctx.accounts.extra_account_meta_list;
        let mut data = extra_metas_account.try_borrow_mut_data()?;
        require!(
            data.len() >= account_size,
            HookError::ExtraMetaListTooSmall
        );
        ExtraAccountMetaList::init::<ExecuteInstruction>(&mut data, &metas)?;
        Ok(())
    }

    /// Fallback dispatcher: Token-2022 uses the namespaced
    /// `spl-transfer-hook-interface:execute` discriminator which doesn't match
    /// Anchor's `global:execute` hash. We manually unpack and route.
    pub fn fallback<'info>(
        program_id: &Pubkey,
        accounts: &'info [AccountInfo<'info>],
        data: &[u8],
    ) -> Result<()> {
        let instruction = TransferHookInstruction::unpack(data)
            .map_err(|_| ProgramError::InvalidInstructionData)?;
        match instruction {
            TransferHookInstruction::Execute { amount: _ } => {
                process_execute(program_id, accounts)
            }
            _ => Err(ProgramError::InvalidInstructionData.into()),
        }
    }
}

/// Execute the 24h lockup enforcement.
///
/// Token-2022 passes accounts in this order (per spl-transfer-hook-interface):
///   [0] source_token, [1] mint, [2] dest_token, [3] owner,
///   [4] extra_account_meta_list, [5..] extras declared by us.
///
/// We declared exactly one extra — the source ShareLockup PDA at index 5.
fn process_execute<'info>(_program_id: &Pubkey, accounts: &'info [AccountInfo<'info>]) -> Result<()> {
    require!(accounts.len() >= 6, HookError::MissingAccounts);

    // Index 5 per Token-2022 TransferHook interface + our single extra meta.
    let source_lockup_ai = &accounts[5];
    let data = source_lockup_ai.try_borrow_data()?;

    // If the ShareLockup PDA has never been initialized (user has never deposited into
    // the vault), the account will be empty/uninitialized — there's nothing to enforce
    // because the user didn't acquire these shares via deposit. Pass.
    if data.len() < 8 + core::mem::size_of::<ShareLockup>() {
        return Ok(());
    }

    // Skip 8-byte Anchor discriminator + vault(32) + user(32) → locked_until offset 72.
    const LOCKED_UNTIL_OFFSET: usize = 8 + 32 + 32;
    let locked_until_bytes: [u8; 8] = data
        [LOCKED_UNTIL_OFFSET..LOCKED_UNTIL_OFFSET + 8]
        .try_into()
        .map_err(|_| HookError::CorruptLockupData)?;
    let locked_until = i64::from_le_bytes(locked_until_bytes);

    let now = Clock::get()?.unix_timestamp;
    if now < locked_until {
        msg!(
            "fdn_transfer_hook: lockup active (now={}, locked_until={})",
            now,
            locked_until
        );
        return err!(HookError::LockupActive);
    }

    Ok(())
}

#[derive(Accounts)]
pub struct InitializeExtraAccountMetaList<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    /// Share mint this hook is being attached to. The ExtraAccountMetaList PDA is
    /// seeded by the mint address per spl-transfer-hook-interface convention.
    /// CHECK: read-only; ownership validated by the token-2022 program when the hook fires.
    pub mint: UncheckedAccount<'info>,

    /// ExtraAccountMetaList PDA — Token-2022 reads this during transfer.
    /// Seeds: [b"extra-account-metas", mint]. Space + rent paid by payer.
    /// CHECK: written in handler via `ExtraAccountMetaList::init`.
    #[account(
        mut,
        seeds = [b"extra-account-metas", mint.key().as_ref()],
        bump,
    )]
    pub extra_account_meta_list: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

#[error_code]
pub enum HookError {
    #[msg("Transfer blocked: 24h lockup active")]
    LockupActive,
    #[msg("Transfer hook: expected extra accounts not provided")]
    MissingAccounts,
    #[msg("Transfer hook: ShareLockup data malformed")]
    CorruptLockupData,
    #[msg("ExtraAccountMetaList account too small for required metas")]
    ExtraMetaListTooSmall,
}
