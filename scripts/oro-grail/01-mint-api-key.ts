/**
 * Step 1: Mint a PARTNER API key on GRAIL devnet.
 *
 *   bun run scripts/oro-grail/01-mint-api-key.ts
 *
 * Saves the api_key to .keys_vaults/oro/grail-api-key-devnet.txt (chmod 600).
 * GRAIL only returns the raw key once — if lost, revoke and re-mint.
 */

import { mintApiKey } from "@/lib/integrations/grail";
import {
  PARTNER_ID,
  loadPartnerKeypair,
  makeUnauthedClient,
  saveApiKey,
  logKv,
} from "./_shared";

async function main() {
  const partner = loadPartnerKeypair();
  console.log(`Partner wallet: ${partner.publicKey.toBase58()}`);
  console.log(`Partner ID:     ${PARTNER_ID}`);

  const client = makeUnauthedClient();
  const keyName = `foundation-devnet-${new Date().toISOString().slice(0, 10)}`;

  const { apiKey, keyId } = await mintApiKey({
    client,
    partnerId: PARTNER_ID,
    partnerKeypair: partner,
    keyName,
  });

  saveApiKey(apiKey);

  logKv("minted", {
    key_id: keyId,
    key_name: keyName,
    api_key_prefix: apiKey.slice(0, 24) + "…",
    saved_to: ".keys_vaults/oro/grail-api-key-devnet.txt",
  });
}

main().catch((err) => {
  console.error("FAILED:", err);
  process.exit(1);
});
