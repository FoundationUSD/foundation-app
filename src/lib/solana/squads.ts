/**
 * Squads multisig helper — wraps vault operations (mint, transfer)
 * into propose → approve → execute flow.
 *
 * Supports multiple vaults: solomon, kamino, drift.
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

type VaultName = "solomon" | "kamino" | "drift" | "oro";

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
    "fdn-drift": "drift",
    "fdn-oro": "oro",
  };
  const name = map[vaultId];
  if (!name) throw new Error(`Unknown vault ID: ${vaultId}`);
  return name;
}

/**
 * Execute instructions through a specific Squads multisig vault.
 */
export async function executeVaultTransaction(
  vaultName: VaultName,
  instructions: TransactionInstruction[],
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

  // Execute
  const executeIx = await multisig.instructions.vaultTransactionExecute({
    connection,
    multisigPda,
    transactionIndex: BigInt(transactionIndex),
    member: authority.publicKey,
  });

  const executeTx = new Transaction().add(executeIx.instruction);
  executeTx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
  executeTx.feePayer = authority.publicKey;

  const sig = await sendAndConfirmTransaction(connection, executeTx, [authority]);

  // Reclaim rent from the executed transaction + proposal accounts
  // This returns ~0.004 SOL back to the authority
  try {
    const closeIx = multisig.instructions.vaultTransactionAccountsClose({
      multisigPda,
      rentCollector: authority.publicKey,
      transactionIndex: BigInt(transactionIndex),
    });
    const closeTx = new Transaction().add(closeIx);
    closeTx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
    closeTx.feePayer = authority.publicKey;
    await sendAndConfirmTransaction(connection, closeTx, [authority]);
  } catch {
    // Non-critical — rent reclaim failed but mint succeeded
  }

  return sig;
}
