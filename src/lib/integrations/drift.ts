/**
 * Drift Protocol integration — real vault reads via Data API + SDK deposits.
 *
 * Program: dRiftyHA39MWEi3m9aunc5MzRF1JYuBsbn6VPcn33UH
 * Vault Program: vAuLTsyrvSfZRuRB3XgvkPwNGgYSs9YRYymVebLKoxR
 * Data API: https://data.api.drift.trade
 */

import { Connection, PublicKey } from "@solana/web3.js";
import { SOLANA_RPC_URL } from "@/lib/constants";

const DRIFT_DATA_API = "https://data.api.drift.trade";

export interface DriftVaultInfo {
  name: string;
  address: string;
  manager: string;
  apy: number;
  tvl: number;
  sharePrice: number;
  maxDeposits: number;
  currentDeposits: number;
  protocol: string;
}

/**
 * Fetch all Drift vaults from the Data API
 */
export async function getDriftVaults(): Promise<DriftVaultInfo[]> {
  try {
    const res = await fetch(`${DRIFT_DATA_API}/vaults`, {
      next: { revalidate: 300 }, // Cache 5 min
    });

    if (!res.ok) throw new Error(`Drift API ${res.status}`);
    const data = await res.json();

    if (!Array.isArray(data)) return [];

    return data.map((v: any) => ({
      name: v.name || "Drift Vault",
      address: v.pubkey || v.address || "",
      manager: v.manager || "",
      apy: Number(v.apy || v.allTimePnlPct || 0),
      tvl: Number(v.tvl || v.netDeposits || 0),
      sharePrice: Number(v.sharePrice || 1),
      maxDeposits: Number(v.maxTokens || 0),
      currentDeposits: Number(v.netDeposits || 0),
      protocol: "drift",
    }));
  } catch (error) {
    console.error("Failed to fetch Drift vaults:", error);
    return [];
  }
}

/**
 * Fetch a specific vault's details
 */
export async function getDriftVault(vaultAddress: string): Promise<DriftVaultInfo | null> {
  try {
    const res = await fetch(`${DRIFT_DATA_API}/vaults/${vaultAddress}`);
    if (!res.ok) return null;
    const v = await res.json();

    return {
      name: v.name || "Drift Vault",
      address: v.pubkey || vaultAddress,
      manager: v.manager || "",
      apy: Number(v.apy || 0),
      tvl: Number(v.tvl || 0),
      sharePrice: Number(v.sharePrice || 1),
      maxDeposits: Number(v.maxTokens || 0),
      currentDeposits: Number(v.netDeposits || 0),
      protocol: "drift",
    };
  } catch {
    return null;
  }
}

/**
 * Fetch vault performance history from Drift Data API
 */
export async function getDriftVaultHistory(
  vaultAddress: string,
): Promise<Array<{ timestamp: string; pnl: number; tvl: number }>> {
  try {
    const res = await fetch(
      `${DRIFT_DATA_API}/vaults/${vaultAddress}/history?resolution=daily&limit=30`,
    );
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}
