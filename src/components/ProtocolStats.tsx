"use client";

import { Shield, Users, TrendingUp } from "lucide-react";
import { formatUSDCCompact } from "@/lib/utils";
import type { NativeVault } from "@/types";

interface ProtocolStatsProps {
  vaults: NativeVault[];
}

export function ProtocolStats({ vaults }: ProtocolStatsProps) {
  const totalTvl = vaults.reduce((sum, v) => sum + v.tvlUsdc, 0);
  const avgApy = vaults.length > 0 ? vaults.reduce((sum, v) => sum + v.apy, 0) / vaults.length : 0;

  const stats = [
    {
      label: "Total Value Locked",
      value: totalTvl > 0 ? formatUSDCCompact(totalTvl) : "--",
      icon: Shield,
    },
    {
      label: "Active Vaults",
      value: vaults.length.toString(),
      icon: Users,
    },
    {
      label: "Avg. Yield",
      value: avgApy > 0 ? `${avgApy.toFixed(2)}%` : "--",
      icon: TrendingUp,
    },
  ];

  return (
    <div className="grid grid-cols-3 gap-4">
      {stats.map((stat) => (
        <div key={stat.label} className="glass rounded-xl p-4 text-center">
          <stat.icon className="mx-auto mb-2 h-4 w-4 text-gold-500" />
          <p className="font-mono text-xl font-medium text-foreground">{stat.value}</p>
          <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground">
            {stat.label}
          </p>
        </div>
      ))}
    </div>
  );
}
