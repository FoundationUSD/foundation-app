"use client";

import { useState, useEffect, useCallback } from "react";
import { useWallet } from "@solana/wallet-adapter-react";

export interface TxRecord {
  id: number;
  type: "deposit" | "withdrawal";
  vaultId: string;
  amount: number;
  tx: string;
  createdAt: string;
}

export function useTxHistory() {
  const wallet = useWallet();
  const [txs, setTxs] = useState<TxRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchHistory = useCallback(async () => {
    if (!wallet.publicKey) {
      setTxs([]);
      setLoading(false);
      return;
    }

    try {
      const res = await fetch(
        `/api/user/history?wallet=${wallet.publicKey.toBase58()}`,
      );
      const json = await res.json();
      if (json.success) {
        setTxs(json.data);
      }
    } catch {
      // No history available
    } finally {
      setLoading(false);
    }
  }, [wallet.publicKey]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  return { txs, loading, refetch: fetchHistory };
}
