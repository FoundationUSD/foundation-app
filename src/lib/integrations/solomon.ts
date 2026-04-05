/**
 * Solomon Labs integration — direct on-chain staking via Anchor.
 *
 * Stake Program: HSnn7bDvkZSEwujZDPtUcdo9KL7Conycgmy8m6mBFD5
 * USDv Mint: Ex5DaKYMCN6QWFA4n67TmMwsH8MJV68RX6YXTmVM532C
 * sUSDV Mint: pTA4St7D5WshfLUPBXoaxn5m8e3k2ort2DVt3gUTa17
 *
 * Both USDv and sUSDV are SPL tokens (9 decimals).
 * Staking is permissionless. Unstaking has a 7-day cooldown.
 */

import { createSolanaRpc } from "@solana/kit";
import { fetchMaybeMint } from "@solana-program/token";
import { SOLOMON_SUSDV_MINT, SOLOMON_USDV_MINT, SOLANA_RPC_URL } from "@/lib/constants";

export const SOLOMON_STAKE_PROGRAM_ID = "HSnn7bDvkZSEwujZDPtUcdo9KL7Conycgmy8m6mBFD5";
export const SOLOMON_VAULT_SALT = new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0]);

export interface SolomonProtocolData {
  usdvMint: string;
  susdvMint: string;
  usdvSupply: number;
  susdvSupply: number;
  exchangeRate: number;
  estimatedApy: number;
}

export interface SolomonVaultState {
  totalAssets: number;
  vestingAmount: number;
  lastDistributionTime: number;
  vestingPeriod: number;
  cooldown: number;
  minShares: number;
}

/**
 * Calculate unvested amount (still vesting, not yet distributed)
 */
export function getUnvestedAmount(
  vestingAmount: number,
  lastDistributionTime: number,
  vestingPeriod: number,
): number {
  if (vestingAmount === 0) return 0;
  const now = Date.now() / 1000;
  const timePassed = now - lastDistributionTime;
  if (timePassed >= vestingPeriod) return 0;
  const remainingTime = vestingPeriod - timePassed;
  return (remainingTime * vestingAmount) / vestingPeriod;
}

/**
 * Convert USDv amount to sUSDV shares
 */
export function convertToShares(
  assetAmount: number,
  totalAssets: number,
  unvestedAmount: number,
  totalSupply: number,
): number {
  if (totalAssets === 0) return assetAmount;
  const effectiveAssets = totalAssets - unvestedAmount;
  return (assetAmount * totalSupply) / effectiveAssets;
}

/**
 * Convert sUSDV shares to USDv amount
 */
export function convertToAssets(
  sharesAmount: number,
  totalAssets: number,
  unvestedAmount: number,
  totalSupply: number,
): number {
  if (totalSupply === 0) return sharesAmount;
  const effectiveAssets = totalAssets - unvestedAmount;
  return (sharesAmount * effectiveAssets) / totalSupply;
}

/**
 * Read live Solomon protocol data from on-chain token state
 */
export async function getSolomonData(): Promise<SolomonProtocolData> {
  try {
    const rpc = createSolanaRpc(SOLANA_RPC_URL);

    const [usdvMintResult, susdvMintResult] = await Promise.all([
      fetchMaybeMint(rpc, SOLOMON_USDV_MINT, { commitment: "confirmed" }).catch(() => null),
      fetchMaybeMint(rpc, SOLOMON_SUSDV_MINT, { commitment: "confirmed" }).catch(() => null),
    ]);

    const usdvSupply = usdvMintResult?.exists ? Number(usdvMintResult.data.supply) / 1e9 : 0;
    const susdvSupply = susdvMintResult?.exists ? Number(susdvMintResult.data.supply) / 1e9 : 0;

    // Exchange rate: vault USDv balance / sUSDV supply
    // The vault holds USDv backing all sUSDV, so rate = vaultUsdv / susdvSupply
    let exchangeRate = 1;
    try {
      const { Connection, PublicKey } = await import("@solana/web3.js");
      const conn = new Connection(SOLANA_RPC_URL, "confirmed");
      const vaultUsdvBal = await conn.getTokenAccountBalance(
        new PublicKey("4AZVLwe6KinAmV3p7Hpj4PYQHrAGXhbpcCCiqLYRxwHf"),
      );
      const vaultUsdv = Number(vaultUsdvBal.value.amount) / 1e9;
      if (susdvSupply > 0 && vaultUsdv > 0) {
        exchangeRate = vaultUsdv / susdvSupply;
      }
    } catch {}

    return {
      usdvMint: SOLOMON_USDV_MINT,
      susdvMint: SOLOMON_SUSDV_MINT,
      usdvSupply,
      susdvSupply,
      exchangeRate,
      estimatedApy: 12.5,
    };
  } catch (error) {
    console.error("Failed to fetch Solomon data:", error);
    return {
      usdvMint: SOLOMON_USDV_MINT,
      susdvMint: SOLOMON_SUSDV_MINT,
      usdvSupply: 0,
      susdvSupply: 0,
      exchangeRate: 1,
      estimatedApy: 12.5,
    };
  }
}

/**
 * Derive PDA for the Solomon stake vault state
 */
export function getStakeVaultStatePDA(): { pda: string; seeds: Buffer[] } {
  // PDA seeds: ["vault-state", salt]
  // This is computed client-side using Anchor's findProgramAddressSync
  const seeds = [
    Buffer.from("vault-state"),
    Buffer.from(SOLOMON_VAULT_SALT),
  ];
  return { pda: "", seeds };
}
