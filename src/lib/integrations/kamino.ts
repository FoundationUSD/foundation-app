/**
 * Kamino Finance integration — live SDK reads for reserve data.
 *
 * Program: KLend2g3cP87fffoy8q1mQqGKjrxjC8boSyAYavgmjD
 * SDK: @kamino-finance/klend-sdk
 *
 * Note: The Kamino SDK uses @solana/kit types internally. The read layer works
 * with legacy Connection (cast as any). The deposit/withdraw tx builders return
 * @solana/kit Instruction types, which aren't compatible with legacy Transaction.
 * For MVP, we expose reads only. Direct deposits will be added when we migrate
 * fully to @solana/kit.
 */

import { Connection } from "@solana/web3.js";
import { KaminoMarket } from "@kamino-finance/klend-sdk";
import { SOLANA_RPC_URL } from "@/lib/constants";

// Kamino main market on mainnet
const KAMINO_MAIN_MARKET = "7u3HeHxYDLhnCoErrtycNokbQYbWGzLs6JSDqGAv5PfF";

export interface KaminoReserveData {
  symbol: string;
  mintAddress: string;
  supplyApy: number;
  borrowApy: number;
  totalSupply: number;
  availableLiquidity: number;
}

export interface KaminoVaultData {
  name: string;
  apy: number;
  tvl: number;
  reserves: KaminoReserveData[];
  url: string;
}

let _market: KaminoMarket | null = null;

async function getMarket(): Promise<KaminoMarket> {
  if (_market) return _market;
  const connection = new Connection(SOLANA_RPC_URL);
  _market = await KaminoMarket.load(
    connection as any,
    KAMINO_MAIN_MARKET as any,
    0,
  );
  if (!_market) throw new Error("Failed to load Kamino market");
  return _market;
}

/**
 * Fetch live reserve data from Kamino — APYs, TVL, liquidity
 */
export async function getKaminoReserves(): Promise<KaminoReserveData[]> {
  try {
    const market = await getMarket();
    const connection = new Connection(SOLANA_RPC_URL);
    const currentSlot = BigInt(await connection.getSlot());
    const reserves: KaminoReserveData[] = [];

    for (const reserve of market.reserves.values()) {
      try {
        const supplyApy = Number(reserve.totalSupplyAPY(currentSlot)) || 0;
        const borrowApy = Number(reserve.totalBorrowAPY(currentSlot)) || 0;
        const totalSupply = Number(reserve.getTotalSupply() || 0);
        const available = Number(reserve.getLiquidityAvailableAmount() || 0);

        reserves.push({
          symbol: reserve.getTokenSymbol() || "Unknown",
          mintAddress: String(reserve.getLiquidityMint()),
          supplyApy,
          borrowApy,
          totalSupply,
          availableLiquidity: available,
        });
      } catch {
        // Skip reserves that fail
      }
    }

    return reserves;
  } catch (error) {
    console.error("Failed to fetch Kamino reserves:", error);
    return [];
  }
}

/**
 * Get aggregated vault data for display
 */
export async function getKaminoVaultData(): Promise<KaminoVaultData> {
  const reserves = await getKaminoReserves();
  const usdcReserve = reserves.find(
    (r) => r.symbol.toUpperCase() === "USDC",
  );

  return {
    name: "Kamino Lending",
    apy: usdcReserve ? usdcReserve.supplyApy * 100 : 0,
    tvl: reserves.reduce((sum, r) => sum + r.totalSupply, 0),
    reserves,
    url: "https://app.kamino.finance",
  };
}
