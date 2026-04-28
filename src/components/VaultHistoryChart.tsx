"use client";

import { useEffect, useMemo, useState } from "react";
import {
  LineChart,
  Line,
  Area,
  AreaChart,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";

type Range = "7d" | "30d" | "90d" | "all";
type Metric = "apy" | "tvl";

interface Point {
  t: number;
  apy: number;
  tvl: number | null;
}

interface ApiResponse {
  success: boolean;
  data?: { vaultId: string; range: Range; points: Point[] };
  error?: string;
}

const RANGES: Range[] = ["7d", "30d", "90d", "all"];

function formatTime(ms: number, range: Range): string {
  const d = new Date(ms);
  if (range === "7d") return d.toLocaleString(undefined, { weekday: "short", hour: "numeric" });
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatTvl(v: number | null | undefined): string {
  if (v == null) return "—";
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(1)}K`;
  return `$${v.toFixed(0)}`;
}

export function VaultHistoryChart({ vaultId, currentApy }: { vaultId: string; currentApy?: number }) {
  const [range, setRange] = useState<Range>("30d");
  const [metric, setMetric] = useState<Metric>("apy");
  const [points, setPoints] = useState<Point[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setErr(null);
    fetch(`/api/vaults/${vaultId}/history?range=${range}`)
      .then((r) => r.json())
      .then((j: ApiResponse) => {
        if (!alive) return;
        if (j.success && j.data) setPoints(j.data.points);
        else setErr(j.error || "Failed to load history");
      })
      .catch((e) => { if (alive) setErr(e.message); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [vaultId, range]);

  const stats = useMemo(() => {
    if (points.length === 0) return null;
    const series = metric === "apy" ? points.map((p) => p.apy) : points.map((p) => p.tvl ?? 0);
    const first = series[0];
    const last = series[series.length - 1];
    const min = Math.min(...series);
    const max = Math.max(...series);
    const change = last - first;
    const pctChange = first ? (change / first) * 100 : 0;
    return { first, last, min, max, change, pctChange };
  }, [points, metric]);

  const minDomain = stats ? Math.min(stats.min * 0.95, stats.min - 0.5) : 0;
  const maxDomain = stats ? Math.max(stats.max * 1.05, stats.max + 0.5) : 100;

  return (
    <div className="rounded-xl border border-[var(--rule)] bg-[var(--surface)] p-4">
      {/* Header: metric toggle + range */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 rounded-lg bg-[var(--surface-strong)] p-0.5">
          {(["apy", "tvl"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMetric(m)}
              className={`px-3 py-1.5 font-mono text-[10px] uppercase tracking-wide transition-all rounded-md ${
                metric === m ? "bg-[var(--navy)] text-white" : "text-[var(--text-accent)] hover:text-[var(--fg)]"
              }`}
            >
              {m === "apy" ? "APY" : "TVL"}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          {RANGES.map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`px-2.5 py-1 font-mono text-[10px] uppercase tracking-wide rounded-md transition-all ${
                range === r
                  ? "bg-[var(--navy)] text-white"
                  : "text-[var(--text-accent)] hover:bg-[var(--surface-strong)]"
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {/* Stats row */}
      {stats && (
        <div className="mb-4 grid grid-cols-3 gap-3 border-b border-[var(--rule)] pb-3">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-[var(--text-accent)]">Latest</div>
            <div className="text-lg font-semibold text-[var(--fg)]">
              {metric === "apy" ? `${stats.last.toFixed(2)}%` : formatTvl(stats.last)}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-[var(--text-accent)]">Change</div>
            <div
              className={`text-lg font-semibold ${
                stats.change >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
              }`}
            >
              {stats.change >= 0 ? "+" : ""}
              {metric === "apy" ? `${stats.change.toFixed(2)}pp` : formatTvl(stats.change)}{" "}
              <span className="text-xs font-normal opacity-70">
                ({stats.change >= 0 ? "+" : ""}
                {stats.pctChange.toFixed(1)}%)
              </span>
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-[var(--text-accent)]">Range</div>
            <div className="text-sm font-medium text-[var(--fg)]">
              {metric === "apy"
                ? `${stats.min.toFixed(2)} – ${stats.max.toFixed(2)}%`
                : `${formatTvl(stats.min)} – ${formatTvl(stats.max)}`}
            </div>
          </div>
        </div>
      )}

      {/* Chart */}
      <div className="h-[280px] w-full">
        {loading ? (
          <div className="skeleton h-full w-full rounded-lg" />
        ) : err ? (
          <div className="flex h-full items-center justify-center text-xs text-[var(--text-accent)]">
            Failed to load: {err}
          </div>
        ) : points.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
            <p className="text-xs text-[var(--text-accent)]">No history recorded yet for this range.</p>
            <p className="text-[10px] text-[var(--muted)]">Data accumulates as the rate-update cron runs (hourly).</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            {metric === "apy" ? (
              <LineChart data={points} margin={{ top: 5, right: 10, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="apyGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="rgb(184, 150, 12)" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="rgb(184, 150, 12)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--rule)" vertical={false} />
                <XAxis
                  dataKey="t"
                  tickFormatter={(t) => formatTime(t, range)}
                  fontSize={10}
                  stroke="var(--text-accent)"
                  tick={{ fill: "var(--text-accent)" }}
                />
                <YAxis
                  domain={[minDomain, maxDomain]}
                  tickFormatter={(v) => `${v.toFixed(1)}%`}
                  fontSize={10}
                  stroke="var(--text-accent)"
                  tick={{ fill: "var(--text-accent)" }}
                />
                <Tooltip
                  contentStyle={{
                    background: "var(--surface)",
                    border: "1px solid var(--rule)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  labelFormatter={(t) => new Date(t).toLocaleString()}
                  formatter={(v) => [`${Number(v).toFixed(2)}%`, "APY"]}
                />
                {currentApy != null && (
                  <ReferenceLine y={currentApy} stroke="rgb(184, 150, 12)" strokeDasharray="4 4" strokeOpacity={0.6} />
                )}
                <Line
                  type="monotone"
                  dataKey="apy"
                  stroke="rgb(184, 150, 12)"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              </LineChart>
            ) : (
              <AreaChart data={points} margin={{ top: 5, right: 10, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="tvlGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="rgb(59, 130, 246)" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="rgb(59, 130, 246)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--rule)" vertical={false} />
                <XAxis
                  dataKey="t"
                  tickFormatter={(t) => formatTime(t, range)}
                  fontSize={10}
                  stroke="var(--text-accent)"
                  tick={{ fill: "var(--text-accent)" }}
                />
                <YAxis
                  domain={[minDomain, maxDomain]}
                  tickFormatter={(v) => formatTvl(v)}
                  fontSize={10}
                  stroke="var(--text-accent)"
                  tick={{ fill: "var(--text-accent)" }}
                />
                <Tooltip
                  contentStyle={{
                    background: "var(--surface)",
                    border: "1px solid var(--rule)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  labelFormatter={(t) => new Date(t).toLocaleString()}
                  formatter={(v) => [formatTvl(Number(v)), "TVL"]}
                />
                <Area
                  type="monotone"
                  dataKey="tvl"
                  stroke="rgb(59, 130, 246)"
                  strokeWidth={2}
                  fill="url(#tvlGrad)"
                />
              </AreaChart>
            )}
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
