/**
 * Solomon basis-trade leg for AWY.
 *
 * Replaces the prior USDY (Ondo Treasuries) slice. Solomon runs a delta-neutral
 * basis trade across BTC/ETH/SOL — funding-rate income with embedded perp
 * leverage internal to the strategy. AWY holds sUSDV (the staked receipt) and
 * the rate accrues continuously via Solomon's vault state.
 */
import { getSolomonData } from "@/lib/integrations/solomon";
import { SOLOMON_USDV_MINT } from "@/lib/constants";

export interface SolomonLegLiveData {
  apy: number;
  nav: number | null;
  mint: string;
  source: string;
}

export async function getSolomonAwyLegData(): Promise<SolomonLegLiveData> {
  try {
    const data = await getSolomonData();
    const apy = data.estimatedApy;
    if (!Number.isFinite(apy) || apy <= 0) {
      return { apy: 0, nav: null, mint: SOLOMON_USDV_MINT, source: "spec-fallback" };
    }
    return {
      apy,
      nav: data.exchangeRate > 0 ? data.exchangeRate : null,
      mint: SOLOMON_USDV_MINT,
      source: "solomon-onchain",
    };
  } catch {
    return { apy: 0, nav: null, mint: SOLOMON_USDV_MINT, source: "spec-fallback" };
  }
}
