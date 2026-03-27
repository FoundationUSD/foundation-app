"use client";

import { useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey, Transaction } from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  createBurnInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";

interface WithdrawResult {
  burnTx: string;
  transferTx: string;
  usdcReturned: number;
}

export function useWithdraw(vaultId: string) {
  const { connection } = useConnection();
  const wallet = useWallet();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<WithdrawResult | null>(null);

  const withdraw = async (shareAmount: number, mintAddress: string) => {
    if (!wallet.publicKey || !wallet.signTransaction) {
      setError("Wallet not connected");
      return null;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const mintPubkey = new PublicKey(mintAddress);
      const shareLamports = Math.floor(shareAmount * 1_000_000);

      const userShareAta = getAssociatedTokenAddressSync(
        mintPubkey,
        wallet.publicKey,
        false,
        TOKEN_2022_PROGRAM_ID,
      );

      // Build burn tx
      const burnIx = createBurnInstruction(
        userShareAta,
        mintPubkey,
        wallet.publicKey,
        shareLamports,
        [],
        TOKEN_2022_PROGRAM_ID,
      );

      const tx = new Transaction().add(burnIx);
      const { blockhash } = await connection.getLatestBlockhash();
      tx.recentBlockhash = blockhash;
      tx.feePayer = wallet.publicKey;

      // User signs burn
      const signed = await wallet.signTransaction(tx);
      const sig = await connection.sendRawTransaction(signed.serialize());
      await connection.confirmTransaction(sig, "confirmed");

      // Tell backend to send USDC
      const res = await fetch("/api/withdraw", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vaultId,
          burnTxSignature: sig,
          userWallet: wallet.publicKey.toBase58(),
          sharesBurned: shareLamports,
        }),
      }).then((r) => r.json());

      if (!res.success) {
        throw new Error(res.error || "Withdrawal failed");
      }

      const withdrawResult: WithdrawResult = {
        burnTx: sig,
        transferTx: res.data.transferTx,
        usdcReturned: res.data.usdcReturned,
      };

      setResult(withdrawResult);
      return withdrawResult;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Withdrawal failed";
      setError(message);
      return null;
    } finally {
      setLoading(false);
    }
  };

  return { withdraw, loading, error, result };
}
