/**
 * AWY — All-Weather Yield basket.
 *
 * Four yield engines with distinct dominant risk drivers:
 *   ONyc       (OnRe)          — reinsurance premiums + collateral yield
 *   PRIME      (Figure)        — tokenized HELOC lending (via Kamino)
 *   syrupUSDC  (Maple)         — overcollateralized institutional lending
 *   USDv       (Solomon)       — delta-neutral basis trade on BTC/ETH/SOL
 *
 * Architecture mirrors Solomon / Kamino / Oro: a Squads multisig holds USDC and the
 * four leg assets, deployCapital() splits incoming USDC by `weightBps` and routes each
 * slice to the underlying integration. Receipt token: awyUSD (Token-2022 InterestBearing).
 */
/*
  Note: per-leg modules are loaded via dynamic `import()` inside `getAwyData`
  rather than top-level imports. `./onyc` pulls in `@coral-xyz/anchor`'s `Wallet`
  class, which is Node-only and breaks Next.js client-component bundling. Dynamic
  imports keep that code out of the browser bundle.
*/

export type AwyLegId = "onyc" | "prime" | "syrup-usdc" | "solomon";

export interface AwyLegSpec {
  id: AwyLegId;
  asset: string;
  issuer: string;
  weightBps: number;
  /** Expected APY after risk-adjusted target leverage. Used as the basket's
   *  blended-APY input. For unlevered legs this equals the unlevered APY. */
  baseApy: number;
  /** APY at the maximum supported leverage. Always ≥ baseApy. */
  maxApy: number;
  /** Whether Foundation loops this leg against USDC borrow on Kamino. */
  leveraged: boolean;
  riskDriver: string;
  description: string;
}

/**
 * Source of truth for the AWY basket. Weights must sum to 10_000 bps.
 * Quarterly rebalance to these targets; drift > 3% per leg also triggers rebalance.
 *
 * `baseApy`  — what the leg actually earns today (live rate or conservative spec)
 * `maxApy`   — leveraged target if/when external looping is wired
 * `leveraged` — false for all legs today. ONyc is not currently on a Kamino
 *              lending market (only LP pools), and PRIME/syrupUSDC slices route
 *              into Kamino USDC-supply rails which can't be looped without
 *              negative carry. Solomon's basis trade embeds perp leverage
 *              internally. Set leveraged=true per leg once a Kamino multiply
 *              reserve is confirmed for ONyc and the klend SDK is integrated.
 */
export const AWY_COMPOSITION: AwyLegSpec[] = [
  {
    id: "onyc",
    asset: "ONyc",
    issuer: "OnRe",
    weightBps: 3500,
    baseApy: 12.0,   // live: OnRe getApy() returns ~12% APR
    maxApy: 15.5,    // post-leverage target once Kamino reserve published
    leveraged: true,
    riskDriver: "Actuarial events",
    description: "Reinsurance receipts via OnRe's permissionless mint at NAV. Loop venue pending Kamino reserve publication; leveraged math is methodology-only until then.",
  },
  {
    id: "prime",
    asset: "PRIME",
    issuer: "Hastra",
    weightBps: 2500,
    baseApy: 5.4,    // live: Kamino PRIME-market USDC supply
    maxApy: 13.8,    // post-leverage target
    leveraged: true,
    riskDriver: "US rate cycle",
    description: "USDC supplied to Kamino's Figure-PRIME lending market. kToken receipt held by the vault PDA. Loop venue available; leveraged math previewed on /awy.",
  },
  {
    id: "syrup-usdc",
    asset: "syrupUSDC",
    issuer: "Maple",
    weightBps: 2000,
    baseApy: 4.2,    // live: Kamino Main USDC supply (proxy — Maple has no Solana lending program)
    maxApy: 11.5,    // post-leverage target
    leveraged: true,
    riskDriver: "Crypto borrowing demand",
    description: "USDC supplied to Kamino's Main market as a proxy for Maple's institutional lending — Maple has no Solana-native lending program yet.",
  },
  {
    id: "solomon",
    asset: "USDv",
    issuer: "Solomon",
    weightBps: 2000,
    baseApy: 9.0,
    maxApy: 9.0,
    leveraged: false,
    riskDriver: "Basis spread",
    description: "Delta-neutral basis trade on BTC/ETH/SOL via Solomon. Embeds perp leverage internally.",
  },
];

