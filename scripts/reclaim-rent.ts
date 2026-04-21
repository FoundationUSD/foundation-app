/**
 * Scan every Squads multisig and reclaim rent from closed/stale transactions
 * by invoking `vaultTransactionAccountsClose` for each index in [1, transactionIndex].
 *
 * Run: VAULT_AUTHORITY_SECRET=… SOLANA_RPC_URL=… bun run scripts/reclaim-rent.ts
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

const MULTISIGS: Record<string, string> = {
  solomon: "4MBkeUXZbjbirA1twwJoVgJtBmumUYr6uZ5cqpUE9ZdH",
  kamino:  "9JrqmTjapp6FL8RTRhGENo9pikpRCsGPYh7NPrLzq2DE",
  oro:     "8kGc6giBeUFxwRJuKBQwwjhCuXwMJEHQ3fMqL7iHYdtU",
  drift:   "ExtJEaA412oyfxPYvDjfzHyR1ACDFzbWp1VAAdAqDQrE",
};

async function reclaimOne(
  connection: Connection,
  authority: Keypair,
  multisigPda: PublicKey,
  index: bigint,
): Promise<{ ok: boolean; reason?: string }> {
  try {
    const ix = multisig.instructions.vaultTransactionAccountsClose({
      multisigPda,
      rentCollector: authority.publicKey,
      transactionIndex: index,
    });
    const tx = new Transaction().add(ix);
    tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
    tx.feePayer = authority.publicKey;
    await sendAndConfirmTransaction(connection, tx, [authority], {
      commitment: "confirmed",
      skipPreflight: false,
    });
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, reason: msg.slice(0, 140) };
  }
}

async function main() {
  const secret = process.env.VAULT_AUTHORITY_SECRET;
  if (!secret) throw new Error("VAULT_AUTHORITY_SECRET missing");
  const authority = Keypair.fromSecretKey(bs58.decode(secret));
  const rpc = process.env.SOLANA_RPC_URL || process.env.NEXT_PUBLIC_SOLANA_RPC_URL!;
  const connection = new Connection(rpc, "confirmed");

  const startSol = await connection.getBalance(authority.publicKey);
  console.log("Authority:", authority.publicKey.toBase58());
  console.log("Starting SOL:", (startSol / LAMPORTS_PER_SOL).toFixed(6));
  console.log();

  let reclaimedTotal = 0;

  for (const [name, addr] of Object.entries(MULTISIGS)) {
    const multisigPda = new PublicKey(addr);
    let ms;
    try {
      ms = await multisig.accounts.Multisig.fromAccountAddress(connection, multisigPda);
    } catch {
      console.log(`[${name}] multisig not found, skipping`);
      continue;
    }
    const lastIndex = Number(ms.transactionIndex);
    console.log(`[${name}] scanning indices 1..${lastIndex}`);

    let closed = 0;
    let skipped = 0;
    for (let i = 1; i <= lastIndex; i++) {
      const res = await reclaimOne(connection, authority, multisigPda, BigInt(i));
      if (res.ok) {
        closed++;
        process.stdout.write(`  ✓ #${i} closed\n`);
      } else {
        skipped++;
        if (skipped <= 2) process.stdout.write(`  · #${i} ${res.reason}\n`);
      }
    }
    console.log(`[${name}] closed=${closed}  skipped=${skipped}`);
    reclaimedTotal += closed;
    console.log();
  }

  const endSol = await connection.getBalance(authority.publicKey);
  console.log("Ending SOL:", (endSol / LAMPORTS_PER_SOL).toFixed(6));
  console.log(
    `Net change: ${((endSol - startSol) / LAMPORTS_PER_SOL).toFixed(6)} SOL across ${reclaimedTotal} close ops`,
  );
}

main().catch((e) => {
  console.error("Reclaim failed:", e);
  process.exit(1);
});
