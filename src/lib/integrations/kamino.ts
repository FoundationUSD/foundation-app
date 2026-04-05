/**
 * Kamino Finance integration — RWA lending markets via REST API.
 *
 * Program: KLend2g3cP87fffoy8q1mQqGKjrxjC8boSyAYavgmjD
 * API: https://api.kamino.finance
 *
 * RWA Markets:
 *   PRIME (Figure): CqAoLuqWtavaVE8deBjMKe8ZfSt9ghR6Vb8nfsyabyHA
 *   Apollo sACRED: 3koBPZPPV4Ag4DPWCyTdAVGxzxABWw9vX8sjbbM2
 *   Main Market:   7u3HeHxYDLhnCoErrtycNokbQYbWGzLs6JSDqGAv5PfF
 */

const KAMINO_API = "https://api.kamino.finance";

export interface KaminoMarketConfig {
  id: string;
  name: string;
  address: string;
  description: string;
  category: "rwa" | "defi";
}

export const KAMINO_MARKETS: KaminoMarketConfig[] = [
  {
    id: "prime",
    name: "PRIME (Figure)",
    address: "CqAoLuqWtavaVE8deBjMKe8ZfSt9ghR6Vb8nfsyabyHA",
    description: "Supply USDC against PRIME collateral — $570M+ market, backed by Figure HELOCs",
    category: "rwa",
  },
  {
    id: "apollo",
    name: "Apollo sACRED",
    address: "3koBPZPPV4Ag4DPWCyTdAVGxzxABWw9vEZ9vX8sjbbM2",
    description: "Supply stablecoins against tokenized Apollo Diversified Credit fund",
    category: "rwa",
  },
  {
    id: "main",
    name: "Main Market",
    address: "7u3HeHxYDLhnCoErrtycNokbQYbWGzLs6JSDqGAv5PfF",
    description: "Kamino's primary lending market — SOL, USDC, and 20+ assets",
    category: "defi",
  },
];

export interface KaminoReserveData {
  reserve: string;
  symbol: string;
  mintAddress: string;
  supplyApy: number;
  borrowApy: number;
  totalSupply: number;
  totalSupplyUsd: number;
  totalBorrow: number;
  availableLiquidity: number;
  maxLtv: number;
}

export interface KaminoMarketData {
  market: KaminoMarketConfig;
  reserves: KaminoReserveData[];
  tvl: number;
  topSupplyApy: number;
}

/**
 * Fetch live reserve metrics for a specific Kamino market
 */
export async function getKaminoReserves(
  marketAddress?: string,
): Promise<KaminoReserveData[]> {
  const market = marketAddress || KAMINO_MARKETS[0].address;
  try {
    const isServer = typeof window === "undefined";
    const res = await fetch(
      `${KAMINO_API}/kamino-market/${market}/reserves/metrics`,
      isServer ? { next: { revalidate: 300 } } : undefined,
    );

    if (!res.ok) throw new Error(`Kamino API ${res.status}`);
    const data = await res.json();

    if (!Array.isArray(data)) return [];

    return data.map((r: Record<string, unknown>) => ({
      reserve: String(r.reserve || ""),
      symbol: String(r.liquidityToken || "Unknown"),
      mintAddress: String(r.liquidityTokenMint || ""),
      supplyApy: Number(r.supplyApy || 0),
      borrowApy: Number(r.borrowApy || 0),
      totalSupply: Number(r.totalSupply || 0),
      totalSupplyUsd: Number(r.totalSupplyUsd || 0),
      totalBorrow: Number(r.totalBorrow || 0),
      availableLiquidity: Number(r.totalSupply || 0) - Number(r.totalBorrow || 0),
      maxLtv: Number(r.maxLtv || 0),
    }));
  } catch (error) {
    console.error("Failed to fetch Kamino reserves:", error);
    return [];
  }
}

/**
 * Fetch data for all RWA markets
 */
export async function getKaminoRWAMarkets(): Promise<KaminoMarketData[]> {
  const rwaMarkets = KAMINO_MARKETS.filter((m) => m.category === "rwa");
  const results = await Promise.allSettled(
    rwaMarkets.map(async (market) => {
      const reserves = await getKaminoReserves(market.address);
      const tvl = reserves.reduce((sum, r) => sum + r.totalSupplyUsd, 0);
      const stableReserves = reserves.filter((r) =>
        ["USDC", "USDS", "PYUSD", "CASH"].includes(r.symbol.toUpperCase()),
      );
      const topSupplyApy = Math.max(
        ...stableReserves.map((r) => r.supplyApy * 100),
        0,
      );
      return { market, reserves, tvl, topSupplyApy };
    }),
  );

  return results
    .filter((r): r is PromiseFulfilledResult<KaminoMarketData> => r.status === "fulfilled")
    .map((r) => r.value);
}

/**
 * Get aggregated data for the external vaults display
 */
export async function getKaminoVaultData() {
  const markets = await getKaminoRWAMarkets();
  const totalTvl = markets.reduce((sum, m) => sum + m.tvl, 0);
  const bestApy = Math.max(...markets.map((m) => m.topSupplyApy), 0);

  return {
    name: "Kamino RWA Lending",
    apy: bestApy,
    tvl: totalTvl,
    markets,
    url: "https://kamino.com/assets/prime",
  };
}

/**
 * Build a deposit transaction via Kamino's transaction API.
 * Returns a base64-encoded unsigned transaction for the user to sign.
 */
export async function buildKaminoDepositTx(params: {
  userWallet: string;
  mintAddress: string;
  amount: string;
  market: string;
  reserve?: string;
}): Promise<{ transaction: string } | null> {
  try {
    const res = await fetch(`${KAMINO_API}/ktx/klend/deposit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        wallet: params.userWallet,
        reserve: params.reserve || params.mintAddress,
        amount: params.amount,
        market: params.market,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Kamino deposit tx API ${res.status}: ${text}`);
    }

    return await res.json();
  } catch (error) {
    console.error("Failed to build Kamino deposit tx:", error);
    return null;
  }
}

/**
 * Build a withdraw transaction via Kamino's transaction API.
 */
export async function buildKaminoWithdrawTx(params: {
  userWallet: string;
  mintAddress: string;
  amount: string;
  market: string;
  reserve?: string;
}): Promise<{ transaction: string } | null> {
  try {
    const res = await fetch(`${KAMINO_API}/ktx/klend/withdraw`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        wallet: params.userWallet,
        reserve: params.reserve || params.mintAddress,
        amount: params.amount,
        market: params.market,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Kamino withdraw tx API ${res.status}: ${text}`);
    }

    return await res.json();
  } catch (error) {
    console.error("Failed to build Kamino withdraw tx:", error);
    return null;
  }
}

/**
 * Fetch user obligations (positions) in a specific market
 */
export async function getKaminoUserObligations(
  userWallet: string,
  marketAddress?: string,
): Promise<unknown[]> {
  const market = marketAddress || KAMINO_MARKETS[0].address;
  try {
    const res = await fetch(
      `${KAMINO_API}/kamino-market/${market}/users/${userWallet}/obligations`,
      { next: { revalidate: 60 } },
    );
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}