const _weightsCheck = AWY_COMPOSITION.reduce((s, l) => s + l.weightBps, 0);
if (_weightsCheck !== 10_000) {
  throw new Error(`AWY_COMPOSITION weights sum to ${_weightsCheck}, must be 10_000`);
}

export interface AwyLegLiveData extends AwyLegSpec {
  /** Live APY from the underlying protocol (fallback: baseApy from spec). */
  liveApy: number;
  /** Per-unit NAV in USD if readable, else null. */
  navUsd: number | null;
  /** Mint address on Solana mainnet (empty string if not yet bridged). */
  mint: string;
  /** Source label for the live data ("kamino" | "maple-api" | "ondo-oracle" | "spec-fallback"). */
  source: string;
}

export interface AwyAggregateData {
  /** Per-leg live snapshot. */
  legs: AwyLegLiveData[];
  /** Weighted blended APY using live values where available, spec fallbacks otherwise. */
  blendedBaseApy: number;
  /** Spec blended APY using only the static `baseApy` values. Stable across requests. */
  specBlendedApy: number;
  /** ms since epoch when this snapshot was generated. */
  fetchedAt: number;
}

/**
/**
 * Spec-blended APY — deterministic, no I/O. Used by tests, fallback paths, and the
 * landing page when API hasn't loaded yet. Computed at runtime from AWY_COMPOSITION
 * weights × baseApy (currently ~8.1%).
 */
export function getSpecBlendedApy(): number {
  const total = AWY_COMPOSITION.reduce(
    (sum, leg) => sum + (leg.baseApy * leg.weightBps) / 10_000,
    0,
  );
  return Math.round(total * 100) / 100;
}

/* ============================================================
   Leverage layer — methodology preview, no on-chain execution yet.
   See `./leverage.ts` for math, `./kamino-borrow.ts` for live data.
   ============================================================ */

export type {
  LtvCandidate,
  PortfolioBacktest,
  PortfolioContribution,
  LoopResult,
  LegLoopConfig,
} from "./leverage";

export interface LeveragedLeg {
  id: AwyLegId;
  asset: string;
  issuer: string;
  weightBps: number;
  /** Decimal: 0.07 = 7%. Strictly live — null when no live underlying APY available. */
  underlyingApy: number | null;
  /** Decimal LTV applied for the headline. 0 for unlevered legs. */
  ltv: number;
  liquidationLtv: number;
  /** Chosen borrow asset (lowest mean APY in the leg's market). null if no live data. */
  borrowAsset: string | null;
  /** Reserve ID of the chosen borrow asset, if available. */
  borrowReserve: string;
  /** Mean borrow APY across the lookback window (decimal). null if no live data. */
  borrowApy: number | null;
  /** Per-leg loop math output. null when underlying or borrow APY isn't live. */
  loop: import("./leverage").LoopResult | null;
  /** weight × loop.netApy. null when loop math couldn't run. */
  contributionApy: number | null;
  /** LTV sweep candidates for the UI. Empty when borrow APY isn't live. */
  ltvSweep: import("./leverage").LtvCandidate[];
  /** Underlying APY data source. */
  underlyingSource: "live" | "unavailable";
  /** Borrow APY data source. "n/a" for unlevered legs. */
  borrowSource: "live" | "unavailable" | "n/a";
  /** True for legs where on-chain looping is currently available. */
  loopVenueLive: boolean;
  /** True iff all inputs were live and loop math ran. */
  loopReady: boolean;
}

export interface LeveragedAwyData {
  legs: LeveragedLeg[];
  /** Blended portfolio net APY across legs that ran the loop (decimal). null if no leg has live data. */
  netApy: number | null;
  /** Sum of weighted gross APYs across loop-ready legs (decimal). */
  grossApy: number | null;
  /** Sum of weighted borrow drag across loop-ready legs (decimal). */
  borrowDrag: number | null;
  /** Number of legs whose loop math ran with live data. */
  legsWithLiveData: number;
  /** Total leveraged legs (excludes unlevered). */
  totalLeveragedLegs: number;
  /** ms since epoch when this snapshot was generated. */
  fetchedAt: number;
}

/**
 * Loop-venue availability per leg. Mirrors the on-chain reality:
 *   PRIME      — Kamino multiply available today (the leg's underlying is already on Kamino)
 *   syrupUSDC  — proxy on Kamino Main, multiply available
 *   ONyc       — blocked on Kamino publishing an ONyc lending reserve
 *   Solomon    — never looped (basis trade embeds perp leverage internally)
 */
