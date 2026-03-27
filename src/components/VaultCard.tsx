"use client";

import Link from "next/link";
import { ArrowUpRight, TrendingUp, Wallet } from "lucide-react";
import { formatAPY, formatUSDCCompact } from "@/lib/utils";
import type { NativeVault } from "@/types";

interface VaultCardProps {
  vault: NativeVault;
}

export function VaultCard({ vault }: VaultCardProps) {
  return (
    <Link href={`/vault/${vault.id}`}>
      <div className="glass-card group relative cursor-pointer overflow-hidden p-6">
        {/* Subtle gold corner glow on hover */}
        <div className="absolute -top-20 -right-20 h-40 w-40 rounded-full bg-gold-500/0 transition-all duration-500 group-hover:bg-gold-500/5" />

        {/* Header */}
        <div className="mb-6 flex items-start justify-between">
          <div>
            <p className="section-label mb-2">{vault.underlying}</p>
            <h3 className="font-serif text-2xl font-light text-foreground">{vault.name}</h3>
          </div>
          <div className="flex h-8 w-8 items-center justify-center rounded-sm bg-white/[0.06] transition-colors group-hover:bg-gold-500/20">
            <ArrowUpRight className="h-4 w-4 text-muted transition-colors group-hover:text-gold-400" />
          </div>
        </div>

        {/* APY — hero number */}
        <div className="mb-6">
          <div className="text-gradient-gold font-mono text-4xl font-medium tracking-tight">
            {formatAPY(vault.apy)}
          </div>
          <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            Annual Yield
          </p>
        </div>

        {/* Stats row */}
        <div className="flex items-center gap-6 border-t border-white/[0.06] pt-4">
          <div className="flex items-center gap-2">
            <Wallet className="h-3.5 w-3.5 text-muted-foreground" />
            <div>
              <p className="font-mono text-xs text-foreground">
                {vault.tvlUsdc > 0 ? formatUSDCCompact(vault.tvlUsdc) : "--"}
              </p>
              <p className="font-mono text-[9px] uppercase tracking-[0.15em] text-muted-foreground">
                TVL
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <TrendingUp className="h-3.5 w-3.5 text-success" />
            <div>
              <p className="font-mono text-xs text-foreground">{vault.rateBps} bps</p>
              <p className="font-mono text-[9px] uppercase tracking-[0.15em] text-muted-foreground">
                Rate
              </p>
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}
