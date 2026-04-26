/**
 * Co-signing helpers for GRAIL partial-signed transactions.
 *
 * GRAIL returns legacy `Transaction` (not VersionedTransaction) objects
 * pre-signed by their backend. Buy/sell needs partner + user partialSigns;
 * redemption needs only the user partialSign.
 *
 * Blockhash window is ~60s — sign + submit fast.
 */

import { Keypair, Transaction } from "@solana/web3.js";

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
