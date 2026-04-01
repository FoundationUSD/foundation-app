/**
 * Drift Protocol integration — vault reads.
 *
 * Program: dRiftyHA39MWEi3m9aunc5MzRF1JYuBsbn6VPcn33UH
 * Vault Program: vAuLTsyrvSfZRuRB3XgvkPwNGgYSs9YRYymVebLKoxR
 *
 * The app.drift.trade/api/vaults endpoint blocks cross-origin and
 * server-side requests. We proxy through our own API route.
 */

export interface DriftVaultInfo {
  name: string;
  address: string;
  manager: string;
  apy7d: number;
  apy30d: number;
  apy90d: number;
  maxDrawdownPct: number;
  protocol: string;
}

interface DriftApiVaultEntry {
  apys?: Record<string, number>;
  maxDrawdownPct?: number;
  numOfVaultSnapshots?: number;
}

/**
 * Fetch Drift vaults — server-side only (called from API route).
 */
export async function getDriftVaultsServer(): Promise<DriftVaultInfo[]> {
  try {
    const res = await fetch("https://app.drift.trade/api/vaults", {
      next: { revalidate: 300 },
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; FoundationApp/1.0)",
        Accept: "application/json",
      },
    });

    if (!res.ok) throw new Error(`Drift API ${res.status}`);
    return parseDriftResponse(await res.json());
  } catch (error) {
    console.error("Failed to fetch Drift vaults:", error);
    return [];
  }
}

function parseDriftResponse(data: Record<string, DriftApiVaultEntry>): DriftVaultInfo[] {
  if (!data || typeof data !== "object" || Array.isArray(data)) return [];

  return Object.entries(data)
    .filter(([, v]) => v.apys && Object.keys(v.apys).length > 0)
    .map(([pubkey, v]) => ({
      name: pubkey.slice(0, 8) + "...",
      address: pubkey,
      manager: "",
      apy7d: v.apys?.["7d"] ?? 0,
      apy30d: v.apys?.["30d"] ?? 0,
      apy90d: v.apys?.["90d"] ?? 0,
      maxDrawdownPct: v.maxDrawdownPct ?? 0,
      protocol: "drift",
    }))
    // Filter out unreasonable APYs (> 100% — likely data artifacts)
    .filter((v) => v.apy30d > 0 && v.apy30d < 100)
    .sort((a, b) => b.apy30d - a.apy30d);
}

/**
 * Get top Drift vaults
 */
export async function getTopDriftVaults(limit = 5): Promise<DriftVaultInfo[]> {
  const vaults = await getDriftVaultsServer();
  return vaults.slice(0, limit);
}
