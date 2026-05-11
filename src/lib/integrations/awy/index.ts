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
 *
 * Canonical model parameters sourced from FoundationUSD/AWY-model repo.
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
  /** Canonical underlying APY from the AWY-model (decimal 0.1197 = 11.97%).
   *  Used for blended calculation and as the baseline for leveraged math. */
  baseApy: number;
  /** APY ceiling used for the "Expected → Max" visual. Always ≥ baseApy. */
  maxApy: number;
  /** Whether Foundation loops this leg against stable-coin borrow on Kamino. */
  leveraged: boolean;
  riskDriver: string;
  description: string;
}

/**
 * Source of truth for the AWY basket. Weights must sum to 10_000 bps.
 *
 * All APY values sourced from the FoundationUSD/AWY-model notebook
 * (`kamino_usdc_borrow_analysis.ipynb`), Cell 1 `MARKET_CONFIGS`.
 *
 * sUSDv updated to 7.1% (7-day cooldown, dropped APY, cannot be used as buffer).
 */
export const AWY_COMPOSITION: AwyLegSpec[] = [
  {
    id: "onyc",
    asset: "ONyc",
    issuer: "OnRe",
    weightBps: 3500,
    baseApy: 11.97,  // model: underlying_apy = 0.1197
    maxApy: 26.80,   // LTV sweep peak at 65% LTV (from backtest)
    leveraged: true,
    riskDriver: "Actuarial events",
    description: "Reinsurance receipts via OnRe's permissionless mint at NAV. Looped against USDS on Kamino at 50% static LTV.",
  },
  {
    id: "prime",
    asset: "PRIME",
    issuer: "Hastra",
    weightBps: 2500,
    baseApy: 7.33,   // model: underlying_apy = 0.0733
    maxApy: 23.20,   // LTV sweep peak at 85% LTV (from backtest)
    leveraged: true,
    riskDriver: "US rate cycle",
    description: "USDC supplied to Kamino's Figure-PRIME lending market. Looped against USDS at 80% static LTV.",
  },
  {
    id: "syrup-usdc",
    asset: "syrupUSDC",
    issuer: "Maple",
    weightBps: 2000,
    baseApy: 4.80,   // model: underlying_apy = 0.048
    maxApy: 11.07,   // LTV sweep peak at 80% LTV (from backtest)
    leveraged: true,
    riskDriver: "Crypto borrowing demand",
    description: "USDC supplied to Kamino's Syrup market. Looped against PYUSD at 80% static LTV.",
  },
  {
    id: "solomon",
    asset: "sUSDv",
    issuer: "Solomon",
    weightBps: 2000,
    baseApy: 7.10,   // model: underlying_apy = 0.071 — dropped to 7.1% post 7-day cooldown
    maxApy: 7.10,
    leveraged: false,
    riskDriver: "Basis spread",
    description: "Delta-neutral basis trade on BTC/ETH/SOL via Solomon. Unlevered base leg — embeds perp leverage internally. 7-day cooldown on redemptions.",
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
 * weights × baseApy.
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
  /** Decimal: 0.07 = 7%. Uses AWY-model canonical value as fallback. */
  underlyingApy: number;
  /** Decimal LTV applied for the headline. 0 for unlevered legs. */
  ltv: number;
  liquidationLtv: number;
  /** Chosen borrow asset (lowest mean APY in the leg's market). */
  borrowAsset: string | null;
  /** Reserve ID of the chosen borrow asset, if available. */
  borrowReserve: string;
  /** Mean borrow APY across the lookback window (decimal). Uses model mean as fallback. */
  borrowApy: number;
  /** Per-leg loop math output. Always computed — uses model fallback when live data unavailable. */
  loop: import("./leverage").LoopResult;
  /** weight × loop.netApy. */
  contributionApy: number;
  /** LTV sweep candidates for the UI. */
  ltvSweep: import("./leverage").LtvCandidate[];
  /** Underlying APY data source. */
  underlyingSource: "live" | "model";
  /** Borrow APY data source. "n/a" for unlevered legs. */
  borrowSource: "live" | "model" | "n/a";
  /** True for legs where on-chain looping is currently available. */
  loopVenueLive: boolean;
}

export interface LeveragedAwyData {
  legs: LeveragedLeg[];
  /** Blended portfolio net APY across all legs (decimal). */
  netApy: number;
  /** Sum of weighted gross APYs across all legs (decimal). */
  grossApy: number;
  /** Sum of weighted borrow drag across all legs (decimal). */
  borrowDrag: number;
  /** Number of legs with live borrow data (vs model fallback). */
  legsWithLiveData: number;
  /** Total leveraged legs (excludes unlevered). */
  totalLeveragedLegs: number;
  /** ms since epoch when this snapshot was generated. */
  fetchedAt: number;
  /** Backtest summary from AWY-model. */
  backtest: {
    /** Leveraged backtest APY as percent (21.20). */
    leveragedApy: number;
    /** Hold (unlevered) backtest APY as percent (12.62). */
    holdApy: number;
    /** Starting capital. */
    startingCapital: number;
    /** Final value after leverage. */
    leveragedEndValue: number;
    /** Final value without leverage. */
    holdEndValue: number;
    /** Hours of data observed. */
    hoursObserved: number;
    /** Start of backtest window. */
    backtestStart: string;
  };
}

/**
 * Loop-venue availability per leg. Mirrors the on-chain reality:
 *   PRIME      — Kamino multiply available today (the leg's underlying is already on Kamino)
 *   syrupUSDC  — supplied via Kamino Syrup market (kamino api id: "main"), multiply available
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
 * Mean borrow APYs from the AWY-model backtest (cell 3 output).
 * Used as canonical fallback when live Kamino data is unavailable.
 * These are the actual historical mean borrow costs over the backtest window.
 */
const MODEL_MEAN_BORROW_APY: Record<AwyLegId, number> = {
  onyc: 0.0547,      // ONyc / USDS: mean 5.47%
  prime: 0.0486,     // PRIME / USDS: mean 4.86%
  "syrup-usdc": 0.0329, // syrupUSDC / PYUSD: mean 3.29%
  solomon: 0,
};

const MODEL_BORROW_ASSET: Record<AwyLegId, string> = {
  onyc: "USDS",
  prime: "USDS",
  "syrup-usdc": "PYUSD",
  solomon: "",
};

/** AWY-model canonical backtest results (cell 8 output). */
const MODEL_BACKTEST = {
  leveragedApy: 21.20,
  holdApy: 12.62,
  startingCapital: 1000,
  leveragedEndValue: 1065.53,
  holdEndValue: 1040.02,
  hoursObserved: 2892,
  backtestStart: "2025-11-01",
};

/**
 * Aggregate the leveraged view of AWY: per-leg loop math with live underlying
 * APY and live Kamino borrow rates, plus a portfolio net APY. Uses AWY-model
 * canonical values as fallback per-leg — never shows dashes or "unavailable".
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

  const perLeg: LeveragedLeg[] = await Promise.all(
    AWY_COMPOSITION.map(async (spec): Promise<LeveragedLeg> => {
      const cfg = LEG_LOOP_CONFIG[spec.id];
      const live = awyData.legs.find((l) => l.id === spec.id);

      // Underlying APY: prefer live, fall back to AWY-model canonical.
      const liveUnderlying =
        live && Number.isFinite(live.liveApy) && live.liveApy > 0 && live.source !== "spec-fallback"
          ? live.liveApy / 100  // live is in percent, convert to decimal
          : null;
      const underlyingApy = liveUnderlying ?? spec.baseApy / 100; // model canonical (decimal)
      const underlyingSource: "live" | "model" = liveUnderlying !== null ? "live" : "model";

      // Unlevered leg: surface underlying APY directly, no loop.
      if (!cfg.leveraged || cfg.defaultLtv === 0) {
        const loop = {
          leverageMultiple: 1,
          grossApy: underlyingApy,
          borrowDrag: 0,
          netApy: underlyingApy,
        };
        return {
          id: spec.id,
          asset: spec.asset,
          issuer: spec.issuer,
          weightBps: spec.weightBps,
          underlyingApy,
          ltv: 0,
          liquidationLtv: 0,
          borrowAsset: null,
          borrowReserve: "",
          borrowApy: 0,
          loop,
          contributionApy: (spec.weightBps / 10_000) * underlyingApy,
          ltvSweep: [],
          underlyingSource,
          borrowSource: "n/a",
          loopVenueLive: LOOP_VENUE_LIVE[spec.id],
        };
      }

      // Leveraged leg: try to fetch live borrow data, fall back to model mean.
      let liveBorrow: number | null = null;
      let borrowAsset = MODEL_BORROW_ASSET[spec.id];
      let borrowReserve = "";
      let borrowSource: "live" | "model" = "model";

      try {
        const borrowPick = await pickCheapestBorrow(cfg.kaminoMarket, { specFallbackApy: NaN });
        if (borrowPick.source === "live" && Number.isFinite(borrowPick.meanApy)) {
          liveBorrow = borrowPick.meanApy;
          borrowAsset = borrowPick.asset;
          borrowReserve = borrowPick.reserveId;
          borrowSource = "live";
        }
      } catch {
        // Fall back to model mean — no error surface needed.
      }

      const borrowApy = liveBorrow ?? MODEL_MEAN_BORROW_APY[spec.id];

      const loop = loopMath(underlyingApy, cfg.defaultLtv, borrowApy);
      const sweep = evaluateLtvSweep({
        underlyingApy,
        borrowApy,
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
        borrowAsset,
        borrowReserve,
        borrowApy,
        loop,
        contributionApy: (spec.weightBps / 10_000) * loop.netApy,
        ltvSweep: sweep,
        underlyingSource,
        borrowSource,
        loopVenueLive: LOOP_VENUE_LIVE[spec.id],
      };
    }),
  );

  // Portfolio aggregates — always computed, uses model fallback when needed.
  let netApy = 0;
  let grossApy = 0;
  let borrowDrag = 0;
  for (const l of perLeg) {
    const w = l.weightBps / 10_000;
    netApy += w * l.loop.netApy;
    grossApy += w * l.loop.grossApy;
    borrowDrag += w * l.loop.borrowDrag;
  }

  const totalLeveragedLegs = AWY_COMPOSITION.filter(
    (s) => LEG_LOOP_CONFIG[s.id].leveraged && LEG_LOOP_CONFIG[s.id].defaultLtv > 0,
  ).length;
  const legsWithLiveData = perLeg.filter(
    (l) => l.ltv > 0 && l.borrowSource === "live",
  ).length;

  return {
    legs: perLeg,
    netApy,
    grossApy,
    borrowDrag,
    legsWithLiveData,
    totalLeveragedLegs,
    fetchedAt: Date.now(),
    backtest: MODEL_BACKTEST,
  };
}

/**
 * Tier-specific levered AWY data. Used by the rate cron to push tier-appropriate
 * net APY to `awy2xUSD` / `awy3xUSD` mints.
 *
 * Tier mapping per AWY-model:
 *   - 2x: PRIME 50% LTV, syrup 50% LTV, ONyc + Solomon unlevered
 *   - 3x: PRIME 80% LTV (model max), syrup 80% LTV, ONyc + Solomon unlevered
 *
 * ONyc stays unlevered in both tiers because Kamino has not yet published an
 * ONyc lending reserve. When that lands, plug in the per-tier LTV override
 * here and the cron picks it up automatically.
 */
export async function getLeveragedAwyDataForTier(
  tier: "2x" | "3x",
): Promise<LeveragedAwyData> {
  const tierLtv = tier === "2x" ? 0.50 : 0.80;
  const ltvOverrides: Partial<Record<AwyLegId, number>> = {
    prime: tierLtv,
    "syrup-usdc": tierLtv,
    // ONyc + Solomon use their LEG_LOOP_CONFIG defaults (unlevered for both).
  };

  const [{ LEG_LOOP_CONFIG, loopMath, evaluateLtvSweep }, { pickCheapestBorrow }, awyData] =
    await Promise.all([
      import("./leverage"),
      import("./kamino-borrow"),
      getAwyData(),
    ]);

  const perLeg: LeveragedLeg[] = await Promise.all(
    AWY_COMPOSITION.map(async (spec): Promise<LeveragedLeg> => {
      const cfg = LEG_LOOP_CONFIG[spec.id];
      const live = awyData.legs.find((l) => l.id === spec.id);
      const liveUnderlying =
        live && Number.isFinite(live.liveApy) && live.liveApy > 0 && live.source !== "spec-fallback"
          ? live.liveApy / 100
          : null;
      const underlyingApy = liveUnderlying ?? spec.baseApy / 100;
      const underlyingSource: "live" | "model" = liveUnderlying !== null ? "live" : "model";

      // Tier-specific LTV: override if defined for this leg, else use config default.
      const effectiveLtv = ltvOverrides[spec.id] ?? cfg.defaultLtv;

      if (!cfg.leveraged || effectiveLtv === 0) {
        const loop = {
          leverageMultiple: 1,
          grossApy: underlyingApy,
          borrowDrag: 0,
          netApy: underlyingApy,
        };
        return {
          id: spec.id,
          asset: spec.asset,
          issuer: spec.issuer,
          weightBps: spec.weightBps,
          underlyingApy,
          ltv: 0,
          liquidationLtv: 0,
          borrowAsset: null,
          borrowReserve: "",
          borrowApy: 0,
          loop,
          contributionApy: (spec.weightBps / 10_000) * underlyingApy,
          ltvSweep: [],
          underlyingSource,
          borrowSource: "n/a",
          loopVenueLive: LOOP_VENUE_LIVE[spec.id],
        };
      }

      let liveBorrow: number | null = null;
      let borrowAsset = MODEL_BORROW_ASSET[spec.id];
      let borrowReserve = "";
      let borrowSource: "live" | "model" = "model";

      try {
        const borrowPick = await pickCheapestBorrow(cfg.kaminoMarket, { specFallbackApy: NaN });
        if (borrowPick.source === "live" && Number.isFinite(borrowPick.meanApy)) {
          liveBorrow = borrowPick.meanApy;
          borrowAsset = borrowPick.asset;
          borrowReserve = borrowPick.reserveId;
          borrowSource = "live";
        }
      } catch {}

      const borrowApy = liveBorrow ?? MODEL_MEAN_BORROW_APY[spec.id];
      const loop = loopMath(underlyingApy, effectiveLtv, borrowApy);
      const sweep = evaluateLtvSweep({
        underlyingApy,
        borrowApy,
        liquidationLtv: cfg.liquidationLtv,
        candidates: cfg.ltvCandidates,
      });

      return {
        id: spec.id,
        asset: spec.asset,
        issuer: spec.issuer,
        weightBps: spec.weightBps,
        underlyingApy,
        ltv: effectiveLtv,
        liquidationLtv: cfg.liquidationLtv,
        borrowAsset,
        borrowReserve,
        borrowApy,
        loop,
        contributionApy: (spec.weightBps / 10_000) * loop.netApy,
        ltvSweep: sweep,
        underlyingSource,
        borrowSource,
        loopVenueLive: LOOP_VENUE_LIVE[spec.id],
      };
    }),
  );

  let netApy = 0;
  let grossApy = 0;
  let borrowDrag = 0;
  for (const l of perLeg) {
    const w = l.weightBps / 10_000;
    netApy += w * l.loop.netApy;
    grossApy += w * l.loop.grossApy;
    borrowDrag += w * l.loop.borrowDrag;
  }

  const totalLeveragedLegs = AWY_COMPOSITION.filter(
    (s) => LEG_LOOP_CONFIG[s.id].leveraged && (ltvOverrides[s.id] ?? LEG_LOOP_CONFIG[s.id].defaultLtv) > 0,
  ).length;
  const legsWithLiveData = perLeg.filter(
    (l) => l.ltv > 0 && l.borrowSource === "live",
  ).length;

  return {
    legs: perLeg,
    netApy,
    grossApy,
    borrowDrag,
    legsWithLiveData,
    totalLeveragedLegs,
    fetchedAt: Date.now(),
    backtest: MODEL_BACKTEST,
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
