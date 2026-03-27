/**
 * Drift Protocol integration — reads RWA vault data.
 *
 * Uses @drift-labs/vaults-sdk for vault state.
 * Vault program: vAuLTsyrvSfZRuRB3XgvkPwNGgYSs9YRYymVebLKoxR
 *
 * Target vaults:
 * - Gauntlet Levered RWA Vault (~16% APY)
 * - ACRED-USDC/USDT pools
 */

import { Connection } from "@solana/web3.js";
import { SOLANA_RPC_URL } from "@/lib/constants";

export interface DriftVaultData {
  name: string;
  apy: number;
  tvl: number;
  vaultAddress: string;
  url: string;
}

export async function getDriftRwaVaults(): Promise<DriftVaultData[]> {
  try {
    // For MVP: return curated list with known data.
    // TODO: Integrate @drift-labs/vaults-sdk for live reads.
    // The SDK has heavy Anchor + BN.js dependencies.
    // Fallback: Drift's data API at https://data.api.drift.trade

    return [
      {
        name: "Drift Gauntlet RWA",
        apy: 16.0,
        tvl: 0,
        vaultAddress: "",
        url: "https://app.drift.trade/vaults",
      },
    ];
  } catch (error) {
    console.error("Failed to fetch Drift vaults:", error);
    return [];
  }
}
