/**
 * Squads multisig helper — wraps vault operations (mint, transfer)
 * into propose → approve → execute flow.
 *
 * Supports multiple vaults: solomon, kamino, oro, awy.
 */

import {
  Connection,
  Keypair,
  PublicKey,
  TransactionMessage,
  TransactionInstruction,
  sendAndConfirmTransaction,
  Transaction,
} from "@solana/web3.js";
import * as multisig from "@sqds/multisig";
import bs58 from "bs58";

let _authority: Keypair | null = null;
let _connection: Connection | null = null;
let _txLock: Promise<void> = Promise.resolve();

function getAuthority(): Keypair {
  if (!_authority) {
    const secret = process.env.VAULT_AUTHORITY_SECRET;
    if (!secret) throw new Error("VAULT_AUTHORITY_SECRET not set");
    _authority = Keypair.fromSecretKey(bs58.decode(secret));
  }
  return _authority;
}

function getConnection(): Connection {
  if (!_connection) {
    const url = process.env.SOLANA_RPC_URL || process.env.NEXT_PUBLIC_SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";
    _connection = new Connection(url, "confirmed");
  }
  return _connection;
}

export type VaultName = "solomon" | "kamino" | "oro" | "awy" | "awy2x" | "awy3x";

/**
 * Get vault addresses for a specific vault by name.
 */
export function getVaultAddresses(vault: VaultName) {
  const prefix = vault.toUpperCase();
  const multisigAddr = process.env[`VAULT_${prefix}_MULTISIG`];
  const pdaAddr = process.env[`VAULT_${prefix}_PDA`] || process.env[`NEXT_PUBLIC_${prefix}_VAULT_PDA`];
  const usdcAta = process.env[`VAULT_${prefix}_USDC_ATA`] || process.env[`NEXT_PUBLIC_${prefix}_USDC_ATA`];
  const mint = process.env[`NEXT_PUBLIC_${prefix}_MINT`];

  if (!multisigAddr || !pdaAddr) {
    throw new Error(`Vault ${vault} not configured: missing VAULT_${prefix}_MULTISIG or PDA`);
  }

  return {
    multisig: new PublicKey(multisigAddr),
    vaultPda: new PublicKey(pdaAddr),
    usdcAta: usdcAta ? new PublicKey(usdcAta) : null,
    mint: mint ? new PublicKey(mint) : null,
  };
}

/**
 * Map a vault ID (fdn-solomon) to vault name (solomon).
 */
export function vaultIdToName(vaultId: string): VaultName {
  const map: Record<string, VaultName> = {
    "fdn-solomon": "solomon",
    "fdn-kamino": "kamino",
    "fdn-oro": "oro",
    "fdn-awy": "awy",
    "fdn-awy-2x": "awy2x",
    "fdn-awy-3x": "awy3x",
  };
  const name = map[vaultId];
  if (!name) throw new Error(`Unknown vault ID: ${vaultId}`);
  return name;
}

/**
 * Execute instructions through a specific Squads multisig vault.
 *
 * Pass `addressLookupTableAccounts` whenever the instructions reference keys
 * that came from an ALT (e.g. Kamino klend deposit). Without it the inner
 * vault tx blows past the 1232-byte size limit because every account is
 * resolved to its full 32-byte pubkey.
 */
export async function executeVaultTransaction(
  vaultName: VaultName,
  instructions: TransactionInstruction[],
  addressLookupTableAccounts: import("@solana/web3.js").AddressLookupTableAccount[] = [],
): Promise<string> {
  // Serialize all vault transactions to prevent race conditions on transactionIndex
  let resolve: () => void;
  const prevLock = _txLock;
  _txLock = new Promise<void>((r) => { resolve = r; });
  await prevLock;

  try {
    return await _executeVaultTransactionInner(vaultName, instructions, addressLookupTableAccounts);
  } finally {
    resolve!();
  }
}

