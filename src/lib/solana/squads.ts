/**
 * Squads multisig helper — wraps vault operations (mint, transfer)
 * into propose → approve → execute flow.
 *
 * For a 1-of-1 multisig, this is fully automated from the backend.
 */

import {
  Connection,
  Keypair,
  PublicKey,
  TransactionMessage,
  TransactionInstruction,
  VersionedTransaction,
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

export function getMultisigPda(): PublicKey {
  const addr = process.env.VAULT_MULTISIG;
  if (!addr) throw new Error("VAULT_MULTISIG not set");
  return new PublicKey(addr);
}

export function getVaultPda(): PublicKey {
  const addr = process.env.VAULT_PDA;
  if (!addr) throw new Error("VAULT_PDA not set");
  return new PublicKey(addr);
}

/**
 * Execute instructions through the Squads multisig vault.
 *
 * Flow: create vault tx → create proposal → approve → execute
 * For 1-of-1 multisig, this completes immediately.
 */
export async function executeVaultTransaction(
  instructions: TransactionInstruction[],
): Promise<string> {
  const connection = getConnection();
  const authority = getAuthority();
  const multisigPda = getMultisigPda();
  const vaultPda = getVaultPda();

  // Get current transaction index
  const multisigAccount = await multisig.accounts.Multisig.fromAccountAddress(
    connection,
    multisigPda,
  );
  const transactionIndex = Number(multisigAccount.transactionIndex) + 1;

  const [transactionPda] = multisig.getTransactionPda({
    multisigPda,
    index: BigInt(transactionIndex),
  });
  const [proposalPda] = multisig.getProposalPda({
    multisigPda,
    transactionIndex: BigInt(transactionIndex),
  });

  // Build the vault transaction message
  const { blockhash } = await connection.getLatestBlockhash();
  const txMessage = new TransactionMessage({
    payerKey: vaultPda,
    recentBlockhash: blockhash,
    instructions,
  });

  // Step 1: Create vault transaction
  const createVaultTxIx = multisig.instructions.vaultTransactionCreate({
    multisigPda,
    transactionIndex: BigInt(transactionIndex),
    creator: authority.publicKey,
    vaultIndex: 0,
    ephemeralSigners: 0,
    transactionMessage: txMessage,
  });

  // Step 2: Create proposal
  const createProposalIx = multisig.instructions.proposalCreate({
    multisigPda,
    transactionIndex: BigInt(transactionIndex),
    creator: authority.publicKey,
  });

  // Step 3: Approve
  const approveIx = multisig.instructions.proposalApprove({
    multisigPda,
    transactionIndex: BigInt(transactionIndex),
    member: authority.publicKey,
  });

  // Send create + propose + approve in one tx
  const setupTx = new Transaction().add(createVaultTxIx, createProposalIx, approveIx);
  setupTx.recentBlockhash = blockhash;
  setupTx.feePayer = authority.publicKey;
  await sendAndConfirmTransaction(connection, setupTx, [authority]);

  // Step 4: Execute the vault transaction
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
  return sig;
}
