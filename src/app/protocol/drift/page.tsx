"use client";

import { useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { ArrowLeft, Wallet, Info, Loader2, Check, ExternalLink } from "lucide-react";
import Link from "next/link";
import { WalletModal } from "@/components/WalletModal";
import { useDriftVaults, useDriftDeposit } from "@/hooks/useDrift";
import { formatAPY, shortenAddress } from "@/lib/utils";
import { getTxUrl } from "@/lib/constants";
import type { DriftVaultInfo } from "@/lib/integrations/drift";

export default function DriftPage() {
  const wallet = useWallet();
  const [walletModalOpen, setWalletModalOpen] = useState(false);
  const { vaults, loading } = useDriftVaults(20);
  const [selectedVault, setSelectedVault] = useState<DriftVaultInfo | null>(null);

  return (
    <div className="mx-auto max-w-5xl px-6 py-12">
      <Link
        href="/"
        className="mb-8 inline-flex items-center gap-2 font-mono text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to Vaults
      </Link>

      <div className="mb-8">
        <span className="mb-2 inline-block rounded bg-purple-500/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.15em] text-purple-400">
          Drift Protocol
        </span>
        <h1 className="mb-2 font-serif text-3xl font-light text-foreground">
          Drift Managed Vaults
        </h1>
        <p className="text-sm text-muted-foreground">
          Managed trading vaults on Drift Protocol. Includes Gauntlet&apos;s levered RWA strategies
          using sACRED (Apollo) collateral for enhanced yield.
        </p>
      </div>

      <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
        {/* Left: Vault list */}
        <div>
          <h3 className="section-label mb-4">Top Vaults by 30d APY</h3>
          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="skeleton h-20 rounded-sm" />
              ))}
            </div>
          ) : vaults.length === 0 ? (
            <div className="glass rounded-sm p-6 text-center">
              <p className="font-mono text-xs text-muted-foreground">No vaults available</p>
            </div>
          ) : (
            <div className="space-y-2">
              {vaults.map((vault) => (
                <button
                  key={vault.address}
                  onClick={() => setSelectedVault(vault)}
                  className={`glass w-full rounded-sm p-4 text-left transition-all hover:border-white/[0.15] ${
                    selectedVault?.address === vault.address
                      ? "border-gold-500/30 bg-gold-500/5"
                      : ""
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="mb-1 text-sm font-medium text-foreground">
                        {vault.name}
                      </p>
                      <div className="flex gap-4">
                        <span className="font-mono text-[10px] text-muted-foreground">
                          {shortenAddress(vault.address, 4)}
                        </span>
                        <span className="font-mono text-[10px] text-muted-foreground">
                          7d: {vault.apy7d > 0 ? formatAPY(vault.apy7d) : "--"}
                        </span>
                        {vault.maxDrawdownPct < 0 && (
                          <span className="font-mono text-[10px] text-error">
                            DD: {vault.maxDrawdownPct.toFixed(1)}%
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-gradient-gold font-mono text-sm font-medium">
                        {formatAPY(vault.apy30d)}
                      </p>
                      <p className="font-mono text-[10px] text-muted-foreground">30d APY</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Right: Deposit panel */}
        <div>
          {!wallet.connected ? (
            <div className="glass rounded-sm p-6 text-center">
              <Wallet className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
              <p className="mb-4 text-sm text-muted">Connect your wallet to deposit</p>
              <button onClick={() => setWalletModalOpen(true)} className="btn-primary">
                Connect Wallet
              </button>
            </div>
          ) : selectedVault ? (
            <DriftDepositForm vault={selectedVault} />
          ) : (
            <div className="glass rounded-sm p-6 text-center">
              <p className="font-mono text-xs text-muted-foreground">Select a vault to deposit</p>
            </div>
          )}
        </div>
      </div>

      <WalletModal open={walletModalOpen} onClose={() => setWalletModalOpen(false)} />
    </div>
  );
}

function DriftDepositForm({ vault }: { vault: DriftVaultInfo }) {
  const { deposit, loading, error, txSignature } = useDriftDeposit();
  const [amount, setAmount] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const num = parseFloat(amount);
    if (isNaN(num) || num <= 0) return;
    const sig = await deposit(vault.address, amount);
    if (sig) setAmount("");
  };

  if (txSignature) {
    return (
      <div className="glass rounded-sm p-6">
        <div className="mb-4 flex items-center gap-2 text-success">
          <Check className="h-5 w-5" />
          <span className="font-mono text-sm">Deposit Successful</span>
        </div>
        <a
          href={getTxUrl(txSignature)}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-gold-400 hover:text-gold-300"
        >
          <span className="font-mono text-xs">View on Solscan</span>
          <ExternalLink className="h-3 w-3" />
        </a>
      </div>
    );
  }

  return (
    <div className="glass rounded-sm p-6">
      <h4 className="mb-1 text-sm font-medium text-foreground">{vault.name}</h4>
      <p className="mb-4 font-mono text-[10px] text-muted-foreground">
        {shortenAddress(vault.address, 4)} · {formatAPY(vault.apy30d)} (30d)
      </p>

      <form onSubmit={handleSubmit}>
        <div className="mb-4">
          <div className="flex items-center gap-2 rounded-sm border border-white/[0.08] bg-white/[0.03] px-4 py-3 focus-within:border-gold-500/30">
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

        {error && <p className="mb-3 font-mono text-xs text-error">{error}</p>}

        <button
          type="submit"
          disabled={loading || !amount || parseFloat(amount) <= 0}
          className="btn-primary flex w-full items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Building tx...
            </>
          ) : (
            "Deposit"
          )}
        </button>
      </form>

      <div className="mt-4 flex items-start gap-2 rounded-sm bg-purple-500/5 p-3">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-purple-400" />
        <p className="font-mono text-[10px] leading-relaxed text-purple-300/80">
          Transaction is built server-side via Drift SDK, then you sign in your wallet.
          Withdrawals use a 2-step process with a redemption period.
        </p>
      </div>
    </div>
  );
}
