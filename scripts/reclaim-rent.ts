/**
 * Scan every Squads multisig and reclaim rent from closed/stale transactions
 * by invoking `vaultTransactionAccountsClose` for each index in [1, transactionIndex].
 *
 * Optimizations to avoid hammering RPC:
 *   1. Pre-fetch each tx PDA via getMultipleAccountsInfo (batches of 100) to find
 *      which indices still have an open account — skip the rest.
 *   2. Batch up to 8 close ixs per tx to amortize fees and round-trips.
 *   3. Throttle 250ms between tx submissions.
 *   4. Skip multisigs whose rentCollector is NULL with a clear warning.
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
  solomon: process.env.VAULT_SOLOMON_MULTISIG || "",
  kamino:  process.env.VAULT_KAMINO_MULTISIG  || "",
  oro:     process.env.VAULT_ORO_MULTISIG     || "",
  awy:     process.env.VAULT_AWY_MULTISIG     || "",
};

const CLOSES_PER_TX = 8;
const THROTTLE_MS = 250;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function findOpenIndices(
  connection: Connection,
  multisigPda: PublicKey,
  lastIndex: number,
): Promise<number[]> {
  const indices = Array.from({ length: lastIndex }, (_, i) => i + 1);
  const pdas = indices.map((i) =>
    multisig.getTransactionPda({ multisigPda, index: BigInt(i) })[0],
  );

  const open: number[] = [];
  for (let off = 0; off < pdas.length; off += 100) {
    const slice = pdas.slice(off, off + 100);
    const infos = await connection.getMultipleAccountsInfo(slice);
    for (let j = 0; j < infos.length; j++) {
      if (infos[j] !== null) open.push(indices[off + j]);
    }
  }
  return open;
}

async function closeBatch(
  connection: Connection,
  authority: Keypair,
  multisigPda: PublicKey,
  batch: number[],
): Promise<{ ok: boolean; reason?: string }> {
  try {
    const tx = new Transaction();
    for (const i of batch) {
      tx.add(
        multisig.instructions.vaultTransactionAccountsClose({
          multisigPda,
          rentCollector: authority.publicKey,
          transactionIndex: BigInt(i),
        }),
      );
    }
    tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
    tx.feePayer = authority.publicKey;
    await sendAndConfirmTransaction(connection, tx, [authority], {
      commitment: "confirmed",
      skipPreflight: false,
    });
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, reason: msg.slice(0, 200) };
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

  let totalClosed = 0;

  for (const [name, addr] of Object.entries(MULTISIGS)) {
    if (!addr) {
      console.log(`[${name}] multisig env var unset, skipping\n`);
      continue;
    }
    const multisigPda = new PublicKey(addr);
    let ms;
    try {
      ms = await multisig.accounts.Multisig.fromAccountAddress(connection, multisigPda);
    } catch {
      console.log(`[${name}] multisig not found, skipping\n`);
      continue;
    }

    if (!ms.rentCollector) {
      console.log(`[${name}] rentCollector is NULL — set it via fix-rent-collector.ts before reclaiming\n`);
      continue;
    }

    const lastIndex = Number(ms.transactionIndex);
    const open = await findOpenIndices(connection, multisigPda, lastIndex);
    console.log(`[${name}] scanned 1..${lastIndex}, ${open.length} still open`);
    if (open.length === 0) {
      console.log();
      continue;
    }

    let closed = 0;
    let failed = 0;
    for (let off = 0; off < open.length; off += CLOSES_PER_TX) {
      const batch = open.slice(off, off + CLOSES_PER_TX);
      const res = await closeBatch(connection, authority, multisigPda, batch);
      if (res.ok) {
        closed += batch.length;
        process.stdout.write(`  ✓ closed [${batch.join(",")}]\n`);
      } else {
        failed += batch.length;
        process.stdout.write(`  · batch [${batch.join(",")}] failed: ${res.reason}\n`);
      }
      await sleep(THROTTLE_MS);
    }
    console.log(`[${name}] closed=${closed}  failed=${failed}`);
    totalClosed += closed;
    console.log();
  }

  const endSol = await connection.getBalance(authority.publicKey);
  console.log("Ending SOL:", (endSol / LAMPORTS_PER_SOL).toFixed(6));
  console.log(
    `Net change: ${((endSol - startSol) / LAMPORTS_PER_SOL).toFixed(6)} SOL across ${totalClosed} close ops`,
  );
}

main().catch((e) => {
  console.error("Reclaim failed:", e);
  process.exit(1);
});
