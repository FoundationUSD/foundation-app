"use client";

import { TrendingUp, Coins } from "lucide-react";
import { formatNumber, formatCurrency } from "@/lib/utils";
import type { UserPosition } from "@/types";

interface PositionCardProps {
  position: UserPosition;
}

export function PositionCard({ position }: PositionCardProps) {
  return (
    <div className="glass-card p-5">
      <div className="mb-4 flex items-center justify-between">
        <h4 className="font-serif text-lg font-light text-foreground">{position.vaultName}</h4>
        <div className="flex h-8 w-8 items-center justify-center rounded-sm bg-gold-500/10">
          <Coins className="h-4 w-4 text-gold-400" />
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex justify-between">
          <span className="text-sm text-muted-foreground">Shares</span>
          <span className="font-mono text-sm text-foreground">
            {formatNumber(position.shares)}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-sm text-muted-foreground">Current Value</span>
          <span className="font-mono text-sm text-foreground">
            {formatCurrency(position.value)}
          </span>
        </div>
        {position.pnl !== 0 && (
          <div className="flex justify-between">
            <span className="text-sm text-muted-foreground">P&L</span>
            <span
              className={`flex items-center gap-1 font-mono text-sm ${
                position.pnl >= 0 ? "text-success" : "text-error"
              }`}
            >
              <TrendingUp className="h-3 w-3" />
              {position.pnl >= 0 ? "+" : ""}
              {formatCurrency(position.pnl)}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
