"use client";

import { useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { Loader2, Check, ExternalLink } from "lucide-react";
import { useDeposit } from "@/hooks/useDeposit";
import { getTxUrl } from "@/lib/constants";
import { formatAPY } from "@/lib/utils";
import type { NativeVault } from "@/types";

interface DepositFormProps {
  vault: NativeVault;
  onSuccess?: () => void;
}

export function DepositForm({ vault, onSuccess }: DepositFormProps) {
  const wallet = useWallet();
  const { deposit, loading, error, result } = useDeposit(vault.id);
  const [amount, setAmount] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const num = parseFloat(amount);
    if (isNaN(num) || num <= 0) return;

    const res = await deposit(num);
    if (res) {
      setAmount("");
      onSuccess?.();
    }
  };

  if (!wallet.connected) {
    return (
      <div className="glass rounded-xl p-6 text-center">
        <p className="mb-3 text-sm text-muted">Connect your wallet to deposit</p>
      </div>
    );
  }

  if (result) {
    return (
      <div className="glass rounded-xl p-6">
        <div className="mb-4 flex items-center gap-2 text-success">
          <Check className="h-5 w-5" />
          <span className="font-mono text-sm">Deposit Successful</span>
        </div>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Shares Minted</span>
            <span className="font-mono text-foreground">
              {(result.sharesMinted / 1_000_000).toFixed(2)} {vault.symbol}
            </span>
          </div>
          <a
            href={getTxUrl(result.mintTx)}
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
      <h4 className="section-label mb-4">Deposit USDC</h4>

      {/* Amount input */}
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
          <span className="font-mono text-xs text-muted-foreground">USDC</span>
        </div>
      </div>

      {/* Info rows */}
      {amount && parseFloat(amount) > 0 && (
        <div className="mb-4 space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">You receive</span>
            <span className="font-mono text-foreground">
              {parseFloat(amount).toFixed(2)} {vault.symbol}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Current rate</span>
            <span className="font-mono text-gold-400">{formatAPY(vault.apy)} APY</span>
          </div>
        </div>
      )}

      {error && (
        <p className="mb-3 font-mono text-xs text-error">{error}</p>
      )}

      <button
        type="submit"
        disabled={loading || !amount || parseFloat(amount) <= 0}
        className="btn-primary flex w-full items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Confirming...
          </>
        ) : (
          "Deposit"
        )}
      </button>
    </form>
  );
}
