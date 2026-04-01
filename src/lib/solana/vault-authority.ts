/**
 * Server-only module — loads the vault authority keypair using @solana/kit.
 * NEVER import this in client-side code.
 */

import { createKeyPairSignerFromBytes, type KeyPairSigner } from "@solana/kit";
import bs58 from "bs58";

let _authority: KeyPairSigner | null = null;

export async function getVaultAuthority(): Promise<KeyPairSigner> {
  if (!_authority) {
    const secret = process.env.VAULT_AUTHORITY_SECRET;
    if (!secret) {
      throw new Error("VAULT_AUTHORITY_SECRET not set");
    }
    _authority = await createKeyPairSignerFromBytes(bs58.decode(secret));
  }
  return _authority;
}

export { getRpc, getRpcSubscriptions, getSendAndConfirmTransaction } from "./rpc";
