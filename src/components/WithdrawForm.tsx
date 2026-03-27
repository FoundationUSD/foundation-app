"use client";

import { useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { Loader2, Check, ExternalLink } from "lucide-react";
import { useWithdraw } from "@/hooks/useWithdraw";
import { getTxUrl } from "@/lib/constants";
import type { NativeVault, UserPosition } from "@/types";

interface WithdrawFormProps {
  vault: NativeVault;
  position: UserPosition | null;
  onSuccess?: () => void;
}

export function WithdrawForm({ vault, position, onSuccess }: WithdrawFormProps) {
  const wallet = useWallet();
  const { withdraw, loading, error, result } = useWithdraw(vault.id);
  const [amount, setAmount] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const num = parseFloat(amount);
    if (isNaN(num) || num <= 0) return;

    const res = await withdraw(num, vault.mintAddress);
    if (res) {
      setAmount("");
      onSuccess?.();
    }
  };

  const handleMax = () => {
    if (position && position.shares > 0) {
      setAmount(position.shares.toString());
    }
  };

  if (!wallet.connected) {
    return (
      <div className="glass rounded-xl p-6 text-center">
        <p className="mb-3 text-sm text-muted">Connect your wallet to withdraw</p>
      </div>
    );
  }

  if (result) {
    return (
      <div className="glass rounded-xl p-6">
        <div className="mb-4 flex items-center gap-2 text-success">
          <Check className="h-5 w-5" />
          <span className="font-mono text-sm">Withdrawal Successful</span>
        </div>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">USDC Returned</span>
            <span className="font-mono text-foreground">
              ${(result.usdcReturned / 1_000_000).toFixed(2)}
            </span>
          </div>
          <a
            href={getTxUrl(result.transferTx)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-gold-400 hover:text-gold-300"
          >
            <span className="font-mono text-xs">View on Solscan</span>
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="glass rounded-xl p-6">
      <h4 className="section-label mb-4">Withdraw</h4>

      <div className="mb-4">
        <div className="flex items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.03] px-4 py-3 transition-colors focus-within:border-gold-500/30">
          <input
            type="number"
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="flex-1 bg-transparent font-mono text-lg text-foreground outline-none placeholder:text-muted-foreground/50"
            step="0.01"
            min="0"
          />
          <button
            type="button"
            onClick={handleMax}
            className="font-mono text-[10px] uppercase tracking-[0.15em] text-gold-500 transition-colors hover:text-gold-400"
          >
            Max
          </button>
          <span className="font-mono text-xs text-muted-foreground">{vault.symbol}</span>
        </div>
        {position && position.shares > 0 && (
          <p className="mt-1 font-mono text-[10px] text-muted-foreground">
            Balance: {position.shares.toFixed(2)} {vault.symbol}
          </p>
        )}
      </div>

      {amount && parseFloat(amount) > 0 && (
        <div className="mb-4 space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">You receive</span>
            <span className="font-mono text-foreground">
              ~${parseFloat(amount).toFixed(2)} USDC
            </span>
          </div>
        </div>
      )}

      {error && (
        <p className="mb-3 font-mono text-xs text-error">{error}</p>
      )}

      <button
        type="submit"
        disabled={loading || !amount || parseFloat(amount) <= 0}
        className="btn-glass flex w-full items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Confirming...
          </>
        ) : (
          "Withdraw"
        )}
      </button>
    </form>
  );
}
