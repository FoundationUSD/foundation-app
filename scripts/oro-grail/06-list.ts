/**
 * Inspect: list api keys, users, trades, redemptions.
 *
 *   bun run scripts/oro-grail/06-list.ts
 */

import { makeAuthedClient, logKv } from "./_shared";

async function main() {
  const client = makeAuthedClient();
  logKv("api_keys", await client.listApiKeys());
  logKv("users", await client.listUsers());
  logKv("trades", await client.listTrades({ limit: "10" }));
  logKv("redemptions", await client.listRedemptions());
}

main().catch((err) => {
  console.error("FAILED:", err);
  process.exit(1);
});