const LOOP_VENUE_LIVE: Record<AwyLegId, boolean> = {
  prime: true,
  "syrup-usdc": true,
  onyc: false,
  solomon: false,
};

/**
 * Aggregate the leveraged view of AWY: per-leg loop math with live underlying
 * APY and live Kamino borrow rates, plus a portfolio net APY. Falls back to
 * spec values per-leg on any external failure.
 *
 * Pure methodology preview — no on-chain leverage is executed by this call.
 */
export async function getLeveragedAwyData(): Promise<LeveragedAwyData> {
  const [{ LEG_LOOP_CONFIG, loopMath, evaluateLtvSweep }, { pickCheapestBorrow }, awyData] =
    await Promise.all([
      import("./leverage"),
      import("./kamino-borrow"),
      getAwyData(),
    ]);

  // Strict live-data discipline: a leg gets loop math only when both its
  // underlying APY and its Kamino borrow APY are live. No hardcoded APY ever
  // flows into the headline number — when data is unavailable, the leg
  // surfaces as "live data unavailable" instead of an invented value.
  const perLeg: LeveragedLeg[] = await Promise.all(
    AWY_COMPOSITION.map(async (spec): Promise<LeveragedLeg> => {
      const cfg = LEG_LOOP_CONFIG[spec.id];
      const live = awyData.legs.find((l) => l.id === spec.id);
      const liveUnderlying =
        live && Number.isFinite(live.liveApy) && live.liveApy > 0 && live.source !== "spec-fallback"
          ? live.liveApy / 100
          : null;
      const underlyingSource: "live" | "unavailable" = liveUnderlying !== null ? "live" : "unavailable";

      // Unlevered leg: surface live underlying APY directly, no loop.
      if (!cfg.leveraged || cfg.defaultLtv === 0) {
        const ready = liveUnderlying !== null;
        return {
          id: spec.id,
          asset: spec.asset,
          issuer: spec.issuer,
          weightBps: spec.weightBps,
          underlyingApy: liveUnderlying,
          ltv: 0,
          liquidationLtv: 0,
          borrowAsset: null,
          borrowReserve: "",
          borrowApy: null,
          loop: ready
            ? {
                leverageMultiple: 1,
                grossApy: liveUnderlying!,
                borrowDrag: 0,
                netApy: liveUnderlying!,
              }
            : null,
          contributionApy: ready ? (spec.weightBps / 10_000) * liveUnderlying! : null,
          ltvSweep: [],
          underlyingSource,
          borrowSource: "n/a",
          loopVenueLive: LOOP_VENUE_LIVE[spec.id],
          loopReady: ready,
        };
      }

      // Leveraged leg: try to fetch live borrow data. We pass specFallbackApy=NaN so
      // any spec-fallback path inside the client returns NaN, which we then detect
      // and treat as "no live data". No hardcoded APY enters the loop math.
      const borrowPick = await pickCheapestBorrow(cfg.kaminoMarket, { specFallbackApy: NaN });
      const liveBorrow =
        borrowPick.source === "live" && Number.isFinite(borrowPick.meanApy)
          ? borrowPick.meanApy
          : null;
      const borrowSource: "live" | "unavailable" = liveBorrow !== null ? "live" : "unavailable";

      // Without live underlying OR live borrow we don't fabricate numbers.
      if (liveUnderlying === null || liveBorrow === null) {
        return {
          id: spec.id,
          asset: spec.asset,
          issuer: spec.issuer,
          weightBps: spec.weightBps,
          underlyingApy: liveUnderlying,
          ltv: cfg.defaultLtv,
          liquidationLtv: cfg.liquidationLtv,
          borrowAsset: liveBorrow !== null ? borrowPick.asset : null,
          borrowReserve: borrowPick.reserveId,
          borrowApy: liveBorrow,
          loop: null,
          contributionApy: null,
          ltvSweep: [],
          underlyingSource,
          borrowSource,
          loopVenueLive: LOOP_VENUE_LIVE[spec.id],
          loopReady: false,
        };
      }

      const loop = loopMath(liveUnderlying, cfg.defaultLtv, liveBorrow);
      const sweep = evaluateLtvSweep({
        underlyingApy: liveUnderlying,
        borrowApy: liveBorrow,
        liquidationLtv: cfg.liquidationLtv,
        candidates: cfg.ltvCandidates,
      });

      return {
        id: spec.id,
        asset: spec.asset,
        issuer: spec.issuer,
        weightBps: spec.weightBps,
        underlyingApy: liveUnderlying,
        ltv: cfg.defaultLtv,
        liquidationLtv: cfg.liquidationLtv,
        borrowAsset: borrowPick.asset,
        borrowReserve: borrowPick.reserveId,
        borrowApy: liveBorrow,
        loop,
        contributionApy: (spec.weightBps / 10_000) * loop.netApy,
        ltvSweep: sweep,
        underlyingSource,
        borrowSource,
        loopVenueLive: LOOP_VENUE_LIVE[spec.id],
        loopReady: true,
      };
    }),
  );

  // Portfolio aggregates only legs whose loop ran with live data. If a leg's
  // data was unavailable, its weight contributes 0 — the surfaced number is
  // honest about being incomplete.
  const ready = perLeg.filter((l) => l.loopReady && l.loop !== null);
  let netApy: number | null = null;
  let grossApy: number | null = null;
  let borrowDrag: number | null = null;
  if (ready.length > 0) {
    netApy = 0;
    grossApy = 0;
    borrowDrag = 0;
    for (const l of ready) {
      const w = l.weightBps / 10_000;
      netApy += w * l.loop!.netApy;
      grossApy += w * l.loop!.grossApy;
      borrowDrag += w * l.loop!.borrowDrag;
    }
  }

  const totalLeveragedLegs = AWY_COMPOSITION.filter(
    (s) => LEG_LOOP_CONFIG[s.id].leveraged && LEG_LOOP_CONFIG[s.id].defaultLtv > 0,
  ).length;
  const legsWithLiveData = ready.filter((l) => l.ltv > 0).length;

  return {
    legs: perLeg,
    netApy,
    grossApy,
    borrowDrag,
    legsWithLiveData,
    totalLeveragedLegs,
    fetchedAt: Date.now(),
  };
}

