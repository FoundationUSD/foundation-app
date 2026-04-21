/**
 * Cancel 11 stuck "Approved" Solomon proposals and close their accounts
 * to reclaim ~0.068 SOL of rent back to the vault authority.
 *
 * Run: VAULT_AUTHORITY_SECRET=… SOLANA_RPC_URL=… bun run scripts/cancel-stuck-solomon.ts
 */

import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  LAMPORTS_PER_SOL,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import * as multisig from "@sqds/multisig";
import bs58 from "bs58";

const SOLOMON_MULTISIG = new PublicKey("4MBkeUXZbjbirA1twwJoVgJtBmumUYr6uZ5cqpUE9ZdH");
const STUCK_INDICES = [1, 2, 33, 35, 47, 49, 53, 59, 64, 71, 80];

async function main() {
  const secret = process.env.VAULT_AUTHORITY_SECRET;
  if (!secret) throw new Error("VAULT_AUTHORITY_SECRET missing");
  const authority = Keypair.fromSecretKey(bs58.decode(secret));
  const rpc = process.env.SOLANA_RPC_URL || process.env.NEXT_PUBLIC_SOLANA_RPC_URL!;
  const connection = new Connection(rpc, "confirmed");

  const startSol = await connection.getBalance(authority.publicKey);
  console.log("Authority:", authority.publicKey.toBase58());
  console.log("Starting SOL:", (startSol / LAMPORTS_PER_SOL).toFixed(6));
  console.log(`Processing ${STUCK_INDICES.length} stuck proposals…\n`);

  for (const idx of STUCK_INDICES) {
    const index = BigInt(idx);
    try {
      // 1. Cancel the Approved proposal
      const cancelIx = multisig.instructions.proposalCancel({
        multisigPda: SOLOMON_MULTISIG,
        transactionIndex: index,
        member: authority.publicKey,
      });
      const cancelTx = new Transaction().add(cancelIx);
      cancelTx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
      cancelTx.feePayer = authority.publicKey;
      const cancelSig = await sendAndConfirmTransaction(connection, cancelTx, [authority]);
      console.log(`  ✓ #${idx} cancelled  ${cancelSig.slice(0, 12)}…`);

      // 2. Close accounts (rent → authority)
      await new Promise((r) => setTimeout(r, 1500));
      const closeIx = multisig.instructions.vaultTransactionAccountsClose({
        multisigPda: SOLOMON_MULTISIG,
        rentCollector: authority.publicKey,
        transactionIndex: index,
      });
      const closeTx = new Transaction().add(closeIx);
      closeTx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
      closeTx.feePayer = authority.publicKey;
      const closeSig = await sendAndConfirmTransaction(connection, closeTx, [authority]);
      console.log(`  ✓ #${idx} closed     ${closeSig.slice(0, 12)}…`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.log(`  ✗ #${idx} FAILED: ${msg.slice(0, 200)}`);
    }
  }

  const endSol = await connection.getBalance(authority.publicKey);
  console.log(`\nEnding SOL: ${(endSol / LAMPORTS_PER_SOL).toFixed(6)}`);
  console.log(`Net change: ${((endSol - startSol) / LAMPORTS_PER_SOL).toFixed(6)} SOL`);
}

main().catch((e) => {
  console.error("Script failed:", e);
  process.exit(1);
});
