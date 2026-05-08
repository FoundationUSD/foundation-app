"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, ChevronDown, AlertTriangle } from "lucide-react";
import { useStrategies } from "@/hooks/useStrategies";
import { VaultDetail } from "@/components/VaultDetail";
import { AWY_COMPOSITION, type AwyLegSpec, type AwyLegId } from "@/lib/integrations/awy";
import type { LoopResult } from "@/lib/integrations/awy/leverage";
import type { FoundationVault } from "@/lib/vaults";

/** Shape mirrors `LeveragedAwyData` from `src/lib/integrations/awy/index.ts`.
 *  Defined locally to avoid pulling server-only `getLeveragedAwyData` into the
 *  client bundle (its dynamic imports load Solana / RPC code). Live values
 *  override the AWY-model baseline server-side, so these fields are non-null. */
interface LeveragedLegView {
  id: AwyLegId;
  asset: string;
  issuer: string;
  weightBps: number;
  underlyingApy: number;
  ltv: number;
  liquidationLtv: number;
  borrowAsset: string | null;
  borrowApy: number;
  loop: LoopResult;
  contributionApy: number;
  ltvSweep: { ltv: number; netApy: number; leverageMultiple: number; liquidationGap: number; recommended: boolean }[];
  underlyingSource: "live" | "model";
  borrowSource: "live" | "model" | "n/a";
  loopVenueLive: boolean;
}
interface LeveragedAwyView {
  legs: LeveragedLegView[];
  netApy: number;
  grossApy: number;
  borrowDrag: number;
  legsWithLiveData: number;
  totalLeveragedLegs: number;
  fetchedAt: number;
  backtest: {
    leveragedApy: number;
    holdApy: number;
    startingCapital: number;
    leveragedEndValue: number;
    holdEndValue: number;
    hoursObserved: number;
    backtestStart: string;
  };
}

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
  leverage?: LeveragedAwyView | null;
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
  const awyMeta = awy?.meta as AwyMetaView | undefined;
  const leverageMeta = awyMeta?.leverage ?? undefined;
  const liveBaseApy = awy?.apy ?? awyMeta?.blendedBaseApy ?? getSpecCompositionApy();
  const maxLeverageApy = leverageMeta?.backtest.leveragedApy ?? 21.2;
  const [selectedApy, setSelectedApy] = useState(maxLeverageApy);

  useEffect(() => {
    setSelectedApy(maxLeverageApy);
  }, [maxLeverageApy]);

  const displayedAwy = useMemo<FoundationVault | undefined>(() => {
    if (!awy) return undefined;
    return {
      ...awy,
      apy: selectedApy,
      features: [
        `${selectedApy.toFixed(2)}% selected AWY APY`,
        "Adjustable leverage on one vault",
        "4 independent risk drivers",
        "Quarterly rebalance",
      ],
      howItWorks: [
        "Deposit USDC once into the AWY vault.",
        "Choose the AWY APY setting shown above. Foundation applies the corresponding leverage policy to the same vault allocation.",
        "Foundation routes the underlying basket across ONyc, PRIME, syrupUSDC, and sUSDv, then manages leverage within the published cap.",
        "Your awyUSD balance grows through the Token-2022 InterestBearing extension at the selected AWY rate.",
        "Withdraw through the same vault. Larger withdrawals may still queue for underlying leg liquidity such as ONyc redemption.",
      ],
    };
  }, [awy, selectedApy]);

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
        <AwyComposition
          composition={awyMeta?.composition}
          liveBaseApy={liveBaseApy}
          apySource={awyMeta?.apySource}
        />
      </div>

      {leverageMeta ? (
        <div className="mb-8">
          <LeverageSection
            data={leverageMeta}
            liveBaseApy={liveBaseApy}
            selectedApy={selectedApy}
            onSelectedApyChange={setSelectedApy}
          />
        </div>
      ) : null}

      {loading && !awy ? (
        <div className="skeleton h-64 rounded-xl" />
      ) : displayedAwy ? (
        <VaultDetail vault={displayedAwy} />
      ) : (
        <p className="py-12 text-center font-mono text-sm text-[var(--text-accent)]">
          AWY vault not configured.
        </p>
      )}
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

