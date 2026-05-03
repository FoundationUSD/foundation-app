/**
 * PRIME — Hastra/Figure tokenized HELOC asset on Solana.
 *
 *   Mint:        3b8X44fLF9ooXaUm3hhSgjpmVs6rZZ3pPoGnGahc3Uu7  (SPL)
 *   Issuer:      Hastra (Figure HELOC tokenization)
 *   Architecture: PRIME = staked wYLDS on Solana. wYLDS wraps Figure's YLDS
 *                 yield-bearing stablecoin, bridged via Chainlink CCIP.
 *
 * For the AWY basket we route the PRIME slice into Kamino's PRIME lending
 * market — Foundation supplies USDC and earns supply APY against PRIME-asset
 * collateral. Hastra's own SDK / Chainlink feed for the PRIME asset itself
 * isn't published yet, so this is the closest mainnet PRIME-yield proxy
 * that's actually addressable from a smart contract.
 *
 * APY source: Kamino's PRIME-market reserves metrics endpoint, USDC reserve.
 */

import { KAMINO_MARKETS, getKaminoReserves } from "../kamino";

const PRIME_MINT_MAINNET =
  process.env.NEXT_PUBLIC_PRIME_MINT ||
  "3b8X44fLF9ooXaUm3hhSgjpmVs6rZZ3pPoGnGahc3Uu7";

const PRIME_MARKET = KAMINO_MARKETS.find((m) => m.id === "prime")!.address;

export interface PrimeLiveData {
  apy: number;
  nav: number | null;
  mint: string;
  source: string;
}

export async function getPrimeData(): Promise<PrimeLiveData> {
  try {
    const reserves = await getKaminoReserves(PRIME_MARKET);
    const usdc = reserves.find((r) => r.symbol.toUpperCase() === "USDC");
    if (!usdc || usdc.supplyApy <= 0) {
      return { apy: 0, nav: null, mint: PRIME_MINT_MAINNET, source: "spec-fallback" };
    }
    return {
      apy: usdc.supplyApy * 100,
      nav: 1, // PRIME tracks $1 NAV; USDC supply position is 1:1 in book value
      mint: PRIME_MINT_MAINNET,
      source: "kamino-prime-usdc",
    };
  } catch {
    return { apy: 0, nav: null, mint: PRIME_MINT_MAINNET, source: "spec-fallback" };
  }
}
