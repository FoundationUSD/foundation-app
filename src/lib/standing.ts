/**
 * Standing — Foundation's loyalty / recognition system.
 *
 * Deliberately *not* a points scheme or yet-another-token.
 *
 * The single underlying metric is **Tenure**, measured in **Tenure-Months (TM)**:
 *   TM = Σ ( $USD held in Foundation × months held )
 *
 * Multipliers reward behaviors aligned with Foundation's mission:
 *   - Holding the AWY (foundation-built) basket: 1.5×
 *   - Diversifying across 3+ vaults: 1.2×
 * Multipliers stack multiplicatively.
 *
 * Tenure earns you **Standing** — a tier in the Foundation Charter. Each tier
 * unlocks real, non-token benefits (custom email cadence, early access to new
 * vaults, reduced protocol fees, founder-tier touchpoints).
 *
 * Non-goals:
 *   - No emissions, no airdrops, no token claim. Standing is not an asset.
 *   - No private info trading, no off-chain points.
 *   - Cannot be transferred, sold, or wrapped.
 */

export type StandingTier = "Apprentice" | "Tenured" | "Custodian" | "Patron" | "Founder";

export interface StandingTierSpec {
  tier: StandingTier;
  minTm: number;
  blurb: string;
  benefits: string[];
}

export const STANDING_TIERS: StandingTierSpec[] = [
  {
    tier: "Apprentice",
    minTm: 0,
    blurb: "Just stepping into the Foundation. Welcome.",
    benefits: [
      "Full access to all live vaults",
      "Real-time deposit and withdrawal notifications",
    ],
  },
  {
    tier: "Tenured",
    minTm: 1,
    blurb: "You've held funds in Foundation through at least one tenure-month.",
    benefits: [
      "Email digests on weekly cadence",
      "Standing badge surfaced on your portfolio",
    ],
  },
  {
    tier: "Custodian",
    minTm: 10,
    blurb: "A serious participant. You've earned a seat near the table.",
    benefits: [
      "Early access (48h) to new vault launches",
      "Direct email line to the Foundation desk for vault questions",
      "Custom alert thresholds (set your own APY-change cutoff)",
    ],
  },
  {
    tier: "Patron",
    minTm: 100,
    blurb: "You're materially part of why Foundation works. Treated accordingly.",
    benefits: [
      "Reduced protocol fees on all deposits and withdrawals",
      "Quarterly portfolio review with a Foundation operator",
      "Whitelist priority on capacity-constrained strategies",
    ],
  },
  {
    tier: "Founder",
    minTm: 1_000,
    blurb: "Founder-class standing. You're listed in the Charter.",
    benefits: [
      "Personal call with the Foundation team on request",
      "Optional listing in the Charter page (transparency.fdnusd.com)",
      "Co-design input on new vault strategies",
      "Lifetime fee waiver on managed vaults",
    ],
  },
];

export interface StandingMultiplier {
  id: string;
  label: string;
  factor: number;
  active: boolean;
  reason: string;
}

export interface StandingBreakdown {
  vaultId: string;
  vaultName: string;
  tmContribution: number;
  /** First deposit in this vault — the "vintage" for the position. */
  vintageAt: string | null;
  /** Net USDC currently held in this vault (for context). */
  netUsdc: number;
}

export interface StandingResult {
  /** Total tenure-months earned, after multipliers. */
  tm: number;
  /** Raw TM before multipliers (for transparency). */
  baseTm: number;
  /** Currently active multipliers. */
  multipliers: StandingMultiplier[];
  /** Effective multiplier (product of active multipliers). */
  effectiveMultiplier: number;
  /** Current tier from STANDING_TIERS. */
  currentTier: StandingTierSpec;
  /** Next tier (null if at top). */
  nextTier: StandingTierSpec | null;
  /** TM remaining until next tier (0 if at top). */
  tmToNextTier: number;
  /** Progress to next tier in [0..1]. */
  progressPct: number;
  /** Per-vault TM breakdown (post-multiplier). */
  breakdown: StandingBreakdown[];
  /** First deposit timestamp across all vaults — your vintage with Foundation. */
  vintageAt: string | null;
}

const MS_PER_MONTH = 30.4375 * 24 * 60 * 60 * 1000;

export interface DepositRow {
  vault_id: string;
  usdc_amount: number;
  created_at: string;
}

export interface WithdrawalRow {
  vault_id: string;
  usdc_returned: number;
  created_at: string;
}

/**
 * Compute time-weighted Tenure-Months from deposit/withdrawal timeseries.
 *
 * For each vault, walks the chronological event stream, tracking running
 * USDC balance. The contribution to TM from segment [t_i, t_{i+1}] is
 * (balance_at_t_i / 1e6) × ((t_{i+1} - t_i) / MS_PER_MONTH).
 */
