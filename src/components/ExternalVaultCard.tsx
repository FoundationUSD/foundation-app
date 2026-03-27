"use client";

import { ArrowUpRight, ExternalLink } from "lucide-react";
import { formatAPY, formatUSDCCompact } from "@/lib/utils";
import type { ExternalVault } from "@/types";

const PROTOCOL_COLORS: Record<string, string> = {
  kamino: "text-blue-400",
  drift: "text-purple-400",
  solomon: "text-emerald-400",
};

const PROTOCOL_LABELS: Record<string, string> = {
  kamino: "Kamino Finance",
  drift: "Drift Protocol",
  solomon: "Solomon Labs",
};

interface ExternalVaultCardProps {
  vault: ExternalVault;
}

export function ExternalVaultCard({ vault }: ExternalVaultCardProps) {
  return (
    <a href={vault.externalUrl} target="_blank" rel="noopener noreferrer">
      <div className="glass-card group relative cursor-pointer overflow-hidden p-5">
        <div className="absolute -top-20 -right-20 h-40 w-40 rounded-full bg-white/0 transition-all duration-500 group-hover:bg-white/[0.02]" />

        {/* Protocol badge */}
        <div className="mb-4 flex items-center justify-between">
          <span
            className={`font-mono text-[10px] uppercase tracking-[0.2em] ${PROTOCOL_COLORS[vault.protocol]}`}
          >
            {PROTOCOL_LABELS[vault.protocol]}
          </span>
          <ExternalLink className="h-3.5 w-3.5 text-muted-foreground transition-colors group-hover:text-foreground" />
        </div>

        {/* Name */}
        <h4 className="mb-1 font-serif text-lg font-light text-foreground">{vault.name}</h4>
        <p className="mb-4 text-xs text-muted-foreground">{vault.description}</p>

        {/* Stats */}
        <div className="flex items-center gap-4 border-t border-white/[0.06] pt-3">
          <div>
            <p className="font-mono text-sm text-foreground">
              {vault.apy > 0 ? formatAPY(vault.apy) : "--"}
            </p>
            <p className="font-mono text-[9px] uppercase tracking-[0.15em] text-muted-foreground">
              APY
            </p>
          </div>
          <div>
            <p className="font-mono text-sm text-foreground">
              {vault.tvlUsdc > 0 ? formatUSDCCompact(vault.tvlUsdc) : "--"}
            </p>
            <p className="font-mono text-[9px] uppercase tracking-[0.15em] text-muted-foreground">
              TVL
            </p>
          </div>
        </div>
      </div>
    </a>
  );
}
