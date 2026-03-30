"use client";

import { ExternalLink, ArrowRight } from "lucide-react";
import { formatAPY, formatUSDCCompact } from "@/lib/utils";
import type { ExternalVaultItem } from "@/hooks/useExternalVaults";

const PROTOCOL_CONFIG: Record<string, { color: string; label: string; bg: string }> = {
  kamino: { color: "text-blue-400", label: "Kamino Finance", bg: "bg-blue-500/10" },
  drift: { color: "text-purple-400", label: "Drift Protocol", bg: "bg-purple-500/10" },
  solomon: { color: "text-emerald-400", label: "Solomon Labs", bg: "bg-emerald-500/10" },
};

interface ExternalVaultCardProps {
  vault: ExternalVaultItem;
}

export function ExternalVaultCard({ vault }: ExternalVaultCardProps) {
  const config = PROTOCOL_CONFIG[vault.protocol] || PROTOCOL_CONFIG.kamino;

  return (
    <div className="glass-card group relative overflow-hidden p-5">
      {/* Protocol badge */}
      <div className="mb-4 flex items-center justify-between">
        <span className={`${config.bg} ${config.color} rounded px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.15em]`}>
          {config.label}
        </span>
        {vault.depositEnabled && (
          <span className="rounded bg-success/10 px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.1em] text-success">
            Deposit Ready
          </span>
        )}
      </div>

      {/* Name + description */}
      <h4 className="mb-1 font-serif text-lg font-light text-foreground">{vault.name}</h4>
      <p className="mb-4 text-xs leading-relaxed text-muted-foreground">{vault.description}</p>

      {/* Stats */}
      <div className="mb-4 flex items-center gap-6 border-t border-white/[0.06] pt-3">
        <div>
          <p className="text-gradient-gold font-mono text-lg font-medium">
            {vault.apy > 0 ? formatAPY(vault.apy) : "--"}
          </p>
          <p className="font-mono text-[9px] uppercase tracking-[0.15em] text-muted-foreground">
            APY
          </p>
        </div>
        <div>
          <p className="font-mono text-sm text-foreground">
            {vault.tvl > 0 ? formatUSDCCompact(vault.tvl * 1_000_000) : "--"}
          </p>
          <p className="font-mono text-[9px] uppercase tracking-[0.15em] text-muted-foreground">
            TVL
          </p>
        </div>
      </div>

      {/* Action */}
      <a
        href={vault.externalUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="btn-glass flex w-full items-center justify-center gap-2 text-center"
      >
        {vault.depositEnabled ? (
          <>
            Deposit <ArrowRight className="h-3.5 w-3.5" />
          </>
        ) : (
          <>
            View on {config.label.split(" ")[0]} <ExternalLink className="h-3.5 w-3.5" />
          </>
        )}
      </a>
    </div>
  );
}
