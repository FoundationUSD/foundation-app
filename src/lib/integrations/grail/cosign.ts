/**
 * Co-signing helpers for GRAIL partial-signed transactions.
 *
 * GRAIL returns legacy `Transaction` (not VersionedTransaction) objects
 * pre-signed by their backend. Buy/sell needs partner + user partialSigns;
 * redemption needs only the user partialSign.
 *
 * Blockhash window is ~60s — sign + submit fast. If we lose the race, the
 * server returns a "blockhash not found" / "expired" error and the caller
 * should re-quote and retry. `isStaleBlockhashError` detects these.
 */

import { Keypair, Transaction } from "@solana/web3.js";
import { GrailApiError } from "./client";

export interface CosignBuySellParams {
  partiallySignedTransactionB64: string;
  partnerKeypair: Keypair;
  userKeypair: Keypair;
}

export interface CosignRedemptionParams {
  partiallySignedTransactionB64: string;
  userKeypair: Keypair;
}

export function cosignBuyOrSell(params: CosignBuySellParams): string {
  const tx = Transaction.from(Buffer.from(params.partiallySignedTransactionB64, "base64"));
  tx.partialSign(params.partnerKeypair);
  tx.partialSign(params.userKeypair);
  return tx
    .serialize({ requireAllSignatures: true, verifySignatures: true })
    .toString("base64");
}

export function cosignRedemption(params: CosignRedemptionParams): string {
  const tx = Transaction.from(Buffer.from(params.partiallySignedTransactionB64, "base64"));
  tx.partialSign(params.userKeypair);
  return tx
    .serialize({ requireAllSignatures: true, verifySignatures: true })
    .toString("base64");
}

/**
 * Heuristic match for "stale blockhash" / "expired tx" errors. Solana surfaces
 * these as "Blockhash not found" or "transaction expired"; GRAIL may also wrap
 * them with their own code. We err on the side of false-positive (retry) since
 * a re-quote is cheap.
 */
export function isStaleBlockhashError(err: unknown): boolean {
  if (!err) return false;
  const msg = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();
  if (msg.includes("blockhash") || msg.includes("expired") || msg.includes("stale")) return true;
  if (err instanceof GrailApiError) {
    const code = (err.code || "").toLowerCase();
    if (code.includes("blockhash") || code.includes("expired") || code.includes("stale")) return true;
  }
  return false;
}

/**
 * Run a GRAIL submit flow (quote → cosign → submit) with one retry on stale
 * blockhash. The `flow` callback re-runs the full quote + cosign + submit so
 * we get a fresh blockhash from GRAIL on retry.
 */
export async function withStaleBlockhashRetry<T>(flow: () => Promise<T>): Promise<T> {
  try {
    return await flow();
  } catch (err) {
    if (isStaleBlockhashError(err)) {
      console.warn("GRAIL: stale blockhash detected, re-quoting and retrying once");
      return await flow();
    }
    throw err;
  }
}
