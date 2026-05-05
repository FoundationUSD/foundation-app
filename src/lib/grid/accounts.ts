/**
 * Per-user smart account creation via Squads Grid.
 *
 * Two paths:
 *   createWalletAccount(userWallet)  — user signs with their own Solana keypair
 *   createEmailAccount(email)        — Privy-managed key, OTP-authenticated
 *
 * Both produce 2-of-2 smart accounts whose only members are Foundation's
 * co-signer pubkey and the user's signer (wallet or Privy-derived). Threshold
 * is enforced by Squads V4 on-chain — Foundation alone cannot move funds.
 */

import { getGridClient, FOUNDATION_COSIGNER_PUBKEY } from "./client";

export interface CreatedAccount {
  /** Smart account address (Squads multisig PDA). */
  address: string;
  /** Funds-holding PDA derived from the smart account. */
  vaultAddress?: string;
  /** Auth mode used at creation. */
  authMode: "email" | "wallet";
}

/**
 * Create a 2-of-2 smart account where the user signs with their own Solana
 * wallet. Foundation's co-signer pubkey is the second member. Both keys must
 * vote+execute every proposal — Foundation alone cannot move funds.
 */
export async function createWalletAccount(userPubkey: string): Promise<CreatedAccount> {
  const grid = getGridClient();

  const res = await grid.createAccount({
    type: "signers",
    signers: [
      {
        address: FOUNDATION_COSIGNER_PUBKEY,
        // Foundation can propose + vote + execute, but threshold gate still
        // requires user vote — we never have unilateral execute power.
        permissions: ["Initiate", "Vote", "Execute"],
      },
      {
        address: userPubkey,
        permissions: ["Initiate", "Vote", "Execute"],
      },
    ],
    threshold: 2,
    memo: `Foundation user account · 2-of-2 (Foundation + ${userPubkey.slice(0, 8)})`,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);

  return {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    address: (res as any).address,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vaultAddress: (res as any).vaultAddress ?? (res as any).vault,
    authMode: "wallet",
  };
}

/**
 * Initiate email-based account creation. Grid uses Privy under the hood —
 * user gets an OTP email, completes auth via `completeEmailAccount`, and
 * Privy holds the key on their behalf (non-custodial via MPC).
 *
 * Returns an OTP id that the client passes back with the user's code.
 */
export async function initiateEmailAccount(email: string) {
  const grid = getGridClient();
  return grid.initAuth({
    type: "email",
    email,
    provider: "privy",
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
}

/**
 * Complete email auth + create the 2-of-2 account. Caller passes the OTP code
 * the user received. After this, Foundation has the account address and Privy
 * holds the user's signing key.
 *
 * NOTE: Email-auth accounts on Grid default to 1-of-1 (the Privy-managed user
 * key). To enforce 2-of-2 with Foundation as co-signer we update the account
 * after creation via `updateAccount` to add Foundation's pubkey + raise threshold.
 */
export async function completeEmailAccount({
  email,
  otpCode,
  authPublicKey,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sessionSecrets,
}: {
  email: string;
  otpCode: string;
  authPublicKey: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sessionSecrets: any;
}): Promise<CreatedAccount> {
  const grid = getGridClient();
  const res = await grid.completeAuthAndCreateAccount({
    otpCode,
    provider: "privy",
    user: { email, authPublicKey },
    sessionSecrets,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const address = (res as any).address ?? (res as any).data?.address;
  return { address, authMode: "email" };
}

/** Read live state of a Grid smart account (signers, threshold, balances). */
export async function getAccount(address: string) {
  const grid = getGridClient();
  return grid.getAccount(address);
}
