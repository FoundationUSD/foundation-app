"use client";

import { useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey, Transaction } from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  createTransferInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { USDC_MINT } from "@/lib/constants";

const USDC_MINT_PUBKEY = new PublicKey(USDC_MINT);

interface DepositResult {
  depositTx: string;
  mintTx: string;
  sharesMinted: number;
}

export function useDeposit(vaultId: string) {
  const { connection } = useConnection();
  const wallet = useWallet();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DepositResult | null>(null);

  const deposit = async (usdcAmount: number) => {
    if (!wallet.publicKey || !wallet.signTransaction) {
      setError("Wallet not connected");
      return null;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const amountLamports = Math.floor(usdcAmount * 1_000_000);

      // Fetch vault config for the vault wallet address
      const vaultRes = await fetch(`/api/vaults/${vaultId}`).then((r) => r.json());
      const vaultWallet = new PublicKey(vaultRes.data.vaultAuthority);

      const userUsdcAta = getAssociatedTokenAddressSync(USDC_MINT_PUBKEY, wallet.publicKey);
      const vaultUsdcAta = getAssociatedTokenAddressSync(USDC_MINT_PUBKEY, vaultWallet);

      // Build USDC transfer: user -> vault
      const transferIx = createTransferInstruction(
        userUsdcAta,
        vaultUsdcAta,
        wallet.publicKey,
        amountLamports,
        [],
        TOKEN_PROGRAM_ID,
      );

      const tx = new Transaction().add(transferIx);
      const { blockhash } = await connection.getLatestBlockhash();
      tx.recentBlockhash = blockhash;
      tx.feePayer = wallet.publicKey;

      // User signs
      const signed = await wallet.signTransaction(tx);
      const sig = await connection.sendRawTransaction(signed.serialize());
      await connection.confirmTransaction(sig, "confirmed");

      // Tell backend to mint fdnTokens
      const mintRes = await fetch("/api/deposit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vaultId,
          txSignature: sig,
          userWallet: wallet.publicKey.toBase58(),
          amount: amountLamports,
        }),
      }).then((r) => r.json());

      if (!mintRes.success) {
        throw new Error(mintRes.error || "Mint failed");
      }

      const depositResult: DepositResult = {
        depositTx: sig,
        mintTx: mintRes.data.mintTx,
        sharesMinted: mintRes.data.sharesMinted,
      };

      setResult(depositResult);
      return depositResult;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Deposit failed";
      setError(message);
      return null;
    } finally {
      setLoading(false);
    }
  };

  return { deposit, loading, error, result };
}