/**
 * Fetch live per-leg data. Each reader is fault-tolerant — a single leg failing falls
 * back to its spec value rather than blowing up the whole basket. Total failure budget
 * is implicit: if every leg falls back, blendedBaseApy === specBlendedApy.
 */
export async function getAwyData(): Promise<AwyAggregateData> {
  // Dynamic-imported so the Anchor / Solana-web3 stack stays out of any client
  // bundle that pulls AWY_COMPOSITION from this module.
  const [
    { getOnycData },
    { getPrimeData },
    { getSyrupUsdcData },
    { getSolomonAwyLegData },
  ] = await Promise.all([
    import("./onyc"),
    import("./prime"),
    import("./maple"),
    import("./solomon"),
  ]);

  const [onyc, prime, maple, solomon] = await Promise.all([
    getOnycData().catch(() => null),
    getPrimeData().catch(() => null),
    getSyrupUsdcData().catch(() => null),
    getSolomonAwyLegData().catch(() => null),
  ]);

  const liveByLeg: Record<AwyLegId, { apy: number; nav: number | null; mint: string; source: string }> = {
    onyc: onyc ?? { apy: 0, nav: null, mint: "", source: "spec-fallback" },
    prime: prime ?? { apy: 0, nav: null, mint: "", source: "spec-fallback" },
    "syrup-usdc": maple ?? { apy: 0, nav: null, mint: "", source: "spec-fallback" },
    solomon: solomon ?? { apy: 0, nav: null, mint: "", source: "spec-fallback" },
  };

  const legs: AwyLegLiveData[] = AWY_COMPOSITION.map((spec) => {
    const live = liveByLeg[spec.id];
    const liveApy = live.apy > 0 ? live.apy : spec.baseApy;
    return {
      ...spec,
      liveApy,
      navUsd: live.nav,
      mint: live.mint,
      source: live.apy > 0 ? live.source : "spec-fallback",
    };
  });

  const blendedBaseApy = legs.reduce(
    (sum, leg) => sum + (leg.liveApy * leg.weightBps) / 10_000,
    0,
  );

  return {
    legs,
    blendedBaseApy: Math.round(blendedBaseApy * 100) / 100,
    specBlendedApy: getSpecBlendedApy(),
    fetchedAt: Date.now(),
  };
}
