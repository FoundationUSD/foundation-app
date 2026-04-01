"use client";

import { useState, useEffect } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { Transaction, VersionedTransaction } from "@solana/web3.js";
import type { DriftVaultInfo } from "@/lib/integrations/drift";

export function useDriftVaults(limit = 20) {
  const [vaults, setVaults] = useState<DriftVaultInfo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/drift/vaults");
        const json = await res.json();
        if (json.success) {
          setVaults(json.data.slice(0, limit));
        }
      } catch {
        // silently fail
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [limit]);

  return { vaults, loading };
}

export function useDriftDeposit() {
  const { connection } = useConnection();
  const wallet = useWallet();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [txSignature, setTxSignature] = useState<string | null>(null);

  const deposit = async (vaultAddress: string, amount: string) => {
    if (!wallet.publicKey || !wallet.signTransaction) {
      setError("Wallet not connected");
      return null;
    }

    setLoading(true);
    setError(null);
    setTxSignature(null);

    try {
      // Ask server to build the deposit transaction
      const res = await fetch("/api/drift/deposit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vaultAddress,
          userWallet: wallet.publicKey.toBase58(),
          amount,
        }),
      });

      const json = await res.json();
      if (!json.success) {
        throw new Error(json.error || "Failed to build deposit transaction");
      }

      // Deserialize and sign
      const txBytes = Buffer.from(json.data.transaction, "base64");
      let signed: Transaction | VersionedTransaction;

      try {
        const vtx = VersionedTransaction.deserialize(txBytes);
        signed = await wallet.signTransaction(vtx);
      } catch {
        const tx = Transaction.from(txBytes);
        signed = await wallet.signTransaction(tx);
      }

      // Send
      const sig = await connection.sendRawTransaction(signed.serialize());
      await connection.confirmTransaction(sig, "confirmed");

      setTxSignature(sig);
      return sig;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Deposit failed";
      setError(message);
      return null;
    } finally {
      setLoading(false);
    }
  };

  return { deposit, loading, error, txSignature };
}
