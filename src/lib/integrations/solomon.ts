/**
 * Solomon Labs integration — USDV/sUSDV on-chain reads.
 *
 * USDV: Ex5DaKYMCN6QWFA4n67TmMwsH8MJV68RX6YXTmVM532C
 * sUSDV: pTA4St7D5WshfLUPBXoaxn5m8e3k2ort2DVt3gUTa17
 *
 * No SDK available — we read token state directly on-chain.
 * sUSDV accrues yield via exchange rate (like Lido wstETH).
 * 7-day cooldown on unstake.
 * Yield source: basis trading (spot-long / perp-short on BTC/ETH/SOL).
 *
 * For staking/unstaking, we need the Solomon staking program IDL
 * which we'll request from the Solomon team.
 */

import { Connection, PublicKey } from "@solana/web3.js";
import { getMint, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { SOLOMON_SUSDV_MINT, SOLOMON_USDV_MINT, SOLANA_RPC_URL } from "@/lib/constants";

export interface SolomonProtocolData {
  usdvMint: string;
  susdvMint: string;
  usdvSupply: number;
  susdvSupply: number;
  exchangeRate: number;
  estimatedApy: number;
}

/**
 * Read live Solomon protocol data from on-chain token state
 */
export async function getSolomonData(): Promise<SolomonProtocolData> {
  try {
    const connection = new Connection(SOLANA_RPC_URL);

    const [usdvMintInfo, susdvMintInfo] = await Promise.all([
      getMint(connection, SOLOMON_USDV_MINT, "confirmed", TOKEN_PROGRAM_ID).catch(() => null),
      getMint(connection, SOLOMON_SUSDV_MINT, "confirmed", TOKEN_PROGRAM_ID).catch(() => null),
    ]);

    const usdvSupply = usdvMintInfo ? Number(usdvMintInfo.supply) / 1e6 : 0;
    const susdvSupply = susdvMintInfo ? Number(susdvMintInfo.supply) / 1e6 : 0;

    // Exchange rate: total USDV backing / sUSDV supply
    // Since sUSDV captures yield, exchange rate grows over time
    const exchangeRate = susdvSupply > 0 && usdvSupply > 0 ? usdvSupply / susdvSupply : 1;

    return {
      usdvMint: SOLOMON_USDV_MINT.toBase58(),
      susdvMint: SOLOMON_SUSDV_MINT.toBase58(),
      usdvSupply,
      susdvSupply,
      exchangeRate,
      estimatedApy: 12.5, // From Solomon docs — basis trading strategy
    };
  } catch (error) {
    console.error("Failed to fetch Solomon data:", error);
    return {
      usdvMint: SOLOMON_USDV_MINT.toBase58(),
      susdvMint: SOLOMON_SUSDV_MINT.toBase58(),
      usdvSupply: 0,
      susdvSupply: 0,
      exchangeRate: 1,
      estimatedApy: 12.5,
    };
  }
}

/**
 * Fetch Solomon protocol stats from their public stats page
 */
export async function getSolomonStats(): Promise<{
  tvl: number;
  apy: number;
  holders: number;
}> {
  try {
    // Try fetching from Solomon's stats API
    const res = await fetch("https://app.solomonlabs.org/api/stats", {
      next: { revalidate: 600 }, // Cache 10 min
    });

    if (res.ok) {
      const data = await res.json();
      return {
        tvl: Number(data.tvl || 0),
        apy: Number(data.apy || 12.5),
        holders: Number(data.holders || 0),
      };
    }
  } catch {
    // Fallback to on-chain data
  }

  const onChainData = await getSolomonData();
  return {
    tvl: onChainData.usdvSupply,
    apy: onChainData.estimatedApy,
    holders: 0,
  };
}
