/**
 * Step 5: Quote and submit a physical-gold redemption on GRAIL devnet.
 *
 *   bun run scripts/oro-grail/05-redeem.ts [country] [denomination_index]
 *
 * Defaults: country=AE, denomination_index=0 (first denom returned).
 * Only the user wallet co-signs — partner does NOT sign redemptions.
 */

import { cosignRedemption, GrailApiError } from "@/lib/integrations/grail";
import {
  loadTestUserKeypair,
  loadUserRecord,
  makeAuthedClient,
  logKv,
} from "./_shared";

async function main() {
  const country = (process.argv[2] || "AE").toUpperCase();
  const denomIndex = Number(process.argv[3] || "0");

  const user = loadTestUserKeypair();
  const userRec = loadUserRecord();
  const client = makeAuthedClient();

  const denomList = await client.listDenominations(country);
  if (denomList.denominations.length === 0) {
    throw new Error(`No denominations available for country=${country}`);
  }
  logKv("denominations", denomList.denominations);

  const chosen = denomList.denominations[denomIndex];
  if (!chosen) throw new Error(`No denomination at index ${denomIndex}`);
  console.log(`\nChosen: ${chosen.label} (${chosen.weight_g}g) in ${chosen.city}`);

  const quote = await client.quoteRedemption({
    grail_user_id: userRec.grail_user_id,
    denomination_id: chosen.id,
    city: chosen.city,
  });
  logKv("quote", { redemption_id: quote.redemption_id, ...quote.quote });

  const signedB64 = cosignRedemption({
    partiallySignedTransactionB64: quote.partially_signed_transaction,
    userKeypair: user,
  });

  const submit = await client.submitRedemption(quote.redemption_id, { signed_tx: signedB64 });
  logKv("submitted", submit);

  const redemption = await client.getRedemption(quote.redemption_id);
  logKv("redemption", redemption);
}

main().catch((err) => {
  console.error("FAILED:", err);
  if (err instanceof GrailApiError) {
    console.error(`  status=${err.status} code=${err.code} field=${err.field ?? "-"}`);
  }
  process.exit(1);
});
