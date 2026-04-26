/**
 * Shared helpers for Oro GRAIL devnet test scripts.
 * Run via: bun run scripts/oro-grail/<script>.ts
 */

import fs from "fs";
import path from "path";
import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";
import { GrailClient } from "@/lib/integrations/grail";

export const GRAIL_BASE_URL =
  process.env.ORO_GRAIL_BASE_URL || "https://grail-stack-dev.onrender.com";

export const PARTNER_ID =
  process.env.ORO_GRAIL_PARTNER_ID || "e24b7f2d-45b2-40b4-9653-4cdd2dbf4cfb";

const ROOT = process.cwd();
const KEYS_DIR = path.join(ROOT, ".keys_vaults", "oro");

export const PARTNER_KEYPAIR_PATH = path.join(KEYS_DIR, "partner_keys", "grail-partner-devnet.json");
export const TEST_USER_KEYPAIR_PATH = path.join(KEYS_DIR, "test_user", "keypair.json");
export const API_KEY_PATH = path.join(KEYS_DIR, "grail-api-key-devnet.txt");
export const USER_RECORD_PATH = path.join(KEYS_DIR, "test_user", "grail-user.json");

export function loadKeypairFromJson(p: string): Keypair {
  const arr = JSON.parse(fs.readFileSync(p, "utf8"));
  return Keypair.fromSecretKey(Uint8Array.from(arr));
}

export function loadKeypairFromBase58Txt(p: string): Keypair {
  const raw = fs.readFileSync(p, "utf8").trim();
  return Keypair.fromSecretKey(bs58.decode(raw));
}

export function loadPartnerKeypair(): Keypair {
  return loadKeypairFromJson(PARTNER_KEYPAIR_PATH);
}

export function loadTestUserKeypair(): Keypair {
  return loadKeypairFromJson(TEST_USER_KEYPAIR_PATH);
}

export function loadApiKey(): string {
  if (!fs.existsSync(API_KEY_PATH)) {
    throw new Error(
      `API key not found at ${API_KEY_PATH}. Run scripts/oro-grail/01-mint-api-key.ts first.`,
    );
  }
  return fs.readFileSync(API_KEY_PATH, "utf8").trim();
}

export function saveApiKey(apiKey: string) {
  fs.mkdirSync(path.dirname(API_KEY_PATH), { recursive: true });
  fs.writeFileSync(API_KEY_PATH, apiKey);
  fs.chmodSync(API_KEY_PATH, 0o600);
}

export interface SavedUserRecord {
  grail_user_id: string;
  user_id: string;
  wallet_address: string;
  created_at: string;
}

export function loadUserRecord(): SavedUserRecord {
  if (!fs.existsSync(USER_RECORD_PATH)) {
    throw new Error(
      `User record not found at ${USER_RECORD_PATH}. Run scripts/oro-grail/02-create-user.ts first.`,
    );
  }
  return JSON.parse(fs.readFileSync(USER_RECORD_PATH, "utf8"));
}

export function saveUserRecord(rec: SavedUserRecord) {
  fs.mkdirSync(path.dirname(USER_RECORD_PATH), { recursive: true });
  fs.writeFileSync(USER_RECORD_PATH, JSON.stringify(rec, null, 2));
}

export function makeAuthedClient(): GrailClient {
  return new GrailClient({ baseUrl: GRAIL_BASE_URL, apiKey: loadApiKey() });
}

export function makeUnauthedClient(): GrailClient {
  return new GrailClient({ baseUrl: GRAIL_BASE_URL });
}

export function logKv(label: string, obj: unknown) {
  console.log(`\n=== ${label} ===`);
  console.log(JSON.stringify(obj, null, 2));
}
