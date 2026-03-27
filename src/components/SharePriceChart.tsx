"use client";

import { useState } from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { useNavHistory } from "@/hooks/useNavHistory";

const PERIODS = [
  { label: "7D", days: 7 },
  { label: "30D", days: 30 },
  { label: "90D", days: 90 },
  { label: "All", days: 365 },
] as const;

interface SharePriceChartProps {
  vaultId: string;
}

export function SharePriceChart({ vaultId }: SharePriceChartProps) {
  const [selectedPeriod, setSelectedPeriod] = useState(1); // 30D default
  const { history, loading } = useNavHistory(vaultId, PERIODS[selectedPeriod].days);

  const chartData = history.map((point) => ({
    date: new Date(point.recordedAt).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    }),
    apy: point.apy,
    tvl: point.tvlUsdc / 1_000_000,
  }));

  return (
    <div className="glass rounded-xl p-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <h4 className="section-label">Yield History</h4>
        <div className="flex gap-1">
          {PERIODS.map((period, i) => (
            <button
              key={period.label}
              onClick={() => setSelectedPeriod(i)}
              className={`rounded px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.1em] transition-colors ${
                selectedPeriod === i
                  ? "bg-gold-500/20 text-gold-400"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {period.label}
            </button>
          ))}
        </div>
      </div>

      {/* Chart */}
      {loading ? (
        <div className="skeleton h-[200px] w-full" />
      ) : chartData.length === 0 ? (
        <div className="flex h-[200px] items-center justify-center">
          <p className="font-mono text-xs text-muted-foreground">No data yet</p>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={chartData}>
            <defs>
              <linearGradient id="goldGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#b8960c" stopOpacity={0.3} />
                <stop offset="100%" stopColor="#b8960c" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="rgba(255,255,255,0.04)"
              vertical={false}
            />
            <XAxis
              dataKey="date"
              tick={{ fill: "#64748b", fontSize: 10, fontFamily: "var(--font-mono)" }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: "#64748b", fontSize: 10, fontFamily: "var(--font-mono)" }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => `${v}%`}
            />
            <Tooltip
              contentStyle={{
                background: "rgba(21, 29, 46, 0.95)",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: "8px",
                backdropFilter: "blur(20px)",
                fontFamily: "var(--font-mono)",
                fontSize: "11px",
              }}
              labelStyle={{ color: "#94a3b8" }}
              itemStyle={{ color: "#b8960c" }}
            />
            <Area
              type="monotone"
              dataKey="apy"
              stroke="#b8960c"
              strokeWidth={2}
              fill="url(#goldGradient)"
              name="APY"
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
