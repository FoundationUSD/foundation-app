/**
 * PRIME — Figure tokenized HELOC market on Kamino.
 *
 * The PRIME market itself is already wired in `src/lib/integrations/kamino.ts`. This
 * thin wrapper exposes only the data shape the AWY aggregator expects, sourced from
 * the existing Kamino API path so we don't double-fetch.
 *
 * Yield from tokenized consumer credit — primarily HELOCs originated by Figure (largest
 * non-bank HELOC provider in the US). Delivered via PRIME on Solana through the Figure
 * RWA Consortium, bridged from Provenance Blockchain via Chainlink CCIP.
 */
import { KAMINO_MARKETS, getKaminoReserves } from "../kamino";

export interface PrimeLiveData {
  apy: number;
  nav: number | null;
  mint: string;
  source: string;
}

const PRIME_MARKET = KAMINO_MARKETS.find((m) => m.id === "prime")!.address;

export async function getPrimeData(): Promise<PrimeLiveData> {
  const reserves = await getKaminoReserves(PRIME_MARKET);
  const usdc = reserves.find((r) => r.symbol.toUpperCase() === "USDC");
  if (!usdc || usdc.supplyApy <= 0) {
    return { apy: 0, nav: null, mint: "", source: "spec-fallback" };
  }
  return {
    apy: usdc.supplyApy * 100,
    nav: 1, // USDC is the supply asset; PRIME borrows are USDC-denominated
    mint: usdc.mintAddress,
    source: "kamino-prime",
  };
}
