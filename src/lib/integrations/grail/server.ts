/**
 * Server-only GRAIL wiring. Loads partner key, user key, API key, and
 * grail_user_id from env (preferred for Fly) or from the local
 * `.keys_vaults/oro/` files (dev fallback).
 *
 * Pointed at GRAIL devnet — the ORO vault uses these to demo buy/sell while
 * we wait on mainnet whitelisting.
 */

import fs from "fs";
import path from "path";
import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";
import { GrailClient } from "./client";

const ROOT = process.cwd();
const KEYS_DIR = path.join(ROOT, ".keys_vaults", "oro");

const PARTNER_KEY_FILE = path.join(KEYS_DIR, "partner_keys", "grail-partner-devnet.json");
const TEST_USER_KEY_FILE = path.join(KEYS_DIR, "test_user", "keypair.json");
const API_KEY_FILE = path.join(KEYS_DIR, "grail-api-key-devnet.txt");
const USER_RECORD_FILE = path.join(KEYS_DIR, "test_user", "grail-user.json");

export const GRAIL_BASE_URL =
  process.env.ORO_GRAIL_BASE_URL || "https://grail-stack-dev.onrender.com";

function loadKeypairFromBase58(secret: string): Keypair {
  return Keypair.fromSecretKey(bs58.decode(secret.trim()));
}

function loadKeypairFromJsonFile(p: string): Keypair {
  const arr = JSON.parse(fs.readFileSync(p, "utf8"));
  return Keypair.fromSecretKey(Uint8Array.from(arr));
}

export function loadGrailPartnerKeypair(): Keypair {
  const env = process.env.ORO_GRAIL_PARTNER_SECRET;
  if (env) return loadKeypairFromBase58(env);
  if (fs.existsSync(PARTNER_KEY_FILE)) return loadKeypairFromJsonFile(PARTNER_KEY_FILE);
  throw new Error(
    "GRAIL partner keypair not configured: set ORO_GRAIL_PARTNER_SECRET or place key at .keys_vaults/oro/partner_keys/grail-partner-devnet.json",
  );
}

export function loadGrailTestUserKeypair(): Keypair {
  const env = process.env.ORO_GRAIL_TEST_USER_SECRET;
  if (env) return loadKeypairFromBase58(env);
  if (fs.existsSync(TEST_USER_KEY_FILE)) return loadKeypairFromJsonFile(TEST_USER_KEY_FILE);
  throw new Error(
    "GRAIL test user keypair not configured: set ORO_GRAIL_TEST_USER_SECRET or place key at .keys_vaults/oro/test_user/keypair.json",
  );
}

export function loadGrailApiKey(): string {
  const env = process.env.ORO_GRAIL_API_KEY;
  if (env) return env.trim();
  if (fs.existsSync(API_KEY_FILE)) return fs.readFileSync(API_KEY_FILE, "utf8").trim();
  throw new Error(
    "GRAIL API key not configured: set ORO_GRAIL_API_KEY or place key at .keys_vaults/oro/grail-api-key-devnet.txt",
  );
}

export function loadGrailUserId(): string {
  const env = process.env.ORO_GRAIL_USER_ID;
  if (env) return env.trim();
  if (fs.existsSync(USER_RECORD_FILE)) {
    const rec = JSON.parse(fs.readFileSync(USER_RECORD_FILE, "utf8"));
    if (rec.grail_user_id) return rec.grail_user_id;
  }
  throw new Error(
    "GRAIL user id not configured: set ORO_GRAIL_USER_ID or place record at .keys_vaults/oro/test_user/grail-user.json",
  );
}

export function makeGrailServerClient(): GrailClient {
  return new GrailClient({ baseUrl: GRAIL_BASE_URL, apiKey: loadGrailApiKey() });
}
