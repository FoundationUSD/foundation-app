"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, ChevronDown } from "lucide-react";
import { useStrategies } from "@/hooks/useStrategies";
import { VaultDetail } from "@/components/VaultDetail";
import { AWY_COMPOSITION, type AwyLegSpec, type AwyLegId } from "@/lib/integrations/awy";
import { FOUNDATION_VAULTS } from "@/lib/vaults";

interface AwyCompositionLegView {
  id: AwyLegId;
  asset: string;
  issuer: string;
  weightBps: number;
  specApy: number;
  liveApy: number;
  riskDriver: string;
  source: string;
  navUsd: number | null;
}

interface AwyMetaView {
  apySource?: string;
  composition?: AwyCompositionLegView[];
  blendedBaseApy?: number;
  specBlendedApy?: number;
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
  const awy = strategies.find((s) => s.id === "fdn-awy");
  const awyMeta = awy?.meta as AwyMetaView | undefined;
  const liveBaseApy = awy?.apy ?? awyMeta?.blendedBaseApy ?? getSpecCompositionApy();

  // Single AWY product (unlevered). Levered tiers exist on-chain but are
  // hidden from the UI for now — keeps the deposit flow simple.
  const baseVault = FOUNDATION_VAULTS.find((v) => v.id === "fdn-awy");
  const liveBase = strategies.find((s) => s.id === "fdn-awy");
  const displayedAwy = liveBase ?? baseVault;

  return (
    <div className="fdn-page max-w-[1080px]">
      <div className="relative mb-3 overflow-hidden rounded-xl">
        <div
          className="art-layer art-strip"
          style={{ backgroundImage: "url('/assets/art/strips/Friezemeanderpattern.png')" }}
        />
        <div className="art-content relative flex items-center justify-between gap-4 px-1 py-3 sm:px-2">
          <div>
            <p className="section-label mb-0.5">FOUNDATION</p>
            <h1 className="page-heading text-lg sm:text-xl">
              All-Weather <em>Yield</em>
            </h1>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <Link href="/portfolio" className="fnd-nav-link">
              Portfolio <ArrowUpRight className="h-3 w-3" />
            </Link>
          </div>
        </div>
      </div>

      {loading && !awy ? (
        <div className="skeleton h-64 rounded-xl" />
      ) : displayedAwy ? (
        <div className="mb-6">
          <VaultDetail vault={displayedAwy} />
        </div>
      ) : (
        <p className="py-12 text-center font-mono text-sm text-[var(--text-accent)]">
          AWY vault not configured.
        </p>
      )}

      {/* Composition + breakdown — moved below the deposit form. Collapsed by
          default; the depositor opens it only if they want the math. */}
      <AwyComposition
        composition={awyMeta?.composition}
        liveBaseApy={liveBaseApy}
        apySource={awyMeta?.apySource}
      />
    </div>
  );
}

const SPEC_COMPOSITION_APY = AWY_COMPOSITION.reduce(
  (sum, leg) => sum + (leg.baseApy * leg.weightBps) / 10_000,
  0,
);

function getSpecCompositionApy() {
  return Math.round(SPEC_COMPOSITION_APY * 100) / 100;
}

/* ============================================================
   AWY composition — visual basket breakdown
   ============================================================ */

function AwyComposition({
  composition,
  liveBaseApy,
  apySource,
}: {
  composition?: AwyCompositionLegView[];
  liveBaseApy: number;
  apySource?: string;
}) {
  const [open, setOpen] = useState(false);
  const liveById = new Map((composition ?? []).map((leg) => [leg.id, leg]));

  // Sort by allocation descending for visual hierarchy.
  const rows = [...AWY_COMPOSITION]
    .map((spec) => {
      const live = liveById.get(spec.id);
      const displaySpec = live
        ? {
            ...spec,
            asset: live.asset,
            issuer: live.issuer,
            weightBps: live.weightBps,
            riskDriver: live.riskDriver,
          }
        : spec;
      const expectedApy = live?.liveApy ?? spec.baseApy;
      return {
        spec: displaySpec,
        expectedApy,
        source: live?.source ?? "model",
        contribution: (expectedApy * displaySpec.weightBps) / 10_000,
      };
    })
    .sort((a, b) => b.spec.weightBps - a.spec.weightBps);

  const netApy = rows.reduce((s, r) => s + r.contribution, 0);
  const maxContribution = Math.max(...rows.map((r) => r.contribution));

  return (
    <div className="art-frame infra-card relative overflow-hidden p-4 sm:p-5">
      <div
        className="art-layer art-thumb"
        style={{ backgroundImage: "url('/assets/art/StormoftheFourWinds.png')" }}
      />
      <div className="art-noise" />

      <div className="art-content relative">
        {/* Header — compact */}
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
          <div className="max-w-xl">
            <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.2em] text-gold-500">
              All-Weather Yield · AWY
            </p>
            <h3 className="page-heading mb-1.5 text-lg sm:text-xl">
              Four yield engines. <em>One deposit.</em>
            </h3>
            <p className="text-[12px] leading-relaxed text-[var(--text-accent)]">
              ONyc is minted at NAV via OnRe; PRIME and syrupUSDC supply Kamino;
              USDv routes through Solomon&apos;s basis trade.
            </p>
          </div>
          <div className="flex shrink-0 items-baseline gap-3 sm:flex-col sm:items-end sm:gap-0.5 sm:text-right">
            <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-gold-500">
              Live Base APY
            </p>
            <span className="font-mono text-2xl font-bold tracking-[-0.03em] text-emerald-500">
              {liveBaseApy.toFixed(2)}%
            </span>
            <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.2em] text-emerald-600">
              {apySource === "live-blend" ? "Live" : "Model"}
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
            className="group flex w-full items-center justify-between gap-3 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500 focus-visible:ring-offset-2"
          >
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-gold-500">
                {open ? "Hide" : "View"} composition breakdown
              </p>
              <p className="mt-0.5 text-[11px] text-[var(--text-accent)]">
                Per-leg weights, live base APY, risk drivers, and contribution math.
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
                          width: `${netApy > 0 ? (r.contribution / netApy) * 100 : 0}%`,
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
                      source={r.source}
                      isLargest={r.contribution === maxContribution}
                    />
                  ))}
                </div>

                <p className="mt-5 font-mono text-[10px] tracking-wider text-[var(--text-accent)]">
                  Base APY = Σ (weight × live leg APY).
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
  source,
  isLargest,
}: {
  spec: AwyLegSpec;
  expectedApy: number;
  contribution: number;
  source: string;
  isLargest: boolean;
}) {
  const c = LEG_COLORS[spec.id];
  const weightPct = spec.weightBps / 100;

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
              <span className="inline-flex items-center gap-1 rounded-md border border-[var(--rule)] bg-[var(--surface-strong)] px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-wider text-[var(--text-accent)]">
                Base leg
              </span>
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
        {spec.issuer} exposure inside the base AWY basket. Live source: {source}.
      </p>

      {/* Footer: contribution */}
      <div className="flex items-center justify-between border-t border-[var(--rule)] pt-3">
        <div>
          <span className="block font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--text-accent)]">
            Live APY
          </span>
          <span className="font-mono text-sm font-bold tracking-tight text-[var(--fg)]">
            {expectedApy.toFixed(2)}%
          </span>
        </div>
        <div className="text-right">
          <span className="block font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--text-accent)]">
            Contribution
          </span>
          <span className="font-mono text-sm font-bold tracking-tight text-emerald-500">
            +{contribution.toFixed(2)}%
          </span>
        </div>
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
