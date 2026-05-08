"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, ChevronDown, Layers, Zap, AlertTriangle, TrendingUp } from "lucide-react";
import { useStrategies } from "@/hooks/useStrategies";
import { VaultDetail } from "@/components/VaultDetail";
import { SubscribeForm } from "@/components/SubscribeForm";
import { AWY_COMPOSITION, type AwyLegSpec, type AwyLegId } from "@/lib/integrations/awy";

/** Shape mirrors `LeveragedAwyData` from `src/lib/integrations/awy/index.ts`.
 *  Defined locally to avoid pulling server-only `getLeveragedAwyData` into the
 *  client bundle (its dynamic imports load Solana / RPC code). All APY fields
 *  are nullable because the server refuses to invent numbers when live data
 *  is unavailable. */
interface LeveragedLegView {
  id: AwyLegId;
  asset: string;
  issuer: string;
  weightBps: number;
  underlyingApy: number | null;
  ltv: number;
  liquidationLtv: number;
  borrowAsset: string | null;
  borrowApy: number | null;
  loop: { leverageMultiple: number; grossApy: number; borrowDrag: number; netApy: number } | null;
  contributionApy: number | null;
  ltvSweep: { ltv: number; netApy: number; leverageMultiple: number; liquidationGap: number; recommended: boolean }[];
  underlyingSource: "live" | "unavailable";
  borrowSource: "live" | "unavailable" | "n/a";
  loopVenueLive: boolean;
  loopReady: boolean;
}
interface LeveragedAwyView {
  legs: LeveragedLegView[];
  netApy: number | null;
  grossApy: number | null;
  borrowDrag: number | null;
  legsWithLiveData: number;
  totalLeveragedLegs: number;
  fetchedAt: number;
}

/** Per-leg logo paths. Stored under /public/partners/. */
const LEG_LOGOS: Record<AwyLegId, string> = {
  onyc: "/partners/onyc.png",
  prime: "/partners/prime.png",
  "syrup-usdc": "/partners/syrupUSDC.png",
  solomon: "/partners/solomon-circle.png",
};

/**
 * Per-leg accent color, keyed by risk driver. Used to tint the leg card,
 * the contribution bar segment, and the leverage indicator.
 */
const LEG_COLORS: Record<AwyLegId, { stroke: string; fill: string; soft: string; text: string }> = {
  onyc: {
    stroke: "rgb(236, 72, 153)",
    fill: "rgb(236, 72, 153)",
    soft: "rgba(236, 72, 153, 0.10)",
    text: "rgb(190, 24, 93)",
  },
  prime: {
    stroke: "rgb(245, 158, 11)",
    fill: "rgb(245, 158, 11)",
    soft: "rgba(245, 158, 11, 0.10)",
    text: "rgb(180, 83, 9)",
  },
  "syrup-usdc": {
    stroke: "rgb(168, 85, 247)",
    fill: "rgb(168, 85, 247)",
    soft: "rgba(168, 85, 247, 0.10)",
    text: "rgb(126, 34, 206)",
  },
  solomon: {
    stroke: "rgb(59, 130, 246)",
    fill: "rgb(59, 130, 246)",
    soft: "rgba(59, 130, 246, 0.10)",
    text: "rgb(29, 78, 216)",
  },
};

export default function AwyPage() {
  const { strategies, loading } = useStrategies();
  const awy = strategies.find((s) => s.protocol === "awy");
  const leverageMeta = (awy?.meta as { leverage?: LeveragedAwyView } | undefined)?.leverage;

  return (
    <div className="fdn-page">
      <div className="relative mb-6 overflow-hidden rounded-xl sm:mb-8">
        <div
          className="art-layer art-strip"
          style={{ backgroundImage: "url('/assets/art/strips/Friezemeanderpattern.png')" }}
        />
        <div className="art-content relative flex items-end justify-between gap-4 px-1 py-4 sm:px-2 sm:py-5">
          <div>
            <p className="section-label mb-1 sm:mb-2">FOUNDATION</p>
            <h1 className="page-heading text-xl sm:text-2xl">
              All-Weather <em>Yield</em>
            </h1>
            <p className="mt-1 max-w-xl text-sm text-[var(--text-accent)]">
              A blended real-world asset basket built so that no single macro regime
              compresses every leg at once. ONyc mints directly at NAV; PRIME and the
              Maple-proxy slice supply USDC to Kamino; USDv routes through Solomon.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <Link href="/portfolio" className="fnd-nav-link">
              Portfolio <ArrowUpRight className="h-3 w-3" />
            </Link>
          </div>
        </div>
      </div>

      <div className="mb-8">
        <AwyComposition />
      </div>

      {leverageMeta ? (
        <div className="mb-8">
          <LeverageSection data={leverageMeta} />
        </div>
      ) : null}

      {loading && !awy ? (
        <div className="skeleton h-64 rounded-xl" />
      ) : awy ? (
        <VaultDetail vault={awy} />
      ) : (
        <p className="py-12 text-center font-mono text-sm text-[var(--text-accent)]">
          AWY vault not configured.
        </p>
      )}
    </div>
  );
}

