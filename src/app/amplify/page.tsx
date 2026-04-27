"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { AMPLIFY_VAULTS, getLegContribution, type AmplifyVault, type AmplifyLegSpec } from "@/lib/amplify";
import { formatAPY } from "@/lib/utils";

export default function AmplifyPage() {
  const [activeFilter, setActiveFilter] = useState<"all" | "foundation" | "partner">("all");

  const flagship = AMPLIFY_VAULTS.find((v) => v.flagship);
  const visible = activeFilter === "all"
    ? AMPLIFY_VAULTS
    : AMPLIFY_VAULTS.filter((v) => v.category === activeFilter);
  const liveVaults = visible.filter((v) => v.status === "live");
  const comingSoonVaults = visible.filter((v) => v.status === "coming_soon");

  return (
    <div className="fdn-page">
      {/* Page header with cracked marble strip */}
      <div className="relative mb-6 overflow-hidden rounded-xl sm:mb-8">
        <div
          className="art-layer art-strip"
          style={{ backgroundImage: "url('/assets/art/strips/Crackedmarbletexture.png')" }}
        />
        <div className="art-content relative flex items-end justify-between gap-4 px-1 py-4 sm:px-2 sm:py-5">
          <div>
            <p className="section-label mb-1 sm:mb-2">AMPLIFY</p>
            <h1 className="page-heading text-xl sm:text-2xl">
              Leveraged <em>Strategies</em>
            </h1>
            <p className="mt-1 max-w-xl text-sm text-[var(--text-accent)]">
              Higher conviction versions of Foundation vaults. Each strategy pledges
              its receipt token as collateral on Kamino and borrows USDC to deepen
              the position, then redeposits the proceeds. Yield is amplified, and so
              is the risk profile.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <Link href="/portfolio" className="fnd-nav-link">
              Portfolio <ArrowUpRight className="h-3 w-3" />
            </Link>
          </div>
        </div>
      </div>

      {/* Flagship preview */}
      {flagship && (
        <section className="mb-10">
          <div className="mb-4 flex items-baseline justify-between">
            <h2 className="section-label">Flagship Strategy</h2>
            <span className="font-mono text-[9px] uppercase tracking-[0.25em] text-gold-500">Coming Soon</span>
          </div>
          <FlagshipCard vault={flagship} />
        </section>
      )}

      {/* Source filter */}
      <div className="mb-8 inline-flex items-center gap-1 rounded-xl border border-[var(--rule)] bg-[var(--surface-strong)] p-1 shadow-[inset_0_1px_3px_rgba(0,0,0,0.02)]">
        {(["all", "foundation", "partner"] as const).map((filter) => (
          <button
            key={filter}
            onClick={() => setActiveFilter(filter)}
            className={`cursor-pointer rounded-lg px-4 py-2 text-xs font-semibold transition-all sm:text-sm ${
              activeFilter === filter
                ? "bg-[var(--surface)] text-[var(--fg)] shadow-sm ring-1 ring-[var(--rule)]"
                : "text-[var(--muted)] hover:text-[var(--fg)] hover:bg-[var(--surface)]/50"
            }`}
          >
            {filter === "all" ? "All Vaults" : filter === "foundation" ? "Foundation" : "Partner"}
          </button>
        ))}
      </div>

      {(
        <>
          {liveVaults.length > 0 && (
            <section className="mb-10">
              <div className="mb-4 flex items-baseline justify-between">
                <h2 className="section-label">Active Vaults</h2>
                <span className="font-mono text-[10px] text-[var(--text-accent)]">
                  {liveVaults.length} live
                </span>
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {liveVaults.map((v) => (
                  <AmplifyVaultCard key={v.id} vault={v} />
                ))}
              </div>
            </section>
          )}

          {comingSoonVaults.length > 0 && (
            <section className="mb-10">
              <div className="mb-4 flex items-baseline justify-between">
                <h2 className="section-label">Coming Soon</h2>
                <span className="font-mono text-[10px] text-[var(--text-accent)]">
                  {comingSoonVaults.length} queued
                </span>
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {comingSoonVaults.map((v) => (
                  <AmplifyVaultCard key={v.id} vault={v} />
                ))}
              </div>
            </section>
          )}

          {liveVaults.length === 0 && comingSoonVaults.length === 0 && (
            <p className="py-12 text-center font-mono text-sm text-[var(--text-accent)]">No vaults in this category yet</p>
          )}
        </>
      )}

      {/* Risk explainer */}
      <section className="mt-4">
        <div className="rounded-xl border border-[var(--rule)] bg-[var(--surface)] p-5">
          <h3 className="mb-3 font-mono text-[10px] uppercase tracking-[0.2em] text-gold-500">
            How looping works
          </h3>
          <p className="text-[13px] leading-relaxed text-[var(--text-accent)]">
            A levered position deposits its receipt asset onto Kamino as collateral,
            borrows USDC against it, and re-enters the same leg with the borrowed
            proceeds. Two or three iterations multiply yield on a thinner equity base.
            Foundation maintains a target health factor on every position and
            auto-deleverages when collateral prices, borrow rates, or oracle drift
            push the buffer below tolerance.
          </p>
          <p className="mt-3 text-[13px] leading-relaxed text-[var(--text-accent)]">
            Looping is suited for users who can hold through volatility and accept
            the possibility of partial liquidation in extreme regimes. The base AWY
            and Oro vaults remain available for unlevered exposure.
          </p>
        </div>
      </section>
    </div>
  );
}

