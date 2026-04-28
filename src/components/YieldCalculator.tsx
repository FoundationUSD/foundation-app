"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Sparkles, TrendingUp, ArrowRight } from "lucide-react";
import { Area, AreaChart, ResponsiveContainer, Tooltip } from "recharts";
import { FOUNDATION_VAULTS, type FoundationVault } from "@/lib/vaults";
import { formatNumber } from "@/lib/utils";

/**
 * Yield projection widget. Shows a continuous-compound growth curve over the
 * chosen horizon, with breakdowns on daily / monthly / yearly accrual and a
 * direct CTA into the selected vault.
 *
 * Continuous compound: balance(t) = principal * exp(apy * t_years)
 */
const HORIZONS: Array<{ key: string; months: number; label: string }> = [
  { key: "1m",  months: 1,  label: "1 month"  },
  { key: "3m",  months: 3,  label: "3 months" },
  { key: "6m",  months: 6,  label: "6 months" },
  { key: "1y",  months: 12, label: "1 year"   },
  { key: "2y",  months: 24, label: "2 years"  },
  { key: "5y",  months: 60, label: "5 years"  },
];

const QUICK_AMOUNTS = [1_000, 10_000, 100_000];

export function YieldCalculator({ liveStrategies }: { liveStrategies?: FoundationVault[] }) {
  const allVaults = liveStrategies && liveStrategies.length > 0 ? liveStrategies : FOUNDATION_VAULTS;
  const live = allVaults.filter((v) => v.status === "live");

  const [vaultId, setVaultId] = useState<string>(live[0]?.id || allVaults[0].id);
  const [amount, setAmount] = useState<string>("10000");
  const [horizonKey, setHorizonKey] = useState<string>("1y");

  const vault = allVaults.find((v) => v.id === vaultId)!;
  const principal = Math.max(0, parseFloat(amount) || 0);
  const horizon = HORIZONS.find((h) => h.key === horizonKey) || HORIZONS[3];
  const years = horizon.months / 12;
  const apyDecimal = (vault?.apy || 0) / 100;

  const { points, summary } = useMemo(() => {
    const steps = 60;
    const pts: { t: number; balance: number; baseline: number }[] = [];
    for (let i = 0; i <= steps; i++) {
      const tYears = (i / steps) * years;
      pts.push({
        t: i,
        balance: principal * Math.exp(apyDecimal * tYears),
        baseline: principal,
      });
    }
    const end = pts[pts.length - 1].balance;
    const yieldUsd = end - principal;
    const monthly = principal * (Math.exp(apyDecimal / 12) - 1);
    const daily = principal * (Math.exp(apyDecimal / 365) - 1);
    return {
      points: pts,
      summary: { end, yieldUsd, monthly, daily, growthPct: principal ? (yieldUsd / principal) * 100 : 0 },
    };
  }, [principal, apyDecimal, years]);

  const isMeaningful = principal > 0 && apyDecimal > 0;

  return (
    <div className="overflow-hidden rounded-2xl border border-[var(--rule)] bg-[var(--surface)]">
      {/* Hero header with gradient */}
      <div
        className="relative border-b border-[var(--rule)] px-5 py-4"
        style={{
          background:
            "linear-gradient(135deg, rgba(184,150,12,0.08) 0%, rgba(184,150,12,0) 60%), linear-gradient(180deg, rgba(15,23,42,0.02) 0%, rgba(15,23,42,0) 100%)",
        }}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gold-500/15 text-gold-600 dark:text-gold-400">
              <Sparkles className="h-3.5 w-3.5" />
            </span>
            <div>
              <h2 className="font-serif text-lg font-light leading-tight text-[var(--fg)]">
                If you had deposited<span className="text-gold-500">.</span>
              </h2>
              <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--text-accent)]">
                Yield projection · continuous compounding
              </p>
            </div>
          </div>
          {isMeaningful && (
            <div className="hidden text-right sm:block">
              <div className="font-mono text-[9px] uppercase tracking-wider text-[var(--text-accent)]">After {horizon.label}</div>
              <div className="font-serif text-2xl font-light text-[var(--fg)]">
                ${formatNumber(Math.round(summary.end))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="grid gap-5 p-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        {/* Left: chart + breakdown */}
        <div className="space-y-4">
          {/* Growth curve */}
          <div className="relative h-[180px] w-full overflow-hidden rounded-xl border border-[var(--rule)] bg-[var(--surface-strong)]/50">
            {!isMeaningful ? (
              <div className="flex h-full items-center justify-center px-4 text-center">
                <p className="text-xs text-[var(--text-accent)]">
                  Enter an amount and pick a vault to project your growth curve.
                </p>
              </div>
            ) : (
              <>
                <div className="absolute left-3 top-3 z-10">
                  <div className="font-mono text-[9px] uppercase tracking-wider text-[var(--text-accent)]">Projected balance</div>
                  <div className="flex items-baseline gap-2">
                    <span className="font-serif text-xl font-light text-[var(--fg)]">${formatNumber(Math.round(summary.end))}</span>
                    <span className="font-mono text-[10px] text-emerald-600 dark:text-emerald-400">
                      +{summary.growthPct.toFixed(2)}%
                    </span>
                  </div>
                </div>
                <div className="absolute right-3 top-3 z-10 rounded-full border border-[var(--rule)] bg-[var(--surface)]/80 px-2.5 py-1 backdrop-blur">
                  <span className="font-mono text-[9px] uppercase tracking-wider text-[var(--text-accent)]">{vault.apy.toFixed(2)}% APY</span>
                </div>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={points} margin={{ top: 50, right: 0, bottom: 0, left: 0 }}>
                    <defs>
                      <linearGradient id="ycCurve" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="rgb(184,150,12)" stopOpacity={0.45} />
                        <stop offset="100%" stopColor="rgb(184,150,12)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <Tooltip
                      contentStyle={{
                        background: "var(--surface)",
                        border: "1px solid var(--rule)",
                        borderRadius: 8,
                        fontSize: 11,
                        padding: "6px 10px",
                      }}
                      labelFormatter={(t) => {
                        const monthsIn = (Number(t) / 60) * horizon.months;
                        return monthsIn < 1
                          ? `${(monthsIn * 30).toFixed(0)} days`
                          : monthsIn < 12
                          ? `${monthsIn.toFixed(1)} months`
                          : `${(monthsIn / 12).toFixed(1)} years`;
                      }}
                      formatter={(v) => [`$${formatNumber(Math.round(Number(v)))}`, "Balance"]}
                    />
                    <Area
                      type="monotone"
                      dataKey="balance"
                      stroke="rgb(184,150,12)"
                      strokeWidth={2}
                      fill="url(#ycCurve)"
                      isAnimationActive
                      animationDuration={650}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </>
            )}
          </div>

          {/* Breakdown chips */}
          <div className="grid grid-cols-3 gap-2">
            <BreakdownChip label="Per day"   value={isMeaningful ? `+$${formatNumber(round2(summary.daily))}`   : "—"} />
            <BreakdownChip label="Per month" value={isMeaningful ? `+$${formatNumber(round2(summary.monthly))}` : "—"} />
            <BreakdownChip label="Total yield" value={isMeaningful ? `+$${formatNumber(Math.round(summary.yieldUsd))}` : "—"} highlight />
          </div>
        </div>

        {/* Right: controls */}
        <div className="space-y-3">
          {/* Vault picker */}
          <div>
            <label className="mb-1.5 block font-mono text-[9px] uppercase tracking-wider text-[var(--text-accent)]">
              Strategy
            </label>
            <div className="relative">
              <select
                value={vaultId}
                onChange={(e) => setVaultId(e.target.value)}
                className="w-full appearance-none rounded-lg border border-[var(--rule)] bg-[var(--surface-strong)] px-3 py-2.5 pr-8 text-sm text-[var(--fg)]"
              >
                {allVaults.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name} — {v.apy.toFixed(2)}% APY{v.status === "coming_soon" ? " (soon)" : ""}
                  </option>
                ))}
              </select>
              <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 font-mono text-[10px] text-[var(--muted)]">▾</span>
            </div>
          </div>

          {/* Amount */}
          <div>
            <label className="mb-1.5 block font-mono text-[9px] uppercase tracking-wider text-[var(--text-accent)]">
              Deposit (USDC)
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-base text-[var(--text-accent)]">$</span>
              <input
                type="number"
                inputMode="decimal"
                min="0"
                step="100"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full rounded-lg border border-[var(--rule)] bg-[var(--surface-strong)] px-3 py-2.5 pl-7 text-base text-[var(--fg)]"
              />
            </div>
            <div className="mt-1.5 flex flex-wrap gap-1">
              {QUICK_AMOUNTS.map((a) => {
                const isActive = principal === a;
                return (
                  <button
                    key={a}
                    type="button"
                    onClick={() => setAmount(String(a))}
                    className={`rounded-full border px-2.5 py-0.5 font-mono text-[10px] transition-all ${
                      isActive
                        ? "border-gold-500/50 bg-gold-500/10 text-gold-700 dark:text-gold-400"
                        : "border-[var(--rule)] text-[var(--text-accent)] hover:bg-[var(--surface-strong)]"
                    }`}
                  >
                    ${formatNumber(a)}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Horizon chips */}
          <div>
            <label className="mb-1.5 block font-mono text-[9px] uppercase tracking-wider text-[var(--text-accent)]">
              Horizon
            </label>
            <div className="grid grid-cols-3 gap-1.5">
              {HORIZONS.map((h) => {
                const isActive = h.key === horizonKey;
                return (
                  <button
                    key={h.key}
                    type="button"
                    onClick={() => setHorizonKey(h.key)}
                    className={`rounded-md border px-1 py-2 text-center font-mono text-[10px] uppercase tracking-wider transition-all ${
                      isActive
                        ? "border-[var(--navy)] bg-[var(--navy)] text-white"
                        : "border-[var(--rule)] bg-[var(--surface-strong)] text-[var(--text-accent)] hover:border-[var(--border-hover)] hover:text-[var(--fg)]"
                    }`}
                  >
                    {h.key}
                  </button>
                );
              })}
            </div>
          </div>

          {/* CTA */}
          {vault?.status === "live" ? (
            <Link
              href={`/strategy/${vault.id}`}
              className="group flex items-center justify-between rounded-lg bg-[var(--navy)] px-4 py-3 transition-opacity hover:opacity-95"
            >
              <span className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-wider text-white">
                <TrendingUp className="h-3.5 w-3.5" />
                Deposit into {vault.receiptToken}
              </span>
              <ArrowRight className="h-3.5 w-3.5 text-white transition-transform group-hover:translate-x-0.5" />
            </Link>
          ) : (
            <div className="rounded-lg border border-dashed border-[var(--rule)] bg-[var(--surface-strong)] px-4 py-3 text-center font-mono text-[10px] uppercase tracking-wider text-[var(--text-accent)]">
              Vault coming soon
            </div>
          )}
        </div>
      </div>

      {/* Disclaimer footer */}
      <div className="border-t border-[var(--rule)] bg-[var(--surface-strong)]/30 px-5 py-2.5">
        <p className="text-[10px] leading-relaxed text-[var(--muted)]">
          Continuous compounding at the current APY. Real yields move as APY responds to market conditions and vault rebalances. Not investment advice.
        </p>
      </div>
    </div>
  );
}

function BreakdownChip({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div
      className={`rounded-xl border p-3 ${
        highlight
          ? "border-emerald-500/30 bg-emerald-500/5"
          : "border-[var(--rule)] bg-[var(--surface-strong)]/50"
      }`}
    >
      <div className="mb-0.5 font-mono text-[9px] uppercase tracking-wider text-[var(--text-accent)]">{label}</div>
      <div
        className={`font-mono text-sm font-medium ${
          highlight ? "text-emerald-700 dark:text-emerald-400" : "text-[var(--fg)]"
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
