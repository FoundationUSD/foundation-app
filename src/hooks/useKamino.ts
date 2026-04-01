"use client";

import { useState, useEffect, useCallback } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { Transaction, VersionedTransaction } from "@solana/web3.js";
import type { KaminoReserveData, KaminoMarketData } from "@/lib/integrations/kamino";

export function useKaminoMarkets() {
  const [markets, setMarkets] = useState<KaminoMarketData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const { getKaminoRWAMarkets } = await import("@/lib/integrations/kamino");
        setMarkets(await getKaminoRWAMarkets());
      } catch {
        // silently fail
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  return { markets, loading };
}

export function useKaminoReserves(marketAddress: string) {
  const [reserves, setReserves] = useState<KaminoReserveData[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch_ = useCallback(async () => {
    try {
      const { getKaminoReserves } = await import("@/lib/integrations/kamino");
      setReserves(await getKaminoReserves(marketAddress));
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, [marketAddress]);

  useEffect(() => {
    fetch_();
  }, [fetch_]);

  return { reserves, loading, refetch: fetch_ };
}

export function useKaminoDeposit() {
  const { connection } = useConnection();
  const wallet = useWallet();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [txSignature, setTxSignature] = useState<string | null>(null);

  const deposit = async (mintAddress: string, amount: string, market: string) => {
    if (!wallet.publicKey || !wallet.signTransaction) {
      setError("Wallet not connected");
      return null;
    }

    setLoading(true);
    setError(null);
    setTxSignature(null);

    try {
      const { buildKaminoDepositTx } = await import("@/lib/integrations/kamino");
      const result = await buildKaminoDepositTx({
        userWallet: wallet.publicKey.toBase58(),
        mintAddress,
        amount,
        market,
      });

      if (!result?.transaction) {
        throw new Error("Failed to build deposit transaction");
      }

      const txBytes = Buffer.from(result.transaction, "base64");
      let signed: Transaction | VersionedTransaction;

      try {
        const vtx = VersionedTransaction.deserialize(txBytes);
        signed = await wallet.signTransaction(vtx);
      } catch {
        const tx = Transaction.from(txBytes);
        tx.feePayer = wallet.publicKey;
        signed = await wallet.signTransaction(tx);
      }

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

export function useKaminoWithdraw() {
  const { connection } = useConnection();
  const wallet = useWallet();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [txSignature, setTxSignature] = useState<string | null>(null);

  const withdraw = async (mintAddress: string, amount: string, market: string) => {
    if (!wallet.publicKey || !wallet.signTransaction) {
      setError("Wallet not connected");
      return null;
    }

    setLoading(true);
    setError(null);
    setTxSignature(null);

    try {
      const { buildKaminoWithdrawTx } = await import("@/lib/integrations/kamino");
      const result = await buildKaminoWithdrawTx({
        userWallet: wallet.publicKey.toBase58(),
        mintAddress,
        amount,
        market,
      });

      if (!result?.transaction) {
        throw new Error("Failed to build withdraw transaction");
      }

      const txBytes = Buffer.from(result.transaction, "base64");
      let signed: Transaction | VersionedTransaction;

      try {
        const vtx = VersionedTransaction.deserialize(txBytes);
        signed = await wallet.signTransaction(vtx);
      } catch {
        const tx = Transaction.from(txBytes);
        tx.feePayer = wallet.publicKey;
        signed = await wallet.signTransaction(tx);
      }

      const sig = await connection.sendRawTransaction(signed.serialize());
      await connection.confirmTransaction(sig, "confirmed");

      setTxSignature(sig);
      return sig;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Withdraw failed";
      setError(message);
      return null;
    } finally {
      setLoading(false);
    }
  };

  return { withdraw, loading, error, txSignature };
}
