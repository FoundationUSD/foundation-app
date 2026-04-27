/**
 * Amplify — leveraged versions of Foundation strategies.
 *
 * AWY-Amplified is the inaugural product: same RWA basket philosophy as AWY but
 * with looped leverage on the three credit legs (PRIME, ONyc, syrupUSDC). The
 * USDH (Solomon basis) leg stays unleveraged because basis trades already carry
 * embedded perp-leverage and stacking on top would multiply liquidation risk.
 *
 * Status: coming_soon — on-chain plumbing not yet provisioned. UI shows the
 * target composition + math so prospective depositors can size interest.
 */

export interface AmplifyLegSpec {
  id: "usdh" | "prime" | "onyc" | "syrup-usdc";
  asset: string;
  issuer: string;
  /** Weight of the basket in basis points (sums to 10_000). */
  weightBps: number;
  /** Whether this leg uses looped leverage. */
  leveraged: boolean;
  /** APY at maximum supported leverage (or unleveraged base APY when not looped). */
  maxApy: number;
  /** Expected APY after risk-adjusted target leverage (lower than max). */
  expectedApy: number;
  /** Risk driver — same taxonomy as AWY. */
  riskDriver: string;
  /** Short description of the leg. */
  description: string;
}

/**
 * Source of truth for AWY-Amplified composition. Net APY = sum(weight × expectedApy).
 */
export const AMPLIFY_AWY_COMPOSITION: AmplifyLegSpec[] = [
  {
    id: "usdh",
    asset: "USDH",
    issuer: "Solomon",
    weightBps: 2000,
    leveraged: false,
    maxApy: 9.0,
    expectedApy: 9.0,
    riskDriver: "Basis spread",
    description: "Delta-neutral basis trade on BTC/ETH/SOL. Already carries perp leverage internally.",
  },
  {
    id: "prime",
    asset: "PRIME",
    issuer: "Figure",
    weightBps: 2500,
    leveraged: true,
    maxApy: 13.8,
    expectedApy: 11.8,
    riskDriver: "US rate cycle",
    description: "Tokenized HELOCs, looped against USDC borrow on Kamino.",
  },
  {
    id: "onyc",
    asset: "ONyc",
    issuer: "OnRe",
    weightBps: 3500,
    leveraged: true,
    maxApy: 15.5,
    expectedApy: 13.5,
    riskDriver: "Actuarial events",
    description: "Reinsurance receipts, looped against USDC borrow.",
  },
  {
    id: "syrup-usdc",
    asset: "syrupUSDC",
    issuer: "Maple",
    weightBps: 2000,
    leveraged: true,
    maxApy: 11.5,
    expectedApy: 9.5,
    riskDriver: "Crypto borrowing demand",
    description: "Overcollateralized institutional lending, looped against USDC borrow.",
  },
];

const _w = AMPLIFY_AWY_COMPOSITION.reduce((s, l) => s + l.weightBps, 0);
if (_w !== 10_000) throw new Error(`AMPLIFY_AWY_COMPOSITION weights sum to ${_w}, must be 10_000`);

/** Net APY = Σ (weight × expectedApy). Currently ~11.38%. */
export function getAmplifyAwyNetApy(): number {
  const net = AMPLIFY_AWY_COMPOSITION.reduce(
    (s, l) => s + (l.expectedApy * l.weightBps) / 10_000,
    0,
  );
  return Math.round(net * 100) / 100;
}

/** Per-leg contribution in percentage points (weight × expectedApy / 10_000). */
export function getLegContribution(leg: AmplifyLegSpec): number {
  return Math.round(((leg.expectedApy * leg.weightBps) / 10_000) * 100) / 100;
}

export interface AmplifyVault {
  id: string;
  name: string;
  strategy: string;
  description: string;
  /** Net APY (sum of contributions). */
  netApy: number;
  /** Receipt token symbol (Token-2022 InterestBearing once provisioned). */
  receiptToken: string;
  riskTier: "moderate" | "growth";
  status: "live" | "coming_soon";
  logoSrc: string;
  composition: AmplifyLegSpec[];
}

export const AMPLIFY_VAULTS: AmplifyVault[] = [
  {
    id: "amp-awy",
    name: "Foundation × AWY (Amplified)",
    strategy: "All-Weather Yield · Leveraged",
    description:
      "Looped version of the AWY basket. Three credit legs (PRIME, ONyc, syrupUSDC) are levered against USDC borrow on Kamino; the basis leg (USDH) stays unleveraged. Targets ~11.4% net APY.",
    netApy: getAmplifyAwyNetApy(),
    receiptToken: "awylUSD",
    riskTier: "growth",
    status: "coming_soon",
    logoSrc: "/assets/awy_l.png",
    composition: AMPLIFY_AWY_COMPOSITION,
  },
];