/* ============================================================
   Leverage section — methodology preview, no on-chain execution.
   Math + live borrow rates ported from `FoundationUSD/AWY-model`.
   ============================================================ */

function LeverageSection({ data }: { data: LeveragedAwyView }) {
  const fmtPct = (decimal: number | null, digits = 2) =>
    decimal === null || !Number.isFinite(decimal) ? "—" : `${(decimal * 100).toFixed(digits)}%`;
  const leveragedLegs = data.legs.filter((l) => l.ltv > 0);
  const venueLiveCount = leveragedLegs.filter((l) => l.loopVenueLive).length;
  const headlineReady = data.netApy !== null && data.legsWithLiveData === data.totalLeveragedLegs;

  return (
    <div className="art-frame infra-card relative overflow-hidden p-6 sm:p-8">
      {/* Header */}
      <div className="art-content relative">
        <div className="mb-7 flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between sm:gap-8">
          <div className="max-w-xl">
            <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-gold-500">
              All-Weather Yield · Leverage Preview
            </p>
            <h3 className="page-heading mb-3 text-xl sm:text-[1.75rem]">
              Loop the basket, <em>amplify the carry.</em>
            </h3>
            <p className="text-[13px] leading-relaxed text-[var(--text-accent)] sm:text-sm">
              Methodology preview only. For each leveraged leg, Foundation
              borrows the cheapest stable on Kamino against the leg&apos;s
              collateral and re-supplies it as more underlying. Numbers below
              come strictly from live data — when a leg&apos;s feed is
              unavailable, it surfaces as &quot;data unavailable&quot; rather
              than a fabricated value.
              {venueLiveCount > 0 ? (
                <> Loop venue live for {venueLiveCount} of {leveragedLegs.length} leveraged legs.</>
              ) : null}
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-start gap-1 sm:items-end sm:text-right">
            <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-gold-500">
              Leveraged Net APY
            </p>
            <span className="font-mono text-3xl font-bold tracking-[-0.03em] text-emerald-500 sm:text-[2.75rem]">
              {fmtPct(data.netApy)}
            </span>
            <span className="font-mono text-[10px] tracking-wider text-[var(--text-accent)]">
              {headlineReady
                ? `${data.legsWithLiveData}/${data.totalLeveragedLegs} legs · live data`
                : `${data.legsWithLiveData}/${data.totalLeveragedLegs} legs · partial data`}
            </span>
            <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.2em] text-amber-600">
              Coming Soon
            </span>
          </div>
        </div>

        {/* Gross / drag / net summary strip */}
        <div className="mb-6 grid grid-cols-3 gap-3">
          <SummaryStat label="Gross APY" value={fmtPct(data.grossApy)} sub="Σ weighted leveraged underlying" tone="neutral" />
          <SummaryStat label="Borrow Drag" value={`−${fmtPct(data.borrowDrag)}`} sub="Σ weighted borrow cost" tone="warn" />
          <SummaryStat label="Net APY" value={fmtPct(data.netApy)} sub="Gross minus drag" tone="good" />
        </div>

        {/* Per-leg math table */}
        <div className="mb-6 overflow-x-auto rounded-xl border border-[var(--rule)] bg-[var(--surface)]">
          <table className="w-full text-left font-mono text-[11px]">
            <thead className="border-b border-[var(--rule)] text-[10px] uppercase tracking-wider text-[var(--text-accent)]">
              <tr>
                <th className="px-4 py-2.5">Leg</th>
                <th className="px-3 py-2.5 text-right">Weight</th>
                <th className="px-3 py-2.5 text-right">Underlying</th>
                <th className="px-3 py-2.5 text-right">LTV</th>
                <th className="px-3 py-2.5">Borrow</th>
                <th className="px-3 py-2.5 text-right">Borrow APY</th>
                <th className="px-3 py-2.5 text-right">Lev ×</th>
                <th className="px-3 py-2.5 text-right">Net APY</th>
                <th className="px-3 py-2.5 text-right">Contrib</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--rule)]">
              {data.legs.map((leg) => (
                <tr key={leg.id} className={leg.loopReady ? "" : "opacity-70"}>
                  <td className="px-4 py-2.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-[var(--fg)]">{leg.asset}</span>
                      {!leg.loopVenueLive && leg.ltv > 0 && (
                        <span
                          className="rounded-md bg-amber-500/10 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-amber-600"
                          title="Loop venue not yet live for this leg"
                        >
                          venue pending
                        </span>
                      )}
                      {leg.ltv === 0 && (
                        <span className="rounded-md border border-[var(--rule)] bg-[var(--surface-strong)] px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-[var(--text-accent)]">
                          unlevered
                        </span>
                      )}
                      {!leg.loopReady && (
                        <span
                          className="rounded-md bg-rose-500/10 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-rose-600"
                          title="Live data unavailable for this leg"
                        >
                          data unavailable
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-[var(--text-accent)]">{leg.issuer}</div>
                  </td>
                  <td className="px-3 py-2.5 text-right text-[var(--text-accent)]">{(leg.weightBps / 100).toFixed(0)}%</td>
                  <td className="px-3 py-2.5 text-right text-[var(--fg)]">{fmtPct(leg.underlyingApy)}</td>
                  <td className="px-3 py-2.5 text-right text-[var(--fg)]">
                    {leg.ltv > 0 ? `${(leg.ltv * 100).toFixed(0)}%` : <span className="text-[var(--text-accent)]">n/a</span>}
                  </td>
                  <td className="px-3 py-2.5">
                    {leg.ltv > 0 ? (
                      <span className="text-[var(--fg)]">{leg.borrowAsset ?? "—"}</span>
                    ) : (
                      <span className="text-[var(--text-accent)]">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    {leg.ltv > 0 && leg.borrowApy !== null ? (
                      <span className="text-amber-600">{fmtPct(leg.borrowApy)}</span>
                    ) : (
                      <span className="text-[var(--text-accent)]">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right text-[var(--fg)]">
                    {leg.loop ? `${leg.loop.leverageMultiple.toFixed(2)}×` : "—"}
                  </td>
                  <td className="px-3 py-2.5 text-right font-semibold text-emerald-600">
                    {leg.loop ? fmtPct(leg.loop.netApy) : "—"}
                  </td>
                  <td className="px-3 py-2.5 text-right font-semibold text-emerald-500">
                    {leg.contributionApy !== null ? `+${fmtPct(leg.contributionApy)}` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* LTV sweep per leveraged leg — only legs with live data render a sweep */}
        {leveragedLegs.some((l) => l.ltvSweep.length > 0) && (
          <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {leveragedLegs
              .filter((l) => l.ltvSweep.length > 0 && l.borrowApy !== null)
              .map((leg) => (
                <LtvSweepCard key={leg.id} leg={leg} />
              ))}
          </div>
        )}

        {/* Risk note */}
        <div className="mb-6 flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-[12px] leading-relaxed text-amber-700 dark:text-amber-400">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <span className="font-semibold">Leverage adds liquidation risk.</span> A
            leg with a 50% LTV against an 85% liquidation LTV has 35 percentage
            points of headroom before forced unwind. Sharp moves in the
            underlying or in the borrow rate can compress that gap. Foundation
            will publish an auto-deleverage policy before any on-chain leverage
            is executed.
          </div>
        </div>

        {/* Waitlist */}
        <div className="rounded-xl border border-[var(--rule)] bg-[var(--surface)] p-5">
          <div className="grid grid-cols-1 gap-5 md:grid-cols-[1fr_320px] md:items-center">
            <div className="flex items-start gap-3">
              <TrendingUp className="mt-0.5 h-5 w-5 shrink-0 text-gold-500" />
              <div>
                <p className="mb-1 font-mono text-[10px] uppercase tracking-wider text-gold-500">
                  Get notified when leverage launches
                </p>
                <p className="text-[12px] leading-relaxed text-[var(--text-accent)]">
                  We&apos;ll send the vault address, audit report, and the final
                  per-leg LTV table the moment AWY leverage is live on chain.
                </p>
              </div>
            </div>
            <SubscribeForm variant="waitlist" source="awy-leverage-waitlist" />
          </div>
        </div>

        <p className="mt-4 font-mono text-[10px] tracking-wider text-[var(--text-accent)]">
          Math sourced from FoundationUSD/AWY-model · borrow rates live from Kamino · refreshed{" "}
          {new Date(data.fetchedAt).toLocaleString()}
        </p>
      </div>
    </div>
  );
}

function SummaryStat({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub: string;
  tone: "good" | "warn" | "neutral";
}) {
  const valueColor =
    tone === "good" ? "text-emerald-600" : tone === "warn" ? "text-amber-600" : "text-[var(--fg)]";
  return (
    <div className="rounded-xl border border-[var(--rule)] bg-[var(--surface)] p-4">
      <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--text-accent)]">{label}</p>
      <p className={`mt-1 font-mono text-2xl font-bold tracking-[-0.02em] ${valueColor}`}>{value}</p>
      <p className="mt-1 text-[10px] text-[var(--text-accent)]">{sub}</p>
    </div>
  );
}

function LtvSweepCard({ leg }: { leg: LeveragedLegView }) {
  const fmtPct = (d: number | null, digits = 2) =>
    d === null || !Number.isFinite(d) ? "—" : `${(d * 100).toFixed(digits)}%`;
  return (
    <div className="rounded-xl border border-[var(--rule)] bg-[var(--surface)] p-4">
      <div className="mb-3 flex items-baseline justify-between">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-wider text-gold-500">{leg.asset} LTV sweep</p>
          <p className="text-[10px] text-[var(--text-accent)]">
            Liquidation at {(leg.liquidationLtv * 100).toFixed(0)}% · Borrow {fmtPct(leg.borrowApy)}
          </p>
        </div>
      </div>
      <table className="w-full text-left font-mono text-[11px]">
        <thead className="border-b border-[var(--rule)] text-[9px] uppercase tracking-wider text-[var(--text-accent)]">
          <tr>
            <th className="py-1.5">LTV</th>
            <th className="py-1.5 text-right">Lev ×</th>
            <th className="py-1.5 text-right">Net APY</th>
            <th className="py-1.5 text-right">Gap</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--rule)]">
          {leg.ltvSweep.map((c) => (
            <tr key={c.ltv} className={c.recommended ? "bg-emerald-500/5" : undefined}>
              <td className="py-1.5">
                <span className={c.recommended ? "font-semibold text-emerald-700" : "text-[var(--fg)]"}>
                  {(c.ltv * 100).toFixed(0)}%
                </span>
                {c.recommended && (
                  <span className="ml-1.5 rounded-md bg-emerald-500/15 px-1 py-0.5 text-[9px] uppercase tracking-wider text-emerald-600">
                    rec
                  </span>
                )}
              </td>
              <td className="py-1.5 text-right text-[var(--fg)]">{c.leverageMultiple.toFixed(2)}×</td>
              <td className="py-1.5 text-right font-semibold text-emerald-600">{fmtPct(c.netApy)}</td>
              <td className="py-1.5 text-right text-[var(--text-accent)]">{(c.liquidationGap * 100).toFixed(0)}pp</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ============================================================
   AWY composition — visual basket breakdown
   ============================================================ */

function AwyComposition() {
  const [open, setOpen] = useState(false);

  // Sort by allocation descending for visual hierarchy.
  const rows = [...AWY_COMPOSITION]
    .map((spec) => ({
      spec,
      expectedApy: spec.baseApy,
      contribution: (spec.baseApy * spec.weightBps) / 10_000,
    }))
    .sort((a, b) => b.spec.weightBps - a.spec.weightBps);

  const netApy = rows.reduce((s, r) => s + r.contribution, 0);
  const maxContribution = Math.max(...rows.map((r) => r.contribution));

  return (
    <div className="art-frame infra-card relative overflow-hidden p-6 sm:p-8">
      <div
        className="art-layer art-thumb"
        style={{ backgroundImage: "url('/assets/art/StormoftheFourWinds.png')" }}
      />
      <div className="art-noise" />

      <div className="art-content relative">
        {/* Header */}
        <div className="mb-7 flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between sm:gap-8">
          <div className="max-w-xl">
            <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-gold-500">
              All-Weather Yield · AWY
            </p>
            <h3 className="page-heading mb-3 text-xl sm:text-[1.75rem]">
              Four yield engines. <em>One deposit.</em>
            </h3>
            <p className="text-[13px] leading-relaxed text-[var(--text-accent)] sm:text-sm">
              Foundation routes each deposit across four independent risk drivers.
              ONyc is minted directly at NAV via OnRe&apos;s permissionless program;
              PRIME and the syrupUSDC proxy supply USDC to Kamino lending markets;
              USDv routes through Solomon for delta-neutral basis yield.
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-start gap-1 sm:items-end sm:text-right">
            <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-gold-500">
              Target APY
            </p>
            <span className="font-mono text-3xl font-bold tracking-[-0.03em] text-emerald-500 sm:text-[2.75rem]">
              {netApy.toFixed(2)}%
            </span>
            <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.2em] text-emerald-600">
              Quarterly Rebalance
            </span>
          </div>
        </div>

        {/* At-a-glance: just the four asset names + their weights, no math.
            This is what most depositors actually need to see. */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {rows.map((r) => {
            const c = LEG_COLORS[r.spec.id];
            return (
              <div
                key={r.spec.id}
                className="relative flex items-center gap-2.5 overflow-hidden rounded-lg border border-[var(--rule)] bg-[var(--surface)]/60 px-3 py-2.5"
              >
                <span
                  className="absolute left-0 top-0 h-full w-0.5"
                  style={{ background: c.fill }}
                />
                <Image
                  src={LEG_LOGOS[r.spec.id]}
                  alt={r.spec.asset}
                  width={28}
                  height={28}
                  className="h-7 w-7 shrink-0 rounded-md object-contain"
                />
                <div className="min-w-0">
                  <div className="font-mono text-[12px] font-semibold tracking-tight text-[var(--fg)]">
                    {r.spec.asset}
                  </div>
                  <div className="font-mono text-[10px] tracking-wider text-[var(--text-accent)]">
                    {(r.spec.weightBps / 100).toFixed(0)}% · {r.spec.issuer}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Disclosure — full breakdown for users who want the math */}
        <div className="mt-5 border-t border-[var(--rule)] pt-4">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className="group flex w-full items-center justify-between gap-3 text-left"
          >
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-gold-500">
                {open ? "Hide" : "View"} composition breakdown
              </p>
              <p className="mt-0.5 text-[11px] text-[var(--text-accent)]">
                Per-leg weights, leverage state, expected vs. max APY, and contribution math.
              </p>
            </div>
            <ChevronDown
              className={`h-4 w-4 shrink-0 text-[var(--text-accent)] transition-transform group-hover:text-[var(--fg)] ${
                open ? "rotate-180" : ""
              }`}
            />
          </button>

          <div
            className={`grid overflow-hidden transition-[grid-template-rows] duration-300 ease-out ${
              open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
            }`}
          >
            <div className="min-h-0">
              <div className="pt-5">
                {/* Stacked contribution bar */}
                <div className="mb-6">
                  <div className="mb-2 flex items-baseline justify-between">
                    <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--text-accent)]">
                      Contribution to Net APY
                    </span>
                    <span className="font-mono text-[10px] tracking-wider text-[var(--text-accent)]">
                      Σ = {netApy.toFixed(2)}%
                    </span>
                  </div>
                  <div className="flex h-3 w-full overflow-hidden rounded-full bg-[var(--rule)]">
                    {rows.map((r) => (
                      <div
                        key={r.spec.id}
                        title={`${r.spec.asset}: ${r.contribution.toFixed(2)}%`}
                        style={{
                          width: `${(r.contribution / netApy) * 100}%`,
                          background: LEG_COLORS[r.spec.id].fill,
                        }}
                        className="transition-all"
                      />
                    ))}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5 font-mono text-[10px]">
                    {rows.map((r) => (
                      <div key={r.spec.id} className="flex items-center gap-1.5">
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{ background: LEG_COLORS[r.spec.id].fill }}
                        />
                        <span className="text-[var(--text-accent)]">{r.spec.asset}</span>
                        <span className="font-semibold text-[var(--fg)]">
                          {r.contribution.toFixed(2)}%
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Leg cards grid */}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {rows.map((r) => (
                    <LegCard
                      key={r.spec.id}
                      spec={r.spec}
                      expectedApy={r.expectedApy}
                      contribution={r.contribution}
                      isLargest={r.contribution === maxContribution}
                    />
                  ))}
                </div>

                <p className="mt-5 font-mono text-[10px] tracking-wider text-[var(--text-accent)]">
                  Net APY = Σ (weight × expected APY). External leverage on the credit legs is on the roadmap — added once Kamino publishes an ONyc lending reserve.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function LegCard({
  spec,
  expectedApy,
  contribution,
  isLargest,
}: {
  spec: AwyLegSpec;
  expectedApy: number;
  contribution: number;
  isLargest: boolean;
}) {
  const c = LEG_COLORS[spec.id];
  const weightPct = spec.weightBps / 100;

  // Within-leg uplift bar: shows expected as a fraction of max APY.
  const uplift = spec.maxApy > 0 ? (expectedApy / spec.maxApy) * 100 : 0;

  return (
    <div
      className="relative overflow-hidden rounded-xl border bg-[var(--surface)] p-5 transition-all"
      style={{
        borderColor: "var(--rule)",
        boxShadow: isLargest ? `inset 0 0 0 1px ${c.stroke}33` : undefined,
      }}
    >
      {/* Color rail on the left edge */}
      <div
        className="absolute left-0 top-0 h-full w-1"
        style={{ background: c.stroke }}
      />

      {/* Top row: logo + asset + weight ring */}
      <div className="mb-4 flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <Image
            src={LEG_LOGOS[spec.id]}
            alt={spec.asset}
            width={36}
            height={36}
            className="h-9 w-9 shrink-0 rounded-lg object-contain"
          />
          <div className="min-w-0">
            <div className="flex items-baseline gap-2">
              <span className="font-mono text-base font-bold text-[var(--fg)]">
                {spec.asset}
              </span>
              {spec.leveraged ? (
                <span
                  className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-wider"
                  style={{ background: c.soft, color: c.text }}
                >
                  <Zap className="h-2.5 w-2.5" />
                  Looped
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-md border border-[var(--rule)] bg-[var(--surface-strong)] px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-wider text-[var(--text-accent)]">
                  <Layers className="h-2.5 w-2.5" />
                  Direct
                </span>
              )}
            </div>
            <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--text-accent)]">
              {spec.issuer} · {spec.riskDriver}
            </p>
          </div>
        </div>

        {/* Weight ring */}
        <WeightRing pct={weightPct} color={c.stroke} />
      </div>

      {/* Description */}
      <p className="mb-4 text-[11px] leading-snug text-[var(--text-accent)]">
        {spec.description}
      </p>

      {/* Max → Expected uplift bar */}
      <div className="mb-3">
        <div className="mb-1 flex items-baseline justify-between font-mono text-[9px] uppercase tracking-wider text-[var(--text-accent)]">
          <span>Expected → Max</span>
          <span>
            <span className="font-semibold text-[var(--fg)]">{expectedApy.toFixed(1)}%</span>
            <span className="mx-1">→</span>
            <span className="text-[var(--fg)]">{spec.maxApy.toFixed(2)}%</span>
          </span>
        </div>
        <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-[var(--rule)]">
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${uplift}%`, background: c.fill }}
          />
        </div>
      </div>

      {/* Footer: contribution */}
      <div className="flex items-center justify-between border-t border-[var(--rule)] pt-3">
        <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--text-accent)]">
          Contribution
        </span>
        <span className="font-mono text-sm font-bold tracking-tight text-emerald-500">
          +{contribution.toFixed(2)}%
        </span>
      </div>
    </div>
  );
}

function WeightRing({ pct, color }: { pct: number; color: string }) {
  const size = 56;
  const stroke = 4;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const offset = circumference - (pct / 100) * circumference;

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--rule)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-[stroke-dashoffset] duration-500"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="font-mono text-[11px] font-bold tracking-tight text-[var(--fg)]">
          {pct.toFixed(0)}%
        </span>
      </div>
    </div>
  );
}
