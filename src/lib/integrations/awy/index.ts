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
  /** Decimal: 0.07 = 7%. Live underlying APY pulled from `getAwyData()`. */
  underlyingApy: number;
  /** Decimal LTV applied for the headline. 0 for unlevered legs. */
  ltv: number;
  liquidationLtv: number;
  /** Chosen borrow asset (lowest mean APY in the leg's market). */
  borrowAsset: string;
  /** Reserve ID of the chosen borrow asset, if available. */
  borrowReserve: string;
  /** Mean borrow APY across the lookback window (decimal). */
  borrowApy: number;
  /** Per-leg loop math output. */
  loop: import("./leverage").LoopResult;
  /** weight × loop.netApy. */
  contributionApy: number;
  /** LTV sweep candidates for the UI. */
  ltvSweep: import("./leverage").LtvCandidate[];
  /** "live" if the borrow APY came from the Kamino API; "spec-fallback" otherwise. */
  borrowSource: "live" | "spec-fallback";
  /** True for legs where on-chain looping is currently available. */
  loopVenueLive: boolean;
}

export interface LeveragedAwyData {
  legs: LeveragedLeg[];
  /** Blended portfolio net APY across all legs (decimal). */
  netApy: number;
  /** Sum of weighted gross APYs (decimal). */
  grossApy: number;
  /** Sum of weighted borrow drag (decimal). */
  borrowDrag: number;
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
  const [{ LEG_LOOP_CONFIG, loopMath, evaluateLtvSweep, buildPortfolioBacktest }, { pickCheapestBorrow }, awyData] =
    await Promise.all([
      import("./leverage"),
      import("./kamino-borrow"),
      getAwyData(),
    ]);

  // For each leg, resolve underlying APY (from live AWY data) + borrow APY
  // (from Kamino API or spec). Then run loop math + LTV sweep.
  const perLeg = await Promise.all(
    AWY_COMPOSITION.map(async (spec) => {
      const cfg = LEG_LOOP_CONFIG[spec.id];
      const live = awyData.legs.find((l) => l.id === spec.id);
      const underlyingApy = (live?.liveApy ?? spec.baseApy) / 100; // decimal

      if (!cfg.leveraged || cfg.defaultLtv === 0) {
        // Unlevered leg — still a row in the leveraged blend; just no loop.
        return {
          id: spec.id,
          asset: spec.asset,
          issuer: spec.issuer,
          weightBps: spec.weightBps,
          underlyingApy,
          ltv: 0,
          liquidationLtv: 0,
          borrowAsset: "n/a",
          borrowReserve: "",
          borrowApy: 0,
          loop: {
            leverageMultiple: 1,
            grossApy: underlyingApy,
            borrowDrag: 0,
            netApy: underlyingApy,
          },
          contributionApy: (spec.weightBps / 10_000) * underlyingApy,
          ltvSweep: [],
          borrowSource: "spec-fallback" as const,
          loopVenueLive: LOOP_VENUE_LIVE[spec.id],
        };
      }

      // Conservative spec fallback: use the per-leg base APY as the borrow proxy.
      // (Reasonable upper bound when Kamino is unreachable; in practice the live
      // borrow APY is materially lower than the leg's underlying yield.)
      const specFallbackApy = Math.max(0.04, spec.baseApy / 100 * 0.6);

      const borrowPick = await pickCheapestBorrow(cfg.kaminoMarket, { specFallbackApy });
      const loop = loopMath(underlyingApy, cfg.defaultLtv, borrowPick.meanApy);
      const sweep = evaluateLtvSweep({
        underlyingApy,
        borrowApy: borrowPick.meanApy,
        liquidationLtv: cfg.liquidationLtv,
        candidates: cfg.ltvCandidates,
      });

      return {
        id: spec.id,
        asset: spec.asset,
        issuer: spec.issuer,
        weightBps: spec.weightBps,
        underlyingApy,
        ltv: cfg.defaultLtv,
        liquidationLtv: cfg.liquidationLtv,
        borrowAsset: borrowPick.asset,
        borrowReserve: borrowPick.reserveId,
        borrowApy: borrowPick.meanApy,
        loop,
        contributionApy: (spec.weightBps / 10_000) * loop.netApy,
        ltvSweep: sweep,
        borrowSource: borrowPick.source,
        loopVenueLive: LOOP_VENUE_LIVE[spec.id],
      };
    }),
  );

  const portfolio = buildPortfolioBacktest(
    perLeg.map((l) => ({
      id: l.id,
      underlyingApy: l.underlyingApy,
      ltv: l.ltv,
      borrowApy: l.borrowApy,
      weightBps: l.weightBps,
    })),
  );

  return {
    legs: perLeg,
    netApy: portfolio.netApy,
    grossApy: portfolio.grossApy,
    borrowDrag: portfolio.borrowDrag,
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
