"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { AMPLIFY_VAULTS, getLegContribution, type AmplifyVault, type AmplifyLegSpec } from "@/lib/amplify";
import { formatAPY } from "@/lib/utils";

export default function AmplifyPage() {
  return (
    <div className="fdn-page">
      {/* Page header */}
      <div className="mb-6 flex items-end justify-between sm:mb-8">
        <div>
          <p className="section-label mb-1 sm:mb-2">AMPLIFY</p>
          <h1 className="page-heading text-xl sm:text-2xl">
            Leveraged <em>Strategies</em>
          </h1>
          <p className="mt-1 max-w-xl text-sm text-[var(--text-accent)]">
            Higher conviction versions of Foundation vaults. Each leg pledges its
            receipt token as collateral on Kamino and borrows additional USDC to
            deepen the position, then redeposits the proceeds into the same leg.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/portfolio" className="fnd-nav-link">
            Portfolio <ArrowUpRight className="h-3 w-3" />
          </Link>
        </div>
      </div>

      {/* Flagship */}
      <section className="mb-10">
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="section-label">Flagship Strategy</h2>
          <span className="font-mono text-[9px] uppercase tracking-[0.25em] text-gold-500">Coming Soon</span>
        </div>
        {AMPLIFY_VAULTS.map((v) => (
          <AmplifyCard key={v.id} vault={v} />
        ))}
      </section>

      {/* Risk disclosure */}
      <section className="mb-10">
        <div className="rounded-xl border border-[var(--rule)] bg-[var(--surface)] p-5">
          <h3 className="mb-3 font-mono text-[10px] uppercase tracking-[0.2em] text-gold-500">
            How looping works
          </h3>
          <p className="text-[13px] leading-relaxed text-[var(--text-accent)]">
            A levered leg deposits its receipt (PRIME, ONyc, syrupUSDC) onto Kamino as
            collateral, borrows USDC against it, and re-enters the same leg with the
            borrowed proceeds. Two or three iterations multiply yield on a thinner
            equity base. Foundation maintains a target health factor on every position
            and auto-deleverages when collateral prices, borrow rates, or oracle drift
            push the buffer below tolerance.
          </p>
          <p className="mt-3 text-[13px] leading-relaxed text-[var(--text-accent)]">
            The basis leg, USDH from Solomon, is never looped. Basis trades already
            embed perpetual futures leverage, so layering an additional borrow on top
            would compound liquidation risk to a level we will not underwrite.
          </p>
        </div>
      </section>
    </div>
  );
}

/* ============================================================
   AmplifyCard: factsheet-style flagship card
   ============================================================ */

