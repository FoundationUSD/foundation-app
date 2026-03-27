/**
 * Server-only module — loads the vault authority keypair.
 * NEVER import this in client-side code.
 */

import { Connection, Keypair } from "@solana/web3.js";
import bs58 from "bs58";

let _authority: Keypair | null = null;
let _connection: Connection | null = null;

export function getVaultAuthority(): Keypair {
  if (!_authority) {
    const secret = process.env.VAULT_AUTHORITY_SECRET;
    if (!secret) {
      throw new Error("VAULT_AUTHORITY_SECRET not set");
    }
    _authority = Keypair.fromSecretKey(bs58.decode(secret));
  }
  return _authority;
}

export function getConnection(): Connection {
  if (!_connection) {
    const rpcUrl = process.env.SOLANA_RPC_URL || process.env.NEXT_PUBLIC_SOLANA_RPC_URL!;
    _connection = new Connection(rpcUrl, "confirmed");
  }
  return _connection;
}
