/**
 * GRAIL challenge-response auth.
 *
 * Flow:
 *   1. POST /v1/auth/request-challenge { wallet_address, partner_id } → message
 *   2. Sign message with partner Ed25519 private key (raw bytes, base64-encoded sig)
 *   3. POST /v1/auth/create-api-key { challenge_id, signature, key_name }
 *
 * The signature MUST be base64. Sending base58 → 400 invalid_signature.
 * Challenge expires 2 minutes after issuance.
 */

import nacl from "tweetnacl";
import type { Keypair } from "@solana/web3.js";
import { GrailClient } from "./client";

export async function mintApiKey(params: {
  client: GrailClient;
  partnerId: string;
  partnerKeypair: Keypair;
  keyName: string;
}): Promise<{ apiKey: string; keyId: string }> {
  const challenge = await params.client.requestChallenge({
    wallet_address: params.partnerKeypair.publicKey.toBase58(),
    partner_id: params.partnerId,
  });

  const messageBytes = new TextEncoder().encode(challenge.message);
  const sigBytes = nacl.sign.detached(messageBytes, params.partnerKeypair.secretKey);
  const signatureB64 = Buffer.from(sigBytes).toString("base64");

  const result = await params.client.createApiKey({
    challenge_id: challenge.challenge_id,
    signature: signatureB64,
    key_name: params.keyName,
  });

  return { apiKey: result.api_key, keyId: result.key_id };
}
