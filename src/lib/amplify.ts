/**
 * Amplify — leveraged versions of Foundation strategies.
 *
 * AWY-Amplified is the inaugural product: same RWA basket philosophy as AWY but
 * with looped leverage on the three credit legs (PRIME, ONyc, syrupUSDC). The
 * Solomon basis leg (USDv) stays unleveraged because basis trades already carry
 * embedded perp-leverage and stacking on top would multiply liquidation risk.
 *
 * Status: coming_soon — on-chain plumbing not yet provisioned. UI shows the
 * target composition + math so prospective depositors can size interest.
 */

export interface AmplifyLegSpec {
  id: "solomon" | "prime" | "onyc" | "syrup-usdc";
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
    id: "solomon",
    asset: "USDv",
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
  /** Short label shown above the title on cards (e.g. "All-Weather Yield · Leveraged"). */
  strategy: string;
  /** One-line summary used on cards. */
  shortDescription: string;
  /** Long-form description used on the flagship hero. */
  description: string;
  /** Net APY (sum of contributions). */
  netApy: number;
  /** Receipt token symbol (Token-2022 InterestBearing once provisioned). */
  receiptToken: string;
  /** Underlying-asset display string (e.g. "Looped: PRIME · ONyc · syrupUSDC"). */
  underlying: string;
  riskTier: "moderate" | "growth";
  status: "live" | "coming_soon";
  /** Source classification mirrors the Invest page filter. All current Amplify
   *  products are partner-built so none surface under "Foundation". */
  category: "foundation" | "partner";
  /** Display name of the source curator / counterparty. */
  curator: string;
  logoSrc: string;
  /** Whether this vault is the flagship Amplify preview at the top of the page. */
  flagship?: boolean;
  composition: AmplifyLegSpec[];
}

/**
 * Oro Amplified composition. Single-asset loop on $GOLD: deposit $GOLD as
 * collateral on Kamino, borrow USDC, swap into more $GOLD, repeat. The single
 * "leg" represents the looped position itself; the leverage ratio is the net
 * APY uplift over Oro's base 3.5%.
 */
export const AMPLIFY_ORO_COMPOSITION: AmplifyLegSpec[] = [
  {
    id: "solomon", // reusing the id type — single leg (placeholder identifier)
    asset: "$GOLD",
    issuer: "Oro",
    weightBps: 10_000,
    leveraged: true,
    maxApy: 9.5,
    expectedApy: 7.0,
    riskDriver: "Gold spot price",
    description: "Looped tokenized physical gold. Position multiplies exposure to spot gold while paying USDC borrow.",
  },
];

export const AMPLIFY_VAULTS: AmplifyVault[] = [
  {
    id: "amp-awy",
    name: "AWY Amplified",
    strategy: "All-Weather Yield · Leveraged",
    shortDescription:
      "Looped version of the four-leg AWY basket. Targets a net APY in the 11 percent range across three iterations of leverage on the credit legs.",
    description:
      "Looped version of the AWY basket. Three credit legs (PRIME, ONyc, syrupUSDC) are levered against USDC borrow on Kamino. The basis leg (USDv from Solomon) is left unleveraged because basis trades already embed perpetual futures leverage internally.",
    netApy: getAmplifyAwyNetApy(),
    receiptToken: "awylUSD",
    underlying: "Looped: PRIME · ONyc · syrupUSDC (basis unlevered)",
    riskTier: "growth",
    status: "coming_soon",
    category: "foundation",
    curator: "Foundation",
    logoSrc: "/assets/awy_l.png",
    flagship: true,
    composition: AMPLIFY_AWY_COMPOSITION,
  },
  {
    id: "amp-oro",
    name: "Oro Amplified",
    strategy: "Tokenized Gold · Leveraged",
    shortDescription:
      "Looped exposure to Oro's $GOLD. Multiplies upside (and downside) on physical gold while paying a USDC borrow rate against the position.",
    description:
      "Looped exposure to Oro's tokenized physical gold. Foundation deposits $GOLD as collateral on Kamino, borrows USDC, and recycles the proceeds back into $GOLD across multiple iterations. The position carries directional gold price risk in addition to the borrow cost.",
    netApy: 7.0,
    receiptToken: "oroLUSD",
    underlying: "Looped: $GOLD (LBMA-allocated physical gold)",
    riskTier: "growth",
    status: "coming_soon",
    category: "partner",
    curator: "Oro",
    logoSrc: "/partners/oro.png",
    composition: AMPLIFY_ORO_COMPOSITION,
  },
];
