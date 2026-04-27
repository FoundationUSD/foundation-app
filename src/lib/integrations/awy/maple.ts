/**
 * syrupUSDC — Maple Finance institutional lending receipt token.
 *
 * USDC deployed to vetted institutional borrowers (market makers, trading firms)
 * collateralized by BTC/ETH at ~160% LTV. Most liquid leg of AWY; integrated across
 * Kamino, Drift, and Pendle. Zero losses since Maple's 2022 pivot to overcollateralization.
 *
 * Mainnet mint: jSyhWi5kkAGZyyxx2qzhQiLXt9qyJxXYXgfqPNX5tnp (placeholder until verified
 * against the live deployment — env override takes precedence).
 */
const SYRUP_USDC_MINT_MAINNET =
  process.env.NEXT_PUBLIC_SYRUP_USDC_MINT || "jSyhWi5kkAGZyyxx2qzhQiLXt9qyJxXYXgfqPNX5tnp";

const MAPLE_API = "https://api.maple.finance";

export interface SyrupUsdcLiveData {
  apy: number;
  nav: number | null;
  mint: string;
  source: string;
}

/**
 * Fetch live syrupUSDC APY. Maple publishes pool-level rates on its public API; we
 * read the syrupUSDC pool specifically. Falls back to spec on any failure.
 */
export async function getSyrupUsdcData(): Promise<SyrupUsdcLiveData> {
  try {
    const res = await fetch(`${MAPLE_API}/v2/pools/syrupUSDC`, {
      next: { revalidate: 600 },
    });
    if (!res.ok) throw new Error(`Maple API ${res.status}`);
    const data = await res.json();
    const apy = Number(data?.apy ?? data?.supplyApy ?? 0);
    const nav = Number(data?.exchangeRate ?? data?.nav ?? 1);
    if (!Number.isFinite(apy) || apy <= 0) {
      return { apy: 0, nav: null, mint: SYRUP_USDC_MINT_MAINNET, source: "spec-fallback" };
    }
    return {
      apy,
      nav: Number.isFinite(nav) && nav > 0 ? nav : null,
      mint: SYRUP_USDC_MINT_MAINNET,
      source: "maple-api",
    };
  } catch {
    return { apy: 0, nav: null, mint: SYRUP_USDC_MINT_MAINNET, source: "spec-fallback" };
  }
}
