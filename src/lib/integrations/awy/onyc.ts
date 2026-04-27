/**
 * ONyc — OnRe reinsurance receipt token.
 *
 * Yield from reinsurance premiums on diversified property, casualty, and specialty
 * lines underwritten by OnRe (Bermuda BMA-regulated reinsurer). NAV accrues daily via
 * Chainlink + Pyth dual feeds. Live as collateral on Kamino; secondary liquidity on
 * Orca / Raydium / Meteora.
 *
 * Mint and Kamino reserve are stubbed because OnRe's Solana deployment is not yet
 * publicly addressable as of this commit. Wire real addresses once OnRe publishes
 * canonical mainnet pubkeys.
 */

const ONYC_MINT_MAINNET = process.env.NEXT_PUBLIC_ONYC_MINT || "";

export interface OnycLiveData {
  apy: number;
  nav: number | null;
  mint: string;
  source: string;
}

/**
 * Fetch live ONyc APY + NAV. Returns spec fallback (apy 0) until OnRe addresses are
 * wired so callers can detect "not live yet" and substitute the static spec APY.
 */
export async function getOnycData(): Promise<OnycLiveData> {
  if (!ONYC_MINT_MAINNET) {
    return { apy: 0, nav: null, mint: "", source: "spec-fallback" };
  }
  // TODO: read APY from Kamino reserve metrics once ONyc reserve is published.
  // TODO: read NAV from Chainlink/Pyth feed (or Kamino reserve nav field).
  return { apy: 0, nav: null, mint: ONYC_MINT_MAINNET, source: "spec-fallback" };
}
