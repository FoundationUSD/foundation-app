"use client";

import { useState, useEffect, useCallback } from "react";
import type { NativeVault } from "@/types";

export function useVaults() {
  const [vaults, setVaults] = useState<NativeVault[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchVaults = useCallback(async () => {
    try {
      const res = await fetch("/api/vaults");
      const json = await res.json();
      if (json.success) {
        setVaults(json.data);
      } else {
        setError(json.error || "Failed to fetch vaults");
      }
    } catch {
      setError("Failed to fetch vaults");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchVaults();
  }, [fetchVaults]);

  return { vaults, loading, error, refetch: fetchVaults };
}

export function useVault(id: string) {
  const [vault, setVault] = useState<NativeVault | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchVault = useCallback(async () => {
    try {
      const res = await fetch(`/api/vaults/${id}`);
      const json = await res.json();
      if (json.success) {
        setVault(json.data);
      } else {
        setError(json.error || "Vault not found");
      }
    } catch {
      setError("Failed to fetch vault");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchVault();
  }, [fetchVault]);

  return { vault, loading, error, refetch: fetchVault };
}
