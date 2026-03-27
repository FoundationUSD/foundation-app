/**
 * Solomon Labs integration — reads sUSDV exchange rate and yield data.
 *
 * USDV: Ex5DaKYMCN6QWFA4n67TmMwsH8MJV68RX6YXTmVM532C
 * sUSDV: pTA4St7D5WshfLUPBXoaxn5m8e3k2ort2DVt3gUTa17
 *
 * sUSDV accrues yield via exchange rate appreciation (like Lido stETH).
 * Users stake USDV -> sUSDV, 7-day cooldown on unstake.
 * Yield source: basis trading (simultaneous spot-long / perp-short).
 */

import { Connection, PublicKey } from "@solana/web3.js";
import { SOLOMON_SUSDV_MINT, SOLOMON_USDV_MINT, SOLANA_RPC_URL } from "@/lib/constants";

export interface SolomonVaultData {
  usdvMint: string;
  susdvMint: string;
  exchangeRate: number; // sUSDV -> USDV rate (e.g., 1.05 = 5% yield)
  estimatedApy: number;
  totalStaked: number;
}

export async function getSolomonData(): Promise<SolomonVaultData> {
  try {
    const connection = new Connection(SOLANA_RPC_URL);

    // Read sUSDV supply and USDV backing to derive exchange rate
    const [susdvSupply, usdvInfo] = await Promise.all([
      connection.getTokenSupply(SOLOMON_SUSDV_MINT),
      connection.getTokenSupply(SOLOMON_USDV_MINT),
    ]);

    const susdvTotal = Number(susdvSupply.value.uiAmount || 0);
    const usdvTotal = Number(usdvInfo.value.uiAmount || 0);

    // Exchange rate approximation
    const exchangeRate = susdvTotal > 0 ? usdvTotal / susdvTotal : 1;

    return {
      usdvMint: SOLOMON_USDV_MINT.toBase58(),
      susdvMint: SOLOMON_SUSDV_MINT.toBase58(),
      exchangeRate,
      estimatedApy: 12.5, // From Solomon docs — basis trading yield
      totalStaked: susdvTotal,
    };
  } catch (error) {
    console.error("Failed to fetch Solomon data:", error);
    return {
      usdvMint: SOLOMON_USDV_MINT.toBase58(),
      susdvMint: SOLOMON_SUSDV_MINT.toBase58(),
      exchangeRate: 1,
      estimatedApy: 12.5,
      totalStaked: 0,
    };
  }
}
