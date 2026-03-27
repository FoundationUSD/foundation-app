"use client";

import { useState, useEffect, useCallback } from "react";
import type { NavPoint } from "@/types";

export function useNavHistory(vaultId: string, days = 30) {
  const [history, setHistory] = useState<NavPoint[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchHistory = useCallback(async () => {
    try {
      const res = await fetch(`/api/vaults/${vaultId}/history?days=${days}`);
      const json = await res.json();
      if (json.success) {
        setHistory(json.data);
      }
    } catch {
      // Silently fail — chart just shows empty
    } finally {
      setLoading(false);
    }
  }, [vaultId, days]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  return { history, loading, refetch: fetchHistory };
}
