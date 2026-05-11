/**
 * syrupUSDC leg — institutional-lending exposure for the AWY basket.
 *
 * Reality check: syrupUSDC on Solana is a CCIP-bridged token from Ethereum
 * (mintAuthority = Chainlink pool). It's NOT a borrowable / supply asset on
 * any Kamino lending market — only an LP pair on Kamino Liquidity / Orca.
 * That means a Solana program cannot atomically deposit USDC and end up
 * holding syrupUSDC with its underlying yield.
 *
 * For the AWY routing we therefore supply the slice into Kamino's Syrup
 * market USDC reserve — same operational rail as PRIME — and earn Kamino's
 * USDC supply APY there. This isn't true Maple yield but it's the cleanest
 * mainnet-addressable proxy until Maple ships a Solana-native lending
 * program (or until Hastra/Figure publishes a syrupUSDC alt rail).
 *
 * Naming note: the user-facing name for this venue is "Syrup". Kamino's
 * API id for the same market is `"main"` (legacy); the registry in
 * `kamino.ts` aliases the two — we look up by id `"main"` here.
 *
 *   Verified syrupUSDC mint:  AvZZF1YaZDziPY2RCK4oJrRVrbN3mTD9NL24hPeaZeUj  (SPL, 6 dec)
 *   Live APY source:          Kamino Syrup market USDC supply
 *   Reference yield:          Maple canonical Eth pool via DefiLlama (informational)
 */

import { KAMINO_MARKETS, getKaminoReserves } from "../kamino";

const SYRUP_USDC_MINT_MAINNET =
  process.env.NEXT_PUBLIC_SYRUP_USDC_MINT ||
  "AvZZF1YaZDziPY2RCK4oJrRVrbN3mTD9NL24hPeaZeUj";

const SYRUP_MARKET = KAMINO_MARKETS.find((m) => m.id === "main")!.address;

// DefiLlama pool for the canonical Maple Ethereum syrupUSDC pool — used only
// as a reference / informational fallback, not the routing rate.
const LLAMA_POOL_ETH_SYRUP = "43641cf5-a92e-416b-bce9-27113d3c0db6";

export interface SyrupUsdcLiveData {
  apy: number;
  nav: number | null;
  mint: string;
  source: string;
}

let _llamaCache: { apy: number; ts: number } | null = null;

async function fetchLlamaSyrupApy(): Promise<number> {
  if (_llamaCache && Date.now() - _llamaCache.ts < 600_000) return _llamaCache.apy;
  try {
    const res = await fetch("https://yields.llama.fi/pools", {
      next: { revalidate: 600 },
    });
    if (!res.ok) return 0;
    const json = await res.json();
    const pool = (json?.data ?? []).find(
      (p: { pool: string }) => p.pool === LLAMA_POOL_ETH_SYRUP,
    );
    const apy = Number(pool?.apy ?? pool?.apyBase ?? 0);
    if (Number.isFinite(apy) && apy > 0) {
      _llamaCache = { apy, ts: Date.now() };
      return apy;
    }
  } catch {}
  return 0;
}

export async function getSyrupUsdcData(): Promise<SyrupUsdcLiveData> {
  try {
    const reserves = await getKaminoReserves(SYRUP_MARKET);
    const usdc = reserves.find((r) => r.symbol.toUpperCase() === "USDC");
    if (usdc && usdc.supplyApy > 0) {
      return {
        apy: usdc.supplyApy * 100,
        nav: 1,
        mint: SYRUP_USDC_MINT_MAINNET,
        source: "kamino-syrup-usdc",
      };
    }
  } catch {}

  // Fallback to canonical Eth syrupUSDC rate — strictly informational; the
  // basket isn't actually exposed to this rate, but it's better than zero.
  const llamaApy = await fetchLlamaSyrupApy();
  if (llamaApy > 0) {
    return {
      apy: llamaApy,
      nav: 1,
      mint: SYRUP_USDC_MINT_MAINNET,
      source: "defillama-eth-fallback",
    };
  }

  return { apy: 0, nav: null, mint: SYRUP_USDC_MINT_MAINNET, source: "spec-fallback" };
}
