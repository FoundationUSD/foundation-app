/**
 * USDY — Ondo Global Markets short-term US Treasuries token.
 *
 * Yield from short-term US T-bills + bank demand deposits. NAV accrues daily via
 * on-chain oracle. Issued by Ondo Global Markets BVI under Reg. S, custodied by
 * Fireblocks + Zodia.
 *
 * AWY MVP path: secondary-market only via Jupiter — Ondo primary mint has 40–50d
 * lockup which is incompatible with on-demand vault redemption semantics.
 *
 * Mainnet mint: A1KLoBrKBde8Ty9qtNQUtq3C2ortoC3u7twggz7sEto6 (USDY on Solana).
 */
const USDY_MINT_MAINNET =
  process.env.NEXT_PUBLIC_USDY_MINT || "A1KLoBrKBde8Ty9qtNQUtq3C2ortoC3u7twggz7sEto6";

const ONDO_API = "https://api.ondo.finance";

export interface UsdyLiveData {
  apy: number;
  nav: number | null;
  mint: string;
  source: string;
}

/**
 * Fetch live USDY APY + NAV. Ondo publishes a public yield endpoint; NAV is also
 * readable on-chain from Ondo's Solana oracle (deferred — API is sufficient for v0).
 */
export async function getUsdyData(): Promise<UsdyLiveData> {
  try {
    const res = await fetch(`${ONDO_API}/v1/usdy`, {
      next: { revalidate: 600 },
    });
    if (!res.ok) throw new Error(`Ondo API ${res.status}`);
    const data = await res.json();
    const apy = Number(data?.apy ?? data?.yield ?? 0);
    const nav = Number(data?.nav ?? data?.pricePerToken ?? 0);
    if (!Number.isFinite(apy) || apy <= 0) {
      return { apy: 0, nav: null, mint: USDY_MINT_MAINNET, source: "spec-fallback" };
    }
    return {
      apy,
      nav: Number.isFinite(nav) && nav > 0 ? nav : null,
      mint: USDY_MINT_MAINNET,
      source: "ondo-api",
    };
  } catch {
    return { apy: 0, nav: null, mint: USDY_MINT_MAINNET, source: "spec-fallback" };
  }
}
