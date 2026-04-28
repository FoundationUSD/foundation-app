"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useWallet } from "@solana/wallet-adapter-react";
import { Sparkles, Crown, Award, Anchor, ChevronRight, ChevronDown } from "lucide-react";
import { FOUNDATION_VAULTS } from "@/lib/vaults";
import { STANDING_TIERS, type StandingResult, type StandingTier } from "@/lib/standing";
import { formatNumber } from "@/lib/utils";

const TIER_ICONS: Record<StandingTier, React.ReactNode> = {
  Apprentice: <Anchor className="h-4 w-4" />,
  Tenured:    <Award className="h-4 w-4" />,
  Custodian:  <Sparkles className="h-4 w-4" />,
  Patron:     <Sparkles className="h-4 w-4" />,
  Founder:    <Crown className="h-4 w-4" />,
};

const TIER_ACCENT: Record<StandingTier, string> = {
  Apprentice: "from-slate-500/20 to-slate-500/5 border-slate-400/40",
  Tenured:    "from-emerald-500/20 to-emerald-500/5 border-emerald-400/40",
  Custodian:  "from-blue-500/20 to-blue-500/5 border-blue-400/40",
  Patron:     "from-purple-500/20 to-purple-500/5 border-purple-400/40",
  Founder:    "from-amber-500/30 to-amber-500/5 border-amber-400/50",
};

