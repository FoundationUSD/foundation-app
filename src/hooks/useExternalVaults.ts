"use client";

import { useState, useEffect, useCallback } from "react";

export interface ExternalVaultItem {
  id: string;
  protocol: "kamino" | "drift" | "solomon";
  name: string;
  description: string;
  apy: number;
  tvl: number;
  externalUrl: string;
  depositEnabled: boolean;
  [key: string]: unknown;
}

export function useExternalVaults() {
  const [vaults, setVaults] = useState<ExternalVaultItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchVaults = useCallback(async () => {
    try {
      const res = await fetch("/api/external-vaults");
      const json = await res.json();
      if (json.success) {
        setVaults(json.data);
      }
    } catch {
      setError("Failed to load external vaults");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchVaults();
  }, [fetchVaults]);

  return { vaults, loading, error, refetch: fetchVaults };
}
