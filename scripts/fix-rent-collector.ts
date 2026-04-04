/**
 * Fix rent collector on all Squads multisigs + reclaim unclosed rent.
 *
 * The multisigs have configAuthority = None, so config changes must go through
 * the propose → approve → execute flow via configTransactionCreate.
 *
 * Usage: export $(grep -v '^#' .env.local | xargs) && npx tsx scripts/fix-rent-collector.ts
 */

import { Connection, Keypair, Transaction, sendAndConfirmTransaction, PublicKey } from "@solana/web3.js";
import * as multisig from "@sqds/multisig";
import bs58 from "bs58";

const VAULTS: Record<string, string> = {
  solomon: process.env.VAULT_SOLOMON_MULTISIG!,
  kamino: process.env.VAULT_KAMINO_MULTISIG!,
  oro: process.env.VAULT_ORO_MULTISIG!,
};

async function main() {
  const secret = process.env.VAULT_AUTHORITY_SECRET;
  if (!secret) { console.error("Set VAULT_AUTHORITY_SECRET"); process.exit(1); }

  const authority = Keypair.fromSecretKey(bs58.decode(secret));
  const rpcUrl = process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";
  const connection = new Connection(rpcUrl, "confirmed");

  const balance = await connection.getBalance(authority.publicKey);
  console.log(`Authority: ${authority.publicKey.toBase58()}`);
  console.log(`SOL balance: ${balance / 1e9}\n`);

  for (const [name, addr] of Object.entries(VAULTS)) {
    if (!addr) { console.log(`${name}: not configured, skipping`); continue; }

    const multisigPda = new PublicKey(addr);
    console.log(`\n=== ${name.toUpperCase()} (${addr}) ===`);

    const msAccount = await multisig.accounts.Multisig.fromAccountAddress(connection, multisigPda);
    const currentTxIndex = Number(msAccount.transactionIndex);
    console.log(`  Transactions: ${currentTxIndex}`);
    console.log(`  Current rentCollector: ${msAccount.rentCollector ? msAccount.rentCollector.toBase58() : "NULL"}`);

    // Step 1: Set rent collector via config transaction if not set
    if (!msAccount.rentCollector) {
      console.log(`  Setting rentCollector via config tx flow...`);
      try {
        const newTxIndex = currentTxIndex + 1;

        // Create config transaction with SetRentCollector action
        const configTxIx = multisig.instructions.configTransactionCreate({
          multisigPda,
          transactionIndex: BigInt(newTxIndex),
          creator: authority.publicKey,
          actions: [{
            __kind: "SetRentCollector",
            newRentCollector: authority.publicKey,
          }],
        });

        const proposalIx = multisig.instructions.proposalCreate({
          multisigPda,
          transactionIndex: BigInt(newTxIndex),
          creator: authority.publicKey,
        });

        const approveIx = multisig.instructions.proposalApprove({
          multisigPda,
          transactionIndex: BigInt(newTxIndex),
          member: authority.publicKey,
        });

        // Setup: create + propose + approve
        const { blockhash } = await connection.getLatestBlockhash();
        const setupTx = new Transaction().add(configTxIx, proposalIx, approveIx);
        setupTx.recentBlockhash = blockhash;
        setupTx.feePayer = authority.publicKey;
        await sendAndConfirmTransaction(connection, setupTx, [authority]);
        console.log(`  ✅ Config tx created, proposed, approved`);

        // Wait for confirmation
        await new Promise((r) => setTimeout(r, 2000));

        // Execute the config transaction
        const executeIx = multisig.instructions.configTransactionExecute({
          multisigPda,
          transactionIndex: BigInt(newTxIndex),
          member: authority.publicKey,
          rentPayer: authority.publicKey,
        });

        const executeTx = new Transaction().add(executeIx);
        executeTx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
        executeTx.feePayer = authority.publicKey;
        const sig = await sendAndConfirmTransaction(connection, executeTx, [authority]);
        console.log(`  ✅ rentCollector set: ${sig}`);
      } catch (e: any) {
        console.error(`  ❌ Failed to set rentCollector: ${e.message}`);
        continue; // Can't reclaim rent without rentCollector
      }
    } else {
      console.log(`  ✓ rentCollector already set`);
    }

    // Step 2: Close past executed vault transaction accounts to reclaim rent
    console.log(`  Reclaiming rent from past transactions...`);
    let reclaimed = 0;
    for (let i = 1; i <= currentTxIndex; i++) {
      try {
        const closeIx = multisig.instructions.vaultTransactionAccountsClose({
          multisigPda,
          rentCollector: authority.publicKey,
          transactionIndex: BigInt(i),
        });
        const tx = new Transaction().add(closeIx);
        tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
        tx.feePayer = authority.publicKey;
        await sendAndConfirmTransaction(connection, tx, [authority]);
        reclaimed++;
        console.log(`    ✅ Closed tx #${i}`);
      } catch {
        // Already closed, config tx, or not closeable — skip silently
      }
    }

    // Also try closing the config transaction we just created
    const msAccountUpdated = await multisig.accounts.Multisig.fromAccountAddress(connection, multisigPda);
    const latestIdx = Number(msAccountUpdated.transactionIndex);
    if (latestIdx > currentTxIndex) {
      try {
        const closeIx = multisig.instructions.configTransactionAccountsClose({
          multisigPda,
          rentCollector: authority.publicKey,
          transactionIndex: BigInt(latestIdx),
        });
        const tx = new Transaction().add(closeIx);
        tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
        tx.feePayer = authority.publicKey;
        await sendAndConfirmTransaction(connection, tx, [authority]);
        reclaimed++;
        console.log(`    ✅ Closed config tx #${latestIdx}`);
      } catch {
        // Not closeable yet
      }
    }

    console.log(`  Reclaimed rent from ${reclaimed} transactions`);
  }

  const finalBalance = await connection.getBalance(authority.publicKey);
  console.log(`\n✅ Done. Final balance: ${finalBalance / 1e9} SOL (was ${balance / 1e9})`);
  console.log(`Net reclaimed: ${((finalBalance - balance) / 1e9).toFixed(6)} SOL`);
}

main().catch(console.error);
