/**
 * Step 3: Quote and submit a USDC → $GOLD buy on GRAIL devnet.
 *
 *   bun run scripts/oro-grail/03-buy.ts [usdc_amount]
 *
 * Defaults to 10 USDC. Co-signs with partner + user keypairs, submits via
 * /v1/buy/{trade_id}/submit, then polls the trade row.
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
  const usdcAmount = Number(process.argv[2] || "10");
  if (!Number.isFinite(usdcAmount) || usdcAmount <= 0) {
    throw new Error(`Invalid usdc_amount: ${process.argv[2]}`);
  }

  const partner = loadPartnerKeypair();
  const user = loadTestUserKeypair();
  const userRec = loadUserRecord();
  const client = makeAuthedClient();

  console.log(`Buying ${usdcAmount} USDC of $GOLD for ${userRec.grail_user_id}`);

  const quote = await client.quoteBuy({
    grail_user_id: userRec.grail_user_id,
    usdc_amount: usdcAmount,
    slippage_bps: 50,
  });
  logKv("quote", { trade_id: quote.trade_id, ...quote.quote });

  const signedB64 = cosignBuyOrSell({
    partiallySignedTransactionB64: quote.partially_signed_transaction,
    partnerKeypair: partner,
    userKeypair: user,
  });

  const submit = await client.submitBuy(quote.trade_id, { signed_tx: signedB64 });
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
