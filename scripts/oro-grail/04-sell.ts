/**
 * Step 4: Quote and submit a $GOLD → USDC sell on GRAIL devnet.
 *
 *   bun run scripts/oro-grail/04-sell.ts [gold_amount]
 *
 * Defaults to 0.001 GOLD. Same co-sign pattern as buy.
 */

import { cosignBuyOrSell, GrailApiError } from "@/lib/integrations/grail";
import {
  loadPartnerKeypair,
  loadTestUserKeypair,
  loadUserRecord,
  makeAuthedClient,
  logKv,
} from "./_shared";

const POLL_INTERVAL_MS = 2_000;
const POLL_TIMEOUT_MS = 60_000;

async function main() {
  const goldAmount = Number(process.argv[2] || "0.001");
  if (!Number.isFinite(goldAmount) || goldAmount <= 0) {
    throw new Error(`Invalid gold_amount: ${process.argv[2]}`);
  }

  const partner = loadPartnerKeypair();
  const user = loadTestUserKeypair();
  const userRec = loadUserRecord();
  const client = makeAuthedClient();

  console.log(`Selling ${goldAmount} $GOLD for ${userRec.grail_user_id}`);

  const quote = await client.quoteSell({
    grail_user_id: userRec.grail_user_id,
    gold_amount: goldAmount,
    slippage_bps: 50,
  });
  logKv("quote", { trade_id: quote.trade_id, ...quote.quote });

  const signedB64 = cosignBuyOrSell({
    partiallySignedTransactionB64: quote.partially_signed_transaction,
    partnerKeypair: partner,
    userKeypair: user,
  });

  const submit = await client.submitSell(quote.trade_id, { signed_tx: signedB64 });
  logKv("submitted", submit);

  const trade = await pollTrade(client, quote.trade_id);
  logKv("trade", trade);
}

async function pollTrade(client: ReturnType<typeof makeAuthedClient>, tradeId: string) {
  const start = Date.now();
  while (Date.now() - start < POLL_TIMEOUT_MS) {
    try {
      return await client.getTrade(tradeId);
    } catch (err) {
      if (err instanceof GrailApiError && err.status === 404) {
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
        continue;
      }
      throw err;
    }
  }
  throw new Error(`Trade ${tradeId} not indexed within ${POLL_TIMEOUT_MS}ms`);
}

main().catch((err) => {
  console.error("FAILED:", err);
  if (err instanceof GrailApiError) {
    console.error(`  status=${err.status} code=${err.code} field=${err.field ?? "-"}`);
  }
  process.exit(1);
});