/* ============================================================
   FlagshipCard: factsheet-style hero for the flagship Amplify product
   ============================================================ */

function FlagshipCard({ vault }: { vault: AmplifyVault }) {
  return (
    <div className="art-frame infra-card relative overflow-hidden p-6 sm:p-8">
      {/* Background art: Atlas bearing the celestial sphere — a literal
          metaphor for amplified, levered exposure */}
      <div
        className="art-layer art-thumb"
        style={{ backgroundImage: "url('/assets/art/atlasForAWYamplified.png')" }}
      />
      <div className="art-noise" />

      <div className="art-content relative">
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
          Receipt: <span className="font-mono font-semibold text-[var(--fg)]">{vault.receiptToken}</span>
          {", "}Token-2022 with InterestBearing extension. Auto-deleverage on stress.
        </p>
        <span className="font-mono text-[9px] uppercase tracking-[0.25em] text-[var(--text-accent)]">
          Quarterly rebalance · Health factor 1.6 target
        </span>
      </div>
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

/* ============================================================
   AmplifyVaultCard: matches the Invest grid VaultCard pattern
   ============================================================ */

/**
 * Classical art piece paired with each Amplify product. Mirrors the PROTOCOL_ART
 * pattern on the Invest page so the design system reads as one piece.
 *   amp-awy → Atlas (already used on the flagship; reused here as the small thumb)
 *   amp-oro → Tyche (goddess of fortune with cornucopia, paired with leveraged gold)
 */
const AMPLIFY_ART: Record<string, string> = {
  "amp-awy": "/assets/art/atlasForAWYamplified.png",
  "amp-oro": "/assets/art/Tycheforamplify.png",
};

function AmplifyVaultCard({ vault }: { vault: AmplifyVault }) {
  const isLive = vault.status === "live";
  const artSrc = AMPLIFY_ART[vault.id];

  return (
    <div
      className={`strategy-card overflow-hidden border border-[var(--rule)] bg-[var(--surface-strong)] rounded-xl divide-y divide-[var(--rule)] transition-all ${
        isLive ? "cursor-pointer hover:-translate-y-0.5" : "cursor-not-allowed opacity-90"
      }`}
      data-glow
    >
      {/* Header — classical art behind the protocol logo + vault name */}
      <div className="relative overflow-hidden">
        {artSrc && (
          <>
            <div
              className="art-layer art-thumb"
              style={{ backgroundImage: `url('${artSrc}')` }}
            />
            <div className="art-noise" />
          </>
        )}
        <div className="art-content relative flex items-center gap-3 px-5 py-4">
          <Image
            src={vault.logoSrc}
            alt={vault.curator}
            width={36}
            height={36}
            className="h-9 w-9 flex-shrink-0 rounded-lg object-contain"
          />
          <span className="truncate font-mono text-xl font-bold tracking-[-0.02em] text-[var(--fg)]">
            {vault.name}
          </span>
          {!isLive && (
            <span className="ml-auto rounded-full border border-[var(--rule)] bg-[var(--surface)] px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider text-gold-500">
              Soon
            </span>
          )}
        </div>
      </div>

      {/* Description */}
      <div className="px-5 py-4">
        <p className="line-clamp-2 text-sm text-[var(--muted)] leading-relaxed">
          {vault.shortDescription}
        </p>
      </div>

      {/* Data grid */}
      <div className="divide-y divide-[var(--rule)]">
        <div className="grid grid-cols-2 divide-x divide-[var(--rule)]">
          <div className="flex flex-col items-start px-5 py-4">
            <span className="section-label mb-1.5 font-mono text-[10px] font-semibold tracking-[0.15em] text-[var(--gold)]">TARGET NET APY</span>
            <span className="font-mono text-3xl font-bold tracking-[-0.03em] text-emerald-500">
              {formatAPY(vault.netApy)}
            </span>
          </div>
          <div className="flex flex-col items-start px-5 py-4">
            <span className="section-label mb-1.5 font-mono text-[10px] font-semibold tracking-[0.15em] text-[var(--gold)]">RISK TIER</span>
            <span className="font-mono text-[1.4rem] font-bold tracking-wide capitalize text-[#334155] dark:text-[var(--fg)]">
              {vault.riskTier}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 divide-x divide-[var(--rule)]">
          <div className="flex flex-col items-start px-5 py-4">
            <span className="section-label mb-1.5 font-mono text-[10px] font-semibold tracking-[0.15em] text-[var(--gold)]">CURATOR</span>
            <span className="font-mono text-sm font-bold text-[#334155] dark:text-[var(--fg)]">
              {vault.curator}
            </span>
          </div>
          <div className="flex flex-col items-start px-5 py-4">
            <span className="section-label mb-1.5 font-mono text-[10px] font-semibold tracking-[0.15em] text-[var(--gold)]">UNDERLYING</span>
            <span className="font-mono text-xs font-bold leading-snug tracking-wide text-[#334155] dark:text-[var(--fg)] uppercase line-clamp-2">
              {vault.underlying}
            </span>
          </div>
        </div>
      </div>

      {/* CTA */}
      <div className="flex items-center justify-between px-5 py-4">
        <span className="text-xs font-mono tracking-wide text-[var(--muted)]">USDC</span>
        <span className={`text-xs font-mono font-bold tracking-[0.1em] uppercase transition-colors ${
          isLive ? "text-[#0f172a] dark:text-[var(--fg)]" : "text-[var(--muted)]"
        }`}>
          {isLive ? "View Details →" : "Coming Soon"}
        </span>
      </div>
    </div>
  );
}

