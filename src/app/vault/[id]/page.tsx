"use client";

import { use } from "react";
import Link from "next/link";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { useVault } from "@/hooks/useVaults";
import { useUserPosition } from "@/hooks/useUserPosition";
import { DepositForm } from "@/components/DepositForm";
import { WithdrawForm } from "@/components/WithdrawForm";
import { SharePriceChart } from "@/components/SharePriceChart";
import { formatAPY, formatUSDCCompact, shortenAddress } from "@/lib/utils";
import { getAccountUrl } from "@/lib/constants";

export default function VaultDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { vault, loading } = useVault(id);
  const { position } = useUserPosition(id, vault?.mintAddress || "");

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl px-6 py-12">
        <div className="skeleton mb-8 h-8 w-32 rounded" />
        <div className="skeleton mb-4 h-12 w-64 rounded" />
        <div className="grid gap-8 md:grid-cols-[1fr_380px]">
          <div className="skeleton h-[400px] rounded-xl" />
          <div className="skeleton h-[400px] rounded-xl" />
        </div>
      </div>
    );
  }

  if (!vault) {
    return (
      <div className="mx-auto max-w-5xl px-6 py-12 text-center">
        <p className="text-muted">Vault not found</p>
        <Link href="/" className="mt-4 text-gold-400 hover:text-gold-300">
          Back to vaults
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-12">
      {/* Back link */}
      <Link
        href="/"
        className="mb-8 inline-flex items-center gap-2 font-mono text-xs uppercase tracking-[0.1em] text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        All Vaults
      </Link>

      {/* Header */}
      <div className="mb-8">
        <p className="section-label mb-2">{vault.underlying}</p>
        <div className="flex items-end gap-4">
          <h1 className="font-serif text-4xl font-light text-foreground">{vault.name}</h1>
          {vault.mintAddress && (
            <a
              href={getAccountUrl(vault.mintAddress)}
              target="_blank"
              rel="noopener noreferrer"
              className="mb-1 flex items-center gap-1 font-mono text-xs text-muted-foreground transition-colors hover:text-gold-400"
            >
              {shortenAddress(vault.mintAddress)}
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      </div>

      {/* Stats bar */}
      <div className="glass mb-8 grid grid-cols-4 gap-4 rounded-xl p-4">
        <div className="text-center">
          <p className="text-gradient-gold font-mono text-2xl font-medium">
            {formatAPY(vault.apy)}
          </p>
          <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground">
            APY
          </p>
        </div>
        <div className="text-center">
          <p className="font-mono text-2xl font-medium text-foreground">{vault.rateBps}</p>
          <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground">
            Rate (bps)
          </p>
        </div>
        <div className="text-center">
          <p className="font-mono text-2xl font-medium text-foreground">
            {vault.tvlUsdc > 0 ? formatUSDCCompact(vault.tvlUsdc) : "--"}
          </p>
          <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground">
            TVL
          </p>
        </div>
        <div className="text-center">
          <p className="font-mono text-2xl font-medium text-foreground">
            {position && position.shares > 0 ? `$${position.value.toFixed(2)}` : "--"}
          </p>
          <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground">
            Your Position
          </p>
        </div>
      </div>

      {/* Main content */}
      <div className="grid gap-8 md:grid-cols-[1fr_380px]">
        {/* Left: Chart */}
        <div className="space-y-6">
          <SharePriceChart vaultId={vault.id} />

          {/* Vault info */}
          <div className="glass rounded-xl p-6">
            <h4 className="section-label mb-4">About This Vault</h4>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Underlying Asset</span>
                <span className="font-mono text-foreground">{vault.underlying}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Token Standard</span>
                <span className="font-mono text-foreground">SPL Token-2022</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Interest Model</span>
                <span className="font-mono text-foreground">Continuous Compounding</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Yield Source</span>
                <span className="font-mono text-foreground">Interest-Bearing Extension</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right: Deposit / Withdraw */}
        <div className="space-y-4">
          <DepositForm vault={vault} />
          <WithdrawForm vault={vault} position={position} />
        </div>
      </div>
    </div>
  );
}
