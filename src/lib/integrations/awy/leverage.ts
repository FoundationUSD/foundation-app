/**
 * AWY Leverage — pure math library.
 *
 * Ports the model from the private `FoundationUSD/AWY-model` repo:
 *   - per-leg static-LTV loop returns
 *   - LTV sweep with liquidation-gap analysis
 *   - portfolio-level aggregation
 *
 * No I/O. Live borrow rate inputs come from `kamino-borrow.ts`; this file
 * just consumes plain numbers and returns plain numbers, which makes it
 * trivial to unit-test against the notebook's printed outputs.
 *
 * Math (one leg, collateral underlying APY `y`, loan-to-value `LTV`,
 * borrow APY `r`):
 *
 *   leverage_multiple = 1 / (1 - LTV)
 *   gross_apy        = y × leverage_multiple
 *   borrow_drag      = (leverage_multiple - 1) × r
 *   net_apy          = gross_apy - borrow_drag
 *
 * Portfolio APY = Σ (weight_i × net_apy_i).
 */

import type { AwyLegId } from "./index";

export interface BorrowRatePoint {
  /** Unix ms timestamp of the hourly observation. */
  timestamp: number;
  /** Annualized borrow APY at that point, expressed as a decimal (0.07 = 7%). */
  borrowApy: number;
}

export interface LoopResult {
  leverageMultiple: number;
  /** Decimal: 0.10 = 10%. Same convention as `AwyLegSpec.baseApy / 100`. */
  grossApy: number;
  borrowDrag: number;
  netApy: number;
}

export interface SimulateResult {
  /** Hourly equity curve, normalised to a $1 starting position. */
  equityCurve: { timestamp: number; equity: number }[];
  finalEquity: number;
  /** Annualised return realised over the simulated window (decimal). */
  realisedApy: number;
  /** Mean borrow APY across the window. */
  meanBorrowApy: number;
  hours: number;
}

export interface LtvCandidate {
  ltv: number;
  netApy: number;
  leverageMultiple: number;
  /** Percentage points between candidate LTV and the leg's liquidation LTV. */
  liquidationGap: number;
  recommended: boolean;
}

export interface LegInputs {
  id: AwyLegId;
  /** Decimal: 0.07 = 7%. */
  underlyingApy: number;
  /** Decimal LTV: 0.50 = 50%. Set to 0 for unlevered legs. */
  ltv: number;
  /** Annualized borrow APY (decimal) for the chosen borrow asset. */
  borrowApy: number;
  /** Allocation in basis points; same convention as `AwyLegSpec.weightBps`. */
  weightBps: number;
}

/* ============================================================
   Per-leg math
   ============================================================ */

/**
 * Core loop math. LTV must be in [0, 1); LTV = 1 would imply infinite
 * leverage, which is a math + reality bug.
 */
export function loopMath(underlyingApy: number, ltv: number, borrowApy: number): LoopResult {
  if (ltv < 0 || ltv >= 1) {
    throw new Error(`ltv out of range: ${ltv} (expected 0 ≤ ltv < 1)`);
  }
  const leverageMultiple = 1 / (1 - ltv);
  const grossApy = underlyingApy * leverageMultiple;
  const borrowDrag = (leverageMultiple - 1) * borrowApy;
  return {
    leverageMultiple,
    grossApy,
    borrowDrag,
    netApy: grossApy - borrowDrag,
  };
}

/**
 * Static-LTV simulation across a borrow rate history. Compounds hourly,
 * matching the notebook's `simulate_static_ltv` cell. Underlying APY is held
 * constant (we don't have hourly underlying yield history; the spec APY is the
 * conservative input).
 */
export function simulateStaticLtv(
  history: BorrowRatePoint[],
  underlyingApy: number,
  ltv: number,
): SimulateResult {
  if (history.length === 0) {
    return {
      equityCurve: [],
      finalEquity: 1,
      realisedApy: 0,
      meanBorrowApy: 0,
      hours: 0,
    };
  }

  const sorted = [...history].sort((a, b) => a.timestamp - b.timestamp);
  const leverage = 1 / (1 - ltv);
  // Convert annual APYs to hourly multiplicative factors.
  const HOURS_PER_YEAR = 8760;
  const hourlyUnderlying = Math.pow(1 + underlyingApy, 1 / HOURS_PER_YEAR) - 1;

  let equity = 1;
  let borrowSum = 0;
  const equityCurve: { timestamp: number; equity: number }[] = [];

  for (const pt of sorted) {
    const hourlyBorrow = Math.pow(1 + Math.max(0, pt.borrowApy), 1 / HOURS_PER_YEAR) - 1;
    // Net hourly return = leveraged underlying gain − leveraged-borrow drag.
    const hourlyNet = hourlyUnderlying * leverage - hourlyBorrow * (leverage - 1);
    equity *= 1 + hourlyNet;
    borrowSum += pt.borrowApy;
    equityCurve.push({ timestamp: pt.timestamp, equity });
  }

  const hours = sorted.length;
  const realisedApy = hours > 0 ? Math.pow(equity, HOURS_PER_YEAR / hours) - 1 : 0;
  return {
    equityCurve,
    finalEquity: equity,
    realisedApy,
    meanBorrowApy: hours > 0 ? borrowSum / hours : 0,
    hours,
  };
}

/**
 * Sweep candidate LTVs and rank by net APY. Marks the highest-net-APY
 * candidate that still leaves at least `minLiquidationGap` between the chosen
 * LTV and the market's liquidation LTV.
 */
