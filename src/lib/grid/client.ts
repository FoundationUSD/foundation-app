/**
 * Squads Grid client wrapper.
 *
 * Foundation uses Grid to provision per-user smart accounts (Squads V4 multisigs
 * under the hood) so user funds aren't held in shared Foundation-controlled
 * vaults. Every smart account is 2-of-2: Foundation co-signer + user signer.
 *
 * Auth modes (chosen by the user at signup):
 *   - "email": Privy-managed user key, signed via OTP / email magic link
 *   - "wallet": user's own Solana wallet pubkey is the signer
 *
 * Threshold growth path:
 *   today  → 2-of-2 (Foundation + user)
 *   later  → 4-of-? (add Eugene + a partner co-signer); user still required
 */

import { GridClient } from "@sqds/grid";
import type { GridEnvironment } from "@sqds/grid";

let _client: GridClient | null = null;

export function getGridClient(): GridClient {
  if (_client) return _client;
  const apiKey = process.env.GRID_API_KEY;
  if (!apiKey) {
    throw new Error(
      "GRID_API_KEY env var missing. Sign up at https://grid.squads.xyz/dashboard, " +
      "create a sandbox or production key, and set GRID_API_KEY in .env.local + Fly secrets.",
    );
  }
  const environment: GridEnvironment =
    (process.env.GRID_ENVIRONMENT as GridEnvironment) || "sandbox";

  _client = new GridClient({
    apiKey,
    environment,
    solanaRpcUrl: process.env.SOLANA_RPC_URL,
  });
  return _client;
}

/** Foundation's co-signer pubkey added to every per-user smart account. */
export const FOUNDATION_COSIGNER_PUBKEY =
  process.env.FOUNDATION_COSIGNER_PUBKEY ||
  process.env.NEXT_PUBLIC_VAULT_AUTHORITY ||
  "4J9mszyDLi4js4rh8Hq5spNaLCNt4fRozr781zcVBYgv";

/** Wallets exempt from the 0.024 SOL setup fee while we iterate. */
export const FEE_EXEMPT_WALLETS = new Set(
  (process.env.FEE_EXEMPT_WALLETS || "3Mp5ArYysNCXxNnUeBnRCaFWGbCzHAiYoJacYK4Hhc2r")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
);

/** Setup fee charged on user account creation (in SOL, before refund). */
export const ACCOUNT_SETUP_FEE_SOL = Number(process.env.ACCOUNT_SETUP_FEE_SOL || "0.024");
/** Refund returned when user closes their account (Foundation keeps the spread). */
export const ACCOUNT_CLOSE_REFUND_SOL = Number(process.env.ACCOUNT_CLOSE_REFUND_SOL || "0.01");
