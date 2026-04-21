/**
 * Curated RWA strategies — Foundation aggregates yield from vetted institutional sources.
 * Each strategy wraps a specific protocol integration with a unified interface.
 */

const KAMINO_API = "https://api.kamino.finance";

export interface RWAStrategy {
  id: string;
  name: string;
  underlying: string;
  description: string;
  protocol: "kamino" | "solomon";
  riskTier: "conservative" | "moderate" | "growth";
  depositAsset: string;
  apy: number;
  tvl: number;
  minDeposit: number;
  features: string[];
  // Protocol-specific config for deposit routing
  config: Record<string, string>;
}

/**
 * Fetch Kamino PRIME market USDC supply APY
 */
async function fetchKaminoPrimeApy(): Promise<{ apy: number; tvl: number }> {
  try {
    const res = await fetch(
      `${KAMINO_API}/kamino-market/CqAoLuqWtavaVE8deBjMKe8ZfSt9ghR6Vb8nfsyabyHA/reserves/metrics`,
      { next: { revalidate: 300 } },
    );
    if (!res.ok) return { apy: 0, tvl: 0 };
    const data = await res.json();
    if (!Array.isArray(data)) return { apy: 0, tvl: 0 };

    const usdc = data.find((r: Record<string, unknown>) =>
      String(r.liquidityToken || "").toUpperCase() === "USDC",
    );
    return {
      apy: usdc ? Number(usdc.supplyApy || 0) * 100 : 0,
      tvl: data.reduce((sum: number, r: Record<string, unknown>) => sum + Number(r.totalSupplyUsd || 0), 0),
    };
  } catch {
    return { apy: 0, tvl: 0 };
  }
}

/**
 * Get all curated RWA strategies with live data
 */
export async function getStrategies(): Promise<RWAStrategy[]> {
  const kaminoPrime = await fetchKaminoPrimeApy();

  const strategies: RWAStrategy[] = [];

  // 1. Kamino PRIME — USDC lending against Figure HELOCs
  strategies.push({
    id: "kamino-prime-usdc",
    name: "PRIME Credit Yield",
    underlying: "Figure Home Equity (PRIME)",
    description:
      "Supply USDC to Kamino's PRIME market. Backed by Figure's $19B HELOC portfolio — prime borrowers, avg FICO 745. Withdraw anytime.",
    protocol: "kamino",
    riskTier: "conservative",
    depositAsset: "USDC",
    apy: kaminoPrime.apy,
    tvl: kaminoPrime.tvl,
    minDeposit: 1,
    features: ["No lockup", "Institutional collateral", "$570M+ market"],
    config: {
      market: "CqAoLuqWtavaVE8deBjMKe8ZfSt9ghR6Vb8nfsyabyHA",
      mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    },
  });

  // 2. Solomon sUSDV — basis trade yield
  strategies.push({
    id: "solomon-susdv",
    name: "sUSDV Basis Yield",
    underlying: "Solomon Labs (USDv/sUSDV)",
    description:
      "Stake USDv to earn yield from delta-neutral basis trading on BTC, ETH, and SOL. Custody via Ceffu. 7-day cooldown on unstake.",
    protocol: "solomon",
    riskTier: "moderate",
    depositAsset: "USDv",
    apy: 12.5,
    tvl: 0, // filled by live data
    minDeposit: 10,
    features: ["12.5% target APY", "Basis trade strategy", "7-day cooldown"],
    config: {
      stakeProgram: "HSnn7bDvkZSEwujZDPtUcdo9KL7Conycgmy8m6mBFD5",
      usdvMint: "Ex5DaKYMCN6QWFA4n67TmMwsH8MJV68RX6YXTmVM532C",
      susdvMint: "pTA4St7D5WshfLUPBXoaxn5m8e3k2ort2DVt3gUTa17",
    },
  });

  return strategies.sort((a, b) => b.apy - a.apy);
}