function fmtPercent(percent: number, digits = 2) {
  return `${percent.toFixed(digits)}%`;
}

function fmtCurrency(value: number) {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  });
}

function clampApy(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function LeverageSection({
  data,
  liveBaseApy,
  selectedApy,
  onSelectedApyChange,
}: {
  data: LeveragedAwyView;
  liveBaseApy: number;
  selectedApy: number;
  onSelectedApyChange: (apy: number) => void;
}) {
  const maxApy = data.backtest.leveragedApy;
  const clampedApy = clampApy(selectedApy, liveBaseApy, maxApy);
  const rangeFill = maxApy > liveBaseApy
    ? ((clampedApy - liveBaseApy) / (maxApy - liveBaseApy)) * 100
    : 100;

  const setApy = (value: number) => {
    onSelectedApyChange(clampApy(value, liveBaseApy, maxApy));
  };

  return (
    <div className="art-frame infra-card relative overflow-hidden p-6 sm:p-8">
      <div className="art-content relative">
        <div className="mb-7 flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between sm:gap-8">
          <div className="max-w-xl">
            <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-gold-500">
              All-Weather Yield · Live Leverage
            </p>
            <h3 className="page-heading mb-3 text-xl sm:text-[1.75rem]">
              Choose the yield. <em>One AWY vault.</em>
            </h3>
            <p className="text-[13px] leading-relaxed text-[var(--text-accent)] sm:text-sm">
              Deposit once into awyUSD, then select the APY setting for that
              same vault. The base basket stays live, and leverage is applied
              behind the vault instead of creating a separate deposit product.
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-start gap-1 sm:items-end sm:text-right">
            <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-gold-500">
              Selected AWY APY
            </p>
            <span className="font-mono text-3xl font-bold tracking-[-0.03em] text-emerald-500 sm:text-[2.75rem]">
              {fmtPercent(clampedApy)}
            </span>
            <span className="font-mono text-[10px] tracking-wider text-[var(--text-accent)]">
              Synced into vault details and deposit estimate
            </span>
            <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.2em] text-emerald-600">
              Live
            </span>
          </div>
        </div>

        <div className="mb-6 grid gap-4 lg:grid-cols-[1fr_0.9fr]">
          <div className="relative overflow-hidden rounded-2xl border border-gold-500/30 bg-[var(--surface)] p-5 sm:p-6">
            <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-gold-400 via-gold-500 to-emerald-500" />
            <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-gold-500">
                  AWY APY Control
                </p>
                <p className="mt-1 text-[12px] text-[var(--text-accent)]">
                  Base yield is live. Leverage can be adjusted up to the AWY-model cap.
                </p>
              </div>
              <span className="rounded-full border border-[var(--rule)] bg-[var(--surface-strong)] px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--text-accent)]">
                Max {fmtPercent(maxApy)}
              </span>
            </div>

            <div className="mb-6 grid gap-3 sm:grid-cols-[1fr_170px] sm:items-end">
              <div>
                <label
                  htmlFor="awy-apy-range"
                  className="font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--text-accent)]"
                >
                  Selected APY
                </label>
                <input
                  id="awy-apy-range"
                  type="range"
                  min={liveBaseApy}
                  max={maxApy}
                  step={0.1}
                  value={clampedApy}
                  onChange={(event) => setApy(Number(event.target.value))}
                  className="mt-3 h-10 w-full cursor-pointer [accent-color:var(--gold)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500 focus-visible:ring-offset-2"
                  style={{
                    background: `linear-gradient(90deg, var(--gold) 0%, var(--gold) ${rangeFill}%, var(--rule) ${rangeFill}%, var(--rule) 100%)`,
                  }}
                />
              </div>
              <div>
                <label
                  htmlFor="awy-apy-input"
                  className="mb-1 block font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--text-accent)]"
                >
                  Input APY
                </label>
                <div className="flex items-center rounded-xl border border-[var(--rule)] bg-[var(--surface-strong)] px-3 py-2">
                  <input
                    id="awy-apy-input"
                    type="number"
                    min={liveBaseApy}
                    max={maxApy}
                    step={0.1}
                    value={clampedApy.toFixed(1)}
                    onChange={(event) => setApy(Number(event.target.value))}
                    className="min-w-0 flex-1 bg-transparent font-mono text-2xl font-bold text-[var(--fg)] focus-visible:outline-none"
                  />
                  <span className="font-mono text-sm text-[var(--text-accent)]">%</span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <SummaryStat
                label="Live Base"
                value={fmtPercent(liveBaseApy)}
                sub="Current basket"
                tone="neutral"
              />
              <SummaryStat
                label="Selected"
                value={fmtPercent(clampedApy)}
                sub="Deposit view"
                tone="good"
              />
              <SummaryStat
                label="Max"
                value={fmtPercent(maxApy)}
                sub="AWY-model cap"
                tone="warn"
              />
            </div>
          </div>

          <div className="rounded-2xl border border-[var(--rule)] bg-[var(--surface)] p-5 sm:p-6">
            <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-gold-500">
              Backtest Reference
            </p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
              <div className="rounded-xl border border-[var(--rule)] bg-[var(--surface-strong)] p-4">
                <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--text-accent)]">
                  Leveraged backtest
                </p>
                <p className="mt-1 font-mono text-3xl font-bold tracking-[-0.04em] text-emerald-500">
                  {fmtPercent(data.backtest.leveragedApy)}
                </p>
                <p className="mt-2 text-[12px] text-[var(--text-accent)]">
                  {fmtCurrency(data.backtest.startingCapital)} →{" "}
                  <span className="font-semibold text-[var(--fg)]">
                    {fmtCurrency(data.backtest.leveragedEndValue)}
                  </span>
                </p>
              </div>
              <div className="rounded-xl border border-[var(--rule)] bg-[var(--surface-strong)] p-4">
                <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--text-accent)]">
                  Hold backtest
                </p>
                <p className="mt-1 font-mono text-3xl font-bold tracking-[-0.04em] text-[var(--fg)]">
                  {fmtPercent(data.backtest.holdApy)}
                </p>
                <p className="mt-2 text-[12px] text-[var(--text-accent)]">
                  {data.backtest.hoursObserved.toLocaleString()} hours observed since{" "}
                  {new Date(data.backtest.backtestStart).toLocaleDateString("en-US", {
                    month: "short",
                    year: "numeric",
                    timeZone: "UTC",
                  })}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-[12px] leading-relaxed text-amber-700 dark:text-amber-400">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <span className="font-semibold">Leverage changes risk.</span> Higher
            selected APY uses more leverage inside the same AWY vault. The max
            shown here is capped at the AWY-model backtest result, not an
            uncapped per-leg LTV table.
          </div>
        </div>

        <p className="mt-4 font-mono text-[10px] tracking-wider text-[var(--text-accent)]">
          Base APY from live AWY feeds · leverage cap from FoundationUSD/AWY-model · refreshed{" "}
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
              Live Base APY
            </p>
            <span className="font-mono text-3xl font-bold tracking-[-0.03em] text-emerald-500 sm:text-[2.75rem]">
              {liveBaseApy.toFixed(2)}%
            </span>
            <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.2em] text-emerald-600">
              {apySource === "live-blend" ? "Live Blend" : "Model Fallback"}
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
                  Base APY = Σ (weight × live leg APY). The leverage control below adjusts the same AWY vault APY, not a second deposit product.
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
