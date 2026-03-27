"use client";

import { useState, useEffect } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  getAccount,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import type { UserPosition } from "@/types";

export function useUserPosition(vaultId: string, mintAddress: string) {
  const { connection } = useConnection();
  const wallet = useWallet();
  const [position, setPosition] = useState<UserPosition | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!wallet.publicKey || !mintAddress) {
      setPosition(null);
      setLoading(false);
      return;
    }

    let cancelled = false;

    const fetchPosition = async () => {
      try {
        const mintPubkey = new PublicKey(mintAddress);
        const userAta = getAssociatedTokenAddressSync(
          mintPubkey,
          wallet.publicKey!,
          false,
          TOKEN_2022_PROGRAM_ID,
        );

        const account = await getAccount(connection, userAta, "confirmed", TOKEN_2022_PROGRAM_ID);
        const rawAmount = Number(account.amount) / 1_000_000;

        if (!cancelled) {
          setPosition({
            vaultId,
            vaultName: vaultId,
            shares: rawAmount,
            value: rawAmount, // Token-2022 interest accrues automatically
            costBasis: 0,
            pnl: 0,
            pnlPercent: 0,
          });
        }
      } catch {
        if (!cancelled) {
          setPosition({
            vaultId,
            vaultName: vaultId,
            shares: 0,
            value: 0,
            costBasis: 0,
            pnl: 0,
            pnlPercent: 0,
          });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchPosition();
    const interval = setInterval(fetchPosition, 15000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [wallet.publicKey, mintAddress, vaultId, connection]);

  return { position, loading };
}