export function StandingDashboard() {
  const wallet = useWallet();
  const [standing, setStanding] = useState<StandingResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [charterOpen, setCharterOpen] = useState(false);

  useEffect(() => {
    if (!wallet.publicKey) {
      setStanding(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetch(`/api/user/standing?wallet=${wallet.publicKey.toBase58()}`)
      .then((r) => r.json())
      .then((j) => { if (j.success && !cancelled) setStanding(j.data); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [wallet.publicKey]);

  if (!wallet.connected) {
    return (
      <div className="rounded-xl border border-[var(--rule)] bg-[var(--surface)] p-8 text-center">
        <p className="text-sm text-[var(--text-accent)]">Connect a wallet to see your Foundation Standing.</p>
      </div>
    );
  }

  if (loading || !standing) {
    return <div className="skeleton h-64 rounded-xl" />;
  }

  const { tm, baseTm, multipliers, effectiveMultiplier, currentTier, nextTier, tmToNextTier, progressPct, breakdown, vintageAt } = standing;
  const tierIdx = STANDING_TIERS.findIndex((t) => t.tier === currentTier.tier);

  if (tm === 0 && breakdown.length === 0) {
    return (
      <div className="rounded-xl border border-[var(--rule)] bg-[var(--surface)] p-12 text-center">
        <p className="mb-2 font-serif text-base font-light text-[var(--muted)]">No tenure earned yet</p>
        <p className="mb-4 text-xs text-[var(--text-accent)]">
          Tenure starts accruing the moment you deposit. $1 held for 1 month = 1 Tenure-Month.
        </p>
        <Link href="/" className="font-mono text-xs text-gold-500 hover:text-gold-400">
          Make your first deposit →
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Hero card */}
      <div className={`relative overflow-hidden rounded-2xl border bg-gradient-to-br p-6 ${TIER_ACCENT[currentTier.tier]}`}>
        <div className="relative z-10">
          <div className="mb-1 flex items-center gap-2">
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--text-accent)]">Your Standing</span>
          </div>
          <div className="flex items-end justify-between gap-4">
            <div>
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--rule)] bg-[var(--surface)] text-[var(--fg)]">
                  {TIER_ICONS[currentTier.tier]}
                </span>
                <h2 className="font-serif text-3xl font-light text-[var(--fg)]">{currentTier.tier}</h2>
              </div>
              <p className="mt-2 max-w-md text-xs leading-relaxed text-[var(--text-accent)]">
                {currentTier.blurb}
              </p>
            </div>
            <div className="text-right">
              <div className="font-mono text-[10px] uppercase tracking-wider text-[var(--text-accent)]">Tenure</div>
              <div className="font-serif text-3xl font-light text-[var(--fg)]">{tm.toFixed(1)}</div>
              <div className="font-mono text-[10px] text-[var(--muted)]">Tenure-Months</div>
            </div>
          </div>

          {/* Progress to next tier */}
          {nextTier && (
            <div className="mt-5 border-t border-[var(--rule)] pt-3">
              <div className="mb-1.5 flex items-center justify-between text-[11px]">
                <span className="text-[var(--text-accent)]">
                  Next: <span className="font-medium text-[var(--fg)]">{nextTier.tier}</span>
                </span>
                <span className="font-mono text-[var(--text-accent)]">
                  {tmToNextTier.toFixed(1)} TM to go · {(progressPct * 100).toFixed(0)}%
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--rule)]">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-gold-500 to-gold-400 transition-all"
                  style={{ width: `${progressPct * 100}%` }}
                />
              </div>
            </div>
          )}

          {/* Vintage */}
          {vintageAt && (
            <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-[var(--rule)] bg-[var(--surface)]/60 px-3 py-1 backdrop-blur">
              <span className="text-[10px] uppercase tracking-wider text-[var(--text-accent)]">Vintage</span>
              <span className="font-mono text-[10px] text-[var(--fg)]">
                {new Date(vintageAt).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* What is this? */}
      <div className="rounded-xl border border-[var(--rule)] bg-[var(--surface)] p-4 text-[11px] leading-relaxed text-[var(--text-accent)]">
        <p>
          <span className="font-medium text-[var(--fg)]">Standing</span> is Foundation's recognition system.
          It is <span className="italic">not</span> a token, an airdrop, or a points scheme. It cannot be sold,
          transferred, or wrapped. Its only value is the recognition and benefits it unlocks within Foundation —
          things like reduced fees, early access, and direct lines to the desk. We track only one number:
          <span className="font-medium text-[var(--fg)]"> Tenure-Months </span>
          (US dollars × months held). That's the math.
        </p>
      </div>

      {/* Multipliers */}
      <div className="rounded-xl border border-[var(--rule)] bg-[var(--surface)] p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-[var(--fg)]">Active multipliers</h3>
          <span className="font-mono text-[11px] text-[var(--text-accent)]">
            base {baseTm.toFixed(1)} × {effectiveMultiplier.toFixed(2)} = {tm.toFixed(1)} TM
          </span>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {multipliers.map((m) => (
            <div
              key={m.id}
              className={`rounded-lg border p-3 ${
                m.active ? "border-emerald-500/30 bg-emerald-500/5" : "border-[var(--rule)] bg-[var(--surface-strong)] opacity-70"
              }`}
            >
              <div className="mb-1 flex items-center justify-between">
                <span className="text-xs font-medium text-[var(--fg)]">{m.label}</span>
                <span className={`font-mono text-[11px] ${m.active ? "text-emerald-600 dark:text-emerald-400" : "text-[var(--muted)]"}`}>
                  ×{m.factor.toFixed(1)}{m.active ? "" : " (inactive)"}
                </span>
              </div>
              <p className="text-[10px] leading-snug text-[var(--text-accent)]">{m.reason}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Per-vault contributions */}
      {breakdown.length > 0 && (
        <div className="rounded-xl border border-[var(--rule)] bg-[var(--surface)] p-4">
          <h3 className="mb-3 text-sm font-semibold text-[var(--fg)]">Tenure by vault</h3>
          <div className="space-y-2">
            {breakdown.map((b) => {
              const meta = FOUNDATION_VAULTS.find((v) => v.id === b.vaultId);
              return (
                <div key={b.vaultId} className="flex items-center justify-between border-b border-[var(--rule)] pb-2 last:border-0 last:pb-0">
                  <div>
                    <div className="text-xs font-medium text-[var(--fg)]">{meta?.name || b.vaultId}</div>
                    <div className="font-mono text-[10px] text-[var(--muted)]">
                      ${formatNumber(b.netUsdc)} held
                      {b.vintageAt && (
                        <> · since {new Date(b.vintageAt).toLocaleDateString(undefined, { year: "numeric", month: "short" })}</>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono text-sm font-semibold text-[var(--fg)]">{b.tmContribution.toFixed(1)} TM</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Tier ladder — collapsed by default */}
      <div className="rounded-xl border border-[var(--rule)] bg-[var(--surface)]">
        <button
          type="button"
          onClick={() => setCharterOpen((v) => !v)}
          aria-expanded={charterOpen}
          className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--surface-strong)]"
        >
          <div className="flex flex-col items-start">
            <span className="text-sm font-semibold text-[var(--fg)]">The Charter</span>
            <span className="font-mono text-[10px] text-[var(--text-accent)]">
              {charterOpen ? "Hide tiers and benefits" : "Show all tiers and what unlocks at each"}
            </span>
          </div>
          <ChevronDown
            className={`h-4 w-4 shrink-0 text-[var(--text-accent)] transition-transform ${
              charterOpen ? "rotate-180" : ""
            }`}
          />
        </button>
        <div
          className={`grid transition-all duration-300 ease-out ${
            charterOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
          }`}
        >
          <div className="overflow-hidden">
            <div className="space-y-2 border-t border-[var(--rule)] p-4">
          {STANDING_TIERS.map((t, i) => {
            const isCurrent = i === tierIdx;
            const isPast = i < tierIdx;
            return (
              <div
                key={t.tier}
                className={`relative rounded-lg border p-3 transition-all ${
                  isCurrent
                    ? "border-gold-500/40 bg-gold-500/5"
                    : isPast
                    ? "border-[var(--rule)] bg-[var(--surface-strong)] opacity-80"
                    : "border-[var(--rule)] bg-[var(--surface-strong)]"
                }`}
              >
                <div className="mb-2 flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full border border-[var(--rule)] bg-[var(--surface)] text-[var(--fg)]">
                      {TIER_ICONS[t.tier]}
                    </span>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-[var(--fg)]">{t.tier}</span>
                        {isCurrent && (
                          <span className="rounded-full bg-gold-500/20 px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider text-gold-600 dark:text-gold-400">
                            you are here
                          </span>
                        )}
                        {isPast && (
                          <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                            unlocked
                          </span>
                        )}
                      </div>
                      <span className="font-mono text-[10px] text-[var(--text-accent)]">
                        {t.minTm === 0 ? "Default" : `${t.minTm}+ TM`}
                      </span>
                    </div>
                  </div>
                </div>
                <p className="mb-2 text-[11px] leading-relaxed text-[var(--text-accent)]">{t.blurb}</p>
                <ul className="space-y-1">
                  {t.benefits.map((b, j) => (
                    <li key={j} className="flex items-start gap-1.5 text-[11px] text-[var(--text-accent)]">
                      <ChevronRight className="mt-0.5 h-3 w-3 shrink-0 text-gold-500" />
                      {b}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