async function _executeVaultTransactionInner(
  vaultName: VaultName,
  instructions: TransactionInstruction[],
  addressLookupTableAccounts: import("@solana/web3.js").AddressLookupTableAccount[],
): Promise<string> {
  const connection = getConnection();
  const authority = getAuthority();
  const { multisig: multisigPda, vaultPda } = getVaultAddresses(vaultName);

  // Get current transaction index
  const multisigAccount = await multisig.accounts.Multisig.fromAccountAddress(
    connection,
    multisigPda,
  );
  const transactionIndex = Number(multisigAccount.transactionIndex) + 1;

  // Build the vault transaction message
  const { blockhash } = await connection.getLatestBlockhash();
  const txMessage = new TransactionMessage({
    payerKey: vaultPda,
    recentBlockhash: blockhash,
    instructions,
  });

  // Create vault tx + proposal + approve in one transaction
  const createVaultTxIx = multisig.instructions.vaultTransactionCreate({
    multisigPda,
    transactionIndex: BigInt(transactionIndex),
    creator: authority.publicKey,
    vaultIndex: 0,
    ephemeralSigners: 0,
    transactionMessage: txMessage,
    addressLookupTableAccounts,
  });

  const createProposalIx = multisig.instructions.proposalCreate({
    multisigPda,
    transactionIndex: BigInt(transactionIndex),
    creator: authority.publicKey,
  });

  const approveIx = multisig.instructions.proposalApprove({
    multisigPda,
    transactionIndex: BigInt(transactionIndex),
    member: authority.publicKey,
  });

  const setupTx = new Transaction().add(createVaultTxIx, createProposalIx, approveIx);
  setupTx.recentBlockhash = blockhash;
  setupTx.feePayer = authority.publicKey;
  await sendAndConfirmTransaction(connection, setupTx, [authority]);

  // Wait for confirmation to propagate before executing
  await new Promise((r) => setTimeout(r, 2000));

  // Execute — uses v0 transaction with ALTs returned by Squads (ALTs are
  // needed when the inner vault tx referenced keys via lookup tables).
  const { instruction: executeIxRaw, lookupTableAccounts } =
    await multisig.instructions.vaultTransactionExecute({
      connection,
      multisigPda,
      transactionIndex: BigInt(transactionIndex),
      member: authority.publicKey,
    });

  const { VersionedTransaction, TransactionMessage: TM, ComputeBudgetProgram } =
    await import("@solana/web3.js");
  // Kamino's deposit chain (RefreshReserve × N → RefreshObligation → Deposit)
  // routinely needs ~600–900K CUs once wrapped in Squads' execute. Default
  // 200K is far too low; we bump to 1M which is safely under the 1.4M cap.
  const execMessage = new TM({
    payerKey: authority.publicKey,
    recentBlockhash: (await connection.getLatestBlockhash()).blockhash,
    instructions: [
      ComputeBudgetProgram.setComputeUnitLimit({ units: 1_000_000 }),
      executeIxRaw,
    ],
  }).compileToV0Message(lookupTableAccounts);
  const execTx = new VersionedTransaction(execMessage);
  execTx.sign([authority]);
  let sig: string;
  try {
    sig = await connection.sendRawTransaction(execTx.serialize());
    await connection.confirmTransaction(sig, "confirmed");
  } catch (execErr) {
    // Execute failed — proposal stays Approved, tx account stays open. Cancel
    // the proposal then close the accounts so the authority's escrowed rent
    // (~0.005-0.007 SOL per orphan) comes back immediately. Without this we
    // bleed SOL on every failed leg and downstream legs fail for fee reasons.
    await new Promise((r) => setTimeout(r, 1500));
    try {
      const cancelIx = multisig.instructions.proposalCancel({
        multisigPda,
        transactionIndex: BigInt(transactionIndex),
        member: authority.publicKey,
      });
      const cancelTx = new Transaction().add(cancelIx);
      cancelTx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
      cancelTx.feePayer = authority.publicKey;
      await sendAndConfirmTransaction(connection, cancelTx, [authority]);
      const closeIx = multisig.instructions.vaultTransactionAccountsClose({
        multisigPda,
        rentCollector: authority.publicKey,
        transactionIndex: BigInt(transactionIndex),
      });
      const closeTx = new Transaction().add(closeIx);
      closeTx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
      closeTx.feePayer = authority.publicKey;
      await sendAndConfirmTransaction(connection, closeTx, [authority]);
      console.log(`Rent reclaimed (failed-exec) for tx #${transactionIndex}`);
    } catch (cleanupErr) {
      console.error(`Cleanup after failed exec #${transactionIndex} failed:`, cleanupErr instanceof Error ? cleanupErr.message : cleanupErr);
    }
    throw execErr;
  }

  // Reclaim rent for successful executes — Squads requires rentCollector on
  // the multisig (see scripts/fix-rent-collector.ts).
  try {
    await new Promise((r) => setTimeout(r, 2000));
    const closeIx = multisig.instructions.vaultTransactionAccountsClose({
      multisigPda,
      rentCollector: authority.publicKey,
      transactionIndex: BigInt(transactionIndex),
    });
    const closeTx = new Transaction().add(closeIx);
    closeTx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
    closeTx.feePayer = authority.publicKey;
    await sendAndConfirmTransaction(connection, closeTx, [authority]);
    console.log(`Rent reclaimed for tx #${transactionIndex}`);
  } catch (err) {
    console.error(`Rent reclaim failed for tx #${transactionIndex}:`, err instanceof Error ? err.message : err);
  }

  return sig;
}
