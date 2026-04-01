"use client";

import { useState, useEffect } from "react";
import type { FoundationVault } from "@/lib/vaults";

export function useStrategies() {
  const [strategies, setStrategies] = useState<FoundationVault[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/strategies");
        const json = await res.json();
        if (json.success) {
          setStrategies(json.data);
        }
      } catch {
        // silently fail
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  return { strategies, loading };
}