export function evaluateLtvSweep(params: {
  underlyingApy: number;
  borrowApy: number;
  liquidationLtv: number;
  candidates: number[];
  /** Minimum gap to liquidation, in pct points (decimal). Default 10pp. */
  minLiquidationGap?: number;
}): LtvCandidate[] {
  const { underlyingApy, borrowApy, liquidationLtv, candidates } = params;
  const minGap = params.minLiquidationGap ?? 0.10;

  const evaluated = candidates
    .filter((ltv) => ltv >= 0 && ltv < liquidationLtv)
    .map((ltv) => {
      const m = loopMath(underlyingApy, ltv, borrowApy);
      return {
        ltv,
        netApy: m.netApy,
        leverageMultiple: m.leverageMultiple,
        liquidationGap: liquidationLtv - ltv,
        recommended: false,
      };
    });

  // Recommend the highest net APY candidate that respects the safety gap.
  let bestIdx = -1;
  let bestNet = -Infinity;
  for (let i = 0; i < evaluated.length; i++) {
    const c = evaluated[i];
    if (c.liquidationGap >= minGap && c.netApy > bestNet) {
      bestNet = c.netApy;
      bestIdx = i;
    }
  }
  if (bestIdx >= 0) evaluated[bestIdx].recommended = true;

  return evaluated.sort((a, b) => a.ltv - b.ltv);
}

/* ============================================================
   Portfolio aggregation
   ============================================================ */

export interface PortfolioContribution {
  id: AwyLegId;
  weightBps: number;
  underlyingApy: number;
  ltv: number;
  borrowApy: number;
  net: LoopResult;
  /** weight × net APY contribution. */
  contributionApy: number;
}

export interface PortfolioBacktest {
  contributions: PortfolioContribution[];
  /** Blended portfolio net APY across all legs (decimal). */
  netApy: number;
  /** Sum of weighted gross APYs (decimal). */
  grossApy: number;
  /** Sum of weighted borrow drag (decimal). */
  borrowDrag: number;
}

export function buildPortfolioBacktest(legs: LegInputs[]): PortfolioBacktest {
  const totalWeightBps = legs.reduce((s, l) => s + l.weightBps, 0);
  if (totalWeightBps === 0) {
    return { contributions: [], netApy: 0, grossApy: 0, borrowDrag: 0 };
  }

  let netApy = 0;
  let grossApy = 0;
  let borrowDrag = 0;
  const contributions: PortfolioContribution[] = legs.map((leg) => {
    // Unlevered leg: skip the loop math, just attribute its underlying APY.
    if (leg.ltv === 0) {
      const net: LoopResult = {
        leverageMultiple: 1,
        grossApy: leg.underlyingApy,
        borrowDrag: 0,
        netApy: leg.underlyingApy,
      };
      const contributionApy = (leg.weightBps / 10_000) * net.netApy;
      netApy += contributionApy;
      grossApy += (leg.weightBps / 10_000) * net.grossApy;
      return {
        id: leg.id,
        weightBps: leg.weightBps,
        underlyingApy: leg.underlyingApy,
        ltv: 0,
        borrowApy: 0,
        net,
        contributionApy,
      };
    }

    const net = loopMath(leg.underlyingApy, leg.ltv, leg.borrowApy);
    const w = leg.weightBps / 10_000;
    const contributionApy = w * net.netApy;
    netApy += contributionApy;
    grossApy += w * net.grossApy;
    borrowDrag += w * net.borrowDrag;
    return {
      id: leg.id,
      weightBps: leg.weightBps,
      underlyingApy: leg.underlyingApy,
      ltv: leg.ltv,
      borrowApy: leg.borrowApy,
      net,
      contributionApy,
    };
  });

  return { contributions, netApy, grossApy, borrowDrag };
}

/* ============================================================
   Per-leg defaults — sourced from the AWY-model notebooks.
   ============================================================ */

export interface LegLoopConfig {
  /** Default static LTV used to build the headline leveraged APY. */
  defaultLtv: number;
  /** Conservative liquidation LTV per market — anything ≥ this auto-deleverages. */
  liquidationLtv: number;
  /** LTV candidates to display in the sweep UI. */
  ltvCandidates: number[];
  /** Kamino market address (for use by the borrow client). Empty for unlevered legs. */
  kaminoMarket: string;
  /** True if the leg should be looped in the leveraged blend. */
  leveraged: boolean;
}

/**
 * Per-leg loop configuration. Defaults are conservative — picked from the safer
 * end of each notebook's sweep range so the headline APY doesn't oversell the
 * risk surface. Liquidation LTVs match the markets' published parameters.
 */
export const LEG_LOOP_CONFIG: Record<AwyLegId, LegLoopConfig> = {
  prime: {
    defaultLtv: 0.67,
    liquidationLtv: 0.85,
    ltvCandidates: [0.5, 0.67, 0.8, 0.85],
    kaminoMarket: "CqAoLuqWtavaVE8deBjMKe8ZfSt9ghR6Vb8nfsyabyHA",
    leveraged: true,
  },
  onyc: {
    defaultLtv: 0.5,
    liquidationLtv: 0.7,
    ltvCandidates: [0.25, 0.35, 0.5, 0.6, 0.65],
    kaminoMarket: "47tfyEG9SsdEnUm9cw5kY9BXngQGqu3LBoop9j5uTAv8",
    leveraged: true,
  },
  "syrup-usdc": {
    defaultLtv: 0.5,
    liquidationLtv: 0.85,
    ltvCandidates: [0.25, 0.5, 0.67, 0.8],
    kaminoMarket: "6WEGfej9B9wjxRs6t4BYpb9iCXd8CpTpJ8fVSNzHCC5y",
    leveraged: true,
  },
  solomon: {
    // Solomon's basis trade embeds perp leverage internally — we don't loop on top.
    defaultLtv: 0,
    liquidationLtv: 0,
    ltvCandidates: [],
    kaminoMarket: "",
    leveraged: false,
  },
};
