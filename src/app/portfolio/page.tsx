"use client";

import Link from "next/link";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import {
  Wallet,
  ArrowUpRight,
  ArrowDownLeft,
  ExternalLink,
  TrendingUp,
  Coins,
} from "lucide-react";
import { useVaults } from "@/hooks/useVaults";
import { useUserPosition } from "@/hooks/useUserPosition";
import { useTxHistory } from "@/hooks/useTxHistory";
import { formatCurrency, formatNumber, shortenAddress, timeAgo } from "@/lib/utils";
import { getTxUrl } from "@/lib/constants";
import type { NativeVault, UserPosition } from "@/types";

function PositionRow({ vault }: { vault: NativeVault }) {
  const { position, loading } = useUserPosition(vault.id, vault.mintAddress);

  if (loading) return <div className="skeleton h-16 w-full rounded-lg" />;
  if (!position || position.shares === 0) return null;

  return (
    <Link href={`/vault/${vault.id}`}>
      <div className="glass-card group flex items-center justify-between p-4 transition-all hover:border-gold-500/20">
        <div className="flex items-center gap-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gold-500/10">
            <Coins className="h-5 w-5 text-gold-400" />
          </div>
          <div>
            <h4 className="font-serif text-base font-light text-foreground">{vault.name}</h4>
            <p className="font-mono text-[10px] text-muted-foreground">{vault.underlying}</p>
          </div>
        </div>

        <div className="flex items-center gap-8">
          <div className="text-right">
            <p className="font-mono text-sm text-foreground">
              {formatNumber(position.shares)} shares
            </p>
            <p className="font-mono text-[10px] text-muted-foreground">
              ~{formatCurrency(position.value)}
            </p>
          </div>

          <div className="text-right">
            <p className="text-gradient-gold font-mono text-sm font-medium">
              {vault.apy.toFixed(2)}% APY
            </p>
          </div>

          <ArrowUpRight className="h-4 w-4 text-muted-foreground transition-colors group-hover:text-gold-400" />
        </div>
      </div>
    </Link>
  );
}

function TotalValue({ vaults }: { vaults: NativeVault[] }) {
  // This component aggregates all user positions for a total portfolio value
  // In a real app you'd compute this server-side, but for MVP we show it client-side
  return (
    <div className="glass rounded-xl p-6">
      <p className="section-label mb-2">Portfolio Value</p>
      <p className="font-serif text-4xl font-light text-foreground">--</p>
      <p className="mt-1 font-mono text-[10px] text-muted-foreground">
        Connect wallet & deposit to see your portfolio
      </p>
    </div>
  );
}

function TxHistorySection() {
  const { txs, loading } = useTxHistory();

  if (loading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="skeleton h-12 rounded-lg" />
        ))}
      </div>
    );
  }

  if (txs.length === 0) {
    return (
      <div className="rounded-xl border border-white/[0.04] p-8 text-center">
        <p className="font-mono text-xs text-muted-foreground">No transactions yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {txs.map((tx) => (
        <div
          key={`${tx.type}-${tx.id}`}
          className="glass flex items-center justify-between rounded-lg p-3"
        >
          <div className="flex items-center gap-3">
            {tx.type === "deposit" ? (
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-success/10">
                <ArrowDownLeft className="h-4 w-4 text-success" />
              </div>
            ) : (
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gold-500/10">
                <ArrowUpRight className="h-4 w-4 text-gold-400" />
              </div>
            )}
            <div>
              <p className="font-mono text-xs text-foreground">
                {tx.type === "deposit" ? "Deposit" : "Withdrawal"} — {tx.vaultId}
              </p>
              <p className="font-mono text-[10px] text-muted-foreground">
                {timeAgo(tx.createdAt)}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <p className="font-mono text-xs text-foreground">
              {tx.type === "deposit" ? "+" : "-"}${(tx.amount / 1_000_000).toFixed(2)}
            </p>
            <a
              href={getTxUrl(tx.tx)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground transition-colors hover:text-gold-400"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function PortfolioPage() {
  const wallet = useWallet();
  const { setVisible } = useWalletModal();
  const { vaults, loading } = useVaults();

  if (!wallet.connected) {
    return (
      <div className="mx-auto flex max-w-5xl flex-col items-center justify-center px-6 py-24">
        <div className="glass-card max-w-md p-10 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gold-500/10">
            <Wallet className="h-8 w-8 text-gold-400" />
          </div>
          <h1 className="mb-2 font-serif text-2xl font-light text-foreground">
            Connect Your Wallet
          </h1>
          <p className="mb-6 text-sm text-muted-foreground">
            Connect your Solana wallet to view your vault positions and transaction history.
          </p>
          <button onClick={() => setVisible(true)} className="btn-primary w-full">
            Connect Wallet
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-12">
      {/* Header + Total */}
      <div className="mb-8">
        <p className="section-label mb-2">Your Portfolio</p>
        <TotalValue vaults={vaults} />
      </div>

      {/* Positions */}
      <div className="mb-10">
        <h3 className="section-label mb-4">Active Positions</h3>
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="skeleton h-16 rounded-xl" />
            ))}
          </div>
        ) : vaults.length === 0 ? (
          <div className="glass-card p-8 text-center">
            <p className="mb-2 text-sm text-muted-foreground">No active positions</p>
            <Link href="/" className="font-mono text-xs text-gold-400 hover:text-gold-300">
              Explore Vaults
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {vaults.map((vault) => (
              <PositionRow key={vault.id} vault={vault} />
            ))}
          </div>
        )}
      </div>

      {/* Transaction History */}
      <div>
        <h3 className="section-label mb-4">Transaction History</h3>
        <TxHistorySection />
      </div>
    </div>
  );
}