function AmplifyCard({ vault }: { vault: AmplifyVault }) {
  return (
    <div className="infra-card overflow-hidden p-6 sm:p-8">
      {/* Header */}
      <div className="mb-7 flex flex-col gap-5 border-b border-[var(--rule)] pb-7 sm:flex-row sm:items-start sm:justify-between sm:gap-8">
        <div className="flex max-w-2xl items-start gap-4">
          <Image
            src={vault.logoSrc}
            alt={vault.name}
            width={56}
            height={56}
            className="h-14 w-14 shrink-0 rounded-xl object-contain"
          />
          <div>
            <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-gold-500">
              {vault.strategy}
            </p>
            <h3 className="page-heading mb-3 text-xl sm:text-[1.6rem]">
              All-Weather Yield, <em>amplified</em>
            </h3>
            <p className="text-[13px] leading-relaxed text-[var(--text-accent)] sm:text-sm">
              {vault.description}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 flex-row gap-8 sm:flex-col sm:items-end sm:gap-1 sm:text-right">
          <div>
            <p className="mb-1 font-mono text-[9px] uppercase tracking-[0.2em] text-gold-500">
              Target Net APY
            </p>
            <span className="font-mono text-3xl font-bold tracking-[-0.03em] text-emerald-500 sm:text-[2.5rem]">
              {formatAPY(vault.netApy)}
            </span>
          </div>
          <div className="sm:mt-2">
            <span className="rounded-full border border-[var(--rule)] bg-[var(--surface)] px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.2em] text-gold-500">
              Coming Soon
            </span>
          </div>
        </div>
      </div>

      {/* Composition */}
      <div className="mb-1 flex items-baseline justify-between">
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--text-accent)]">
          Composition
        </p>
        <p className="font-mono text-[9px] uppercase tracking-[0.15em] text-[var(--text-accent)]">
          Net = Σ (weight × expected APY)
        </p>
      </div>

      <div className="grid grid-cols-1 divide-y divide-[var(--rule)] sm:grid-cols-2 sm:divide-y-0 md:grid-cols-4 md:divide-x">
        {vault.composition.map((leg, i) => (
          <LegPanel
            key={leg.id}
            leg={leg}
            verticalDivider={i === 1}
            horizontalDivider={i >= 2}
          />
        ))}
      </div>

      {/* Footer */}
      <div className="mt-7 flex flex-col gap-3 border-t border-[var(--rule)] pt-5 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[11px] leading-relaxed text-[var(--text-accent)]">
          Receipt: <span className="font-mono font-semibold text-[var(--fg)]">{vault.receiptToken}</span>{", "}
          Token-2022 with InterestBearing extension. Auto-deleverage on stress.
        </p>
        <span className="font-mono text-[9px] uppercase tracking-[0.25em] text-[var(--text-accent)]">
          Quarterly rebalance · Health factor 1.6 target
        </span>
      </div>
    </div>
  );
}

function LegPanel({
  leg,
  verticalDivider,
  horizontalDivider,
}: {
  leg: AmplifyLegSpec;
  verticalDivider: boolean;
  horizontalDivider: boolean;
}) {
  const contribution = getLegContribution(leg);
  return (
    <div
      className={`px-0 py-5 sm:px-5 ${verticalDivider ? "sm:border-l sm:border-[var(--rule)] md:border-0" : ""} ${
        horizontalDivider ? "sm:border-t sm:border-[var(--rule)] md:border-0" : ""
      }`}
    >
      {/* Top row: asset + weight */}
      <div className="mb-1 flex items-baseline justify-between">
        <span className="font-mono text-sm font-bold tracking-tight text-[var(--fg)]">
          {leg.asset}
        </span>
        <span className="font-mono text-[10px] tracking-wider text-gold-500">
          {(leg.weightBps / 100).toFixed(0)}%
        </span>
      </div>

      <p className="mb-2.5 font-mono text-[10px] uppercase tracking-wide text-[var(--text-accent)]">
        {leg.issuer}
      </p>

      {/* Leverage badge */}
      <div className="mb-3">
        {leg.leveraged ? (
          <span className="inline-flex items-center gap-1 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-wider text-emerald-600">
            Looped
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-md border border-[var(--rule)] bg-[var(--surface-strong)] px-2 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-wider text-[var(--text-accent)]">
            Unlevered
          </span>
        )}
      </div>

      <p className="mb-4 text-[11px] leading-snug text-[var(--text-accent)]">
        {leg.description}
      </p>

      {/* Numbers */}
      <div className="space-y-1.5 border-t border-[var(--rule)] pt-3">
        <div className="flex items-center justify-between">
          <span className="font-mono text-[9px] uppercase tracking-wider text-[var(--text-accent)]">
            Expected APY
          </span>
          <span className="font-mono text-xs font-semibold text-[var(--fg)]">
            {formatAPY(leg.expectedApy)}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="font-mono text-[9px] uppercase tracking-wider text-[var(--text-accent)]">
            Max APY
          </span>
          <span className="font-mono text-[11px] text-[var(--text-accent)]">
            {formatAPY(leg.maxApy)}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="font-mono text-[9px] uppercase tracking-wider text-[var(--text-accent)]">
            Contribution
          </span>
          <span className="font-mono text-[11px] font-semibold text-emerald-500">
            {contribution.toFixed(2)}%
          </span>
        </div>
      </div>
    </div>
  );
}