export function computeStanding(
  deposits: DepositRow[],
  withdrawals: WithdrawalRow[],
  now: Date = new Date(),
): StandingResult {
  type Event = { ts: number; vaultId: string; deltaLamports: number };
  const events: Event[] = [];
  for (const d of deposits) {
    events.push({ ts: new Date(d.created_at).getTime(), vaultId: d.vault_id, deltaLamports: Number(d.usdc_amount) });
  }
  for (const w of withdrawals) {
    events.push({ ts: new Date(w.created_at).getTime(), vaultId: w.vault_id, deltaLamports: -Number(w.usdc_returned) });
  }
  events.sort((a, b) => a.ts - b.ts);

  const tmByVault: Record<string, number> = {};
  const balByVault: Record<string, number> = {};
  const lastTsByVault: Record<string, number> = {};
  const firstTsByVault: Record<string, number> = {};
  const vaultIds = new Set<string>();

  for (const e of events) {
    vaultIds.add(e.vaultId);
    const lastTs = lastTsByVault[e.vaultId];
    if (lastTs !== undefined) {
      const dt = e.ts - lastTs;
      const balUsd = (balByVault[e.vaultId] || 0) / 1e6;
      tmByVault[e.vaultId] = (tmByVault[e.vaultId] || 0) + balUsd * (dt / MS_PER_MONTH);
    } else {
      firstTsByVault[e.vaultId] = e.ts;
    }
    balByVault[e.vaultId] = (balByVault[e.vaultId] || 0) + e.deltaLamports;
    lastTsByVault[e.vaultId] = e.ts;
  }

  // Add the open segment from last event to "now"
  const nowMs = now.getTime();
  for (const vid of Array.from(vaultIds)) {
    const lastTs = lastTsByVault[vid];
    if (lastTs !== undefined && balByVault[vid] > 0) {
      const dt = nowMs - lastTs;
      const balUsd = balByVault[vid] / 1e6;
      tmByVault[vid] = (tmByVault[vid] || 0) + balUsd * (dt / MS_PER_MONTH);
    }
  }

  const baseTm = Object.values(tmByVault).reduce((s, v) => s + v, 0);

  // Multipliers
  const heldVaults = Object.keys(tmByVault).filter((v) => (tmByVault[v] || 0) > 0);
  const holdsAwy = heldVaults.includes("fdn-awy");
  const diversified = heldVaults.length >= 3;

  const multipliers: StandingMultiplier[] = [
    {
      id: "awy",
      label: "All-Weather Yield holder",
      factor: 1.5,
      active: holdsAwy,
      reason: "AWY is Foundation's flagship four-leg basket. Holding it is the strongest signal of alignment.",
    },
    {
      id: "diversified",
      label: "Diversified across 3+ vaults",
      factor: 1.2,
      active: diversified,
      reason: "Distributing capital across multiple risk drivers strengthens the entire system.",
    },
  ];

  const effectiveMultiplier = multipliers
    .filter((m) => m.active)
    .reduce((s, m) => s * m.factor, 1.0);

  const tm = baseTm * effectiveMultiplier;

  // Tier
  const currentTier = [...STANDING_TIERS].reverse().find((t) => tm >= t.minTm) || STANDING_TIERS[0];
  const currentIdx = STANDING_TIERS.findIndex((t) => t.tier === currentTier.tier);
  const nextTier = STANDING_TIERS[currentIdx + 1] || null;
  const tmToNextTier = nextTier ? Math.max(0, nextTier.minTm - tm) : 0;
  const progressPct = nextTier
    ? Math.max(0, Math.min(1, (tm - currentTier.minTm) / (nextTier.minTm - currentTier.minTm)))
    : 1;

  // Breakdown per vault
  const breakdown: StandingBreakdown[] = Array.from(vaultIds).map((vid) => ({
    vaultId: vid,
    vaultName: vid,
    tmContribution: (tmByVault[vid] || 0) * effectiveMultiplier,
    vintageAt: firstTsByVault[vid] ? new Date(firstTsByVault[vid]).toISOString() : null,
    netUsdc: (balByVault[vid] || 0) / 1e6,
  })).sort((a, b) => b.tmContribution - a.tmContribution);

  const earliestVintage = Object.values(firstTsByVault).reduce((min, ts) => (ts < min ? ts : min), Infinity);
  const vintageAt = Number.isFinite(earliestVintage) ? new Date(earliestVintage).toISOString() : null;

  return {
    tm,
    baseTm,
    multipliers,
    effectiveMultiplier,
    currentTier,
    nextTier,
    tmToNextTier,
    progressPct,
    breakdown,
    vintageAt,
  };
}
