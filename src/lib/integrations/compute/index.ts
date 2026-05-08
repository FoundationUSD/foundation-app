/**
 * Compute Vault — Foundation Compute Yield (FCY) index.
 *
 * A rules-based index tracking yield from on-chain AI compute infrastructure debt.
 *
 * Initial constituents (v1):
 *   GAIB    — GPU-backed datacenter financing
 *   sUSDai  — GPU-collateralized lending (USD.AI)
 *
 * Roadmap: a structurally different third constituent (datacenter construction debt)
 * once a comparable on-chain primitive is available.
 *
 * Methodology (headline yield):
 *   - Excludes token emissions, points, promotional incentives
 *   - Tracks yield from interest payments, lease payments, debt repayments
 *   - Allocation rebalanced per published rules; concentration caps disclosed
 *
 * This module is currently spec-only. When GAIB / USD.AI publish public APY feeds,
 * wire them into `getComputeData()` following the AWY pattern (per-leg fault-tolerant
 * fetch with spec-fallback). Until then, callers should use `getSpecBlendedApy()`.
 */

export type ComputeConstituentId = "gaib" | "susdai" | "datacenter-debt";

export interface ComputeConstituentSpec {
  id: ComputeConstituentId;
  asset: string;
  issuer: string;
  /** Allocation in basis points. v1 constituents must sum to 10_000. */
  weightBps: number;
  /** Headline expected APY for the constituent. Spec value used until live feed lands. */
  baseApy: number;
  /** Upper end of the published range — used for visualizing dispersion. */
  maxApy: number;
  riskDriver: string;
  description: string;
  /** True for constituents on the roadmap but not yet allocated. weightBps = 0. */
  roadmap: boolean;
  /** External docs / dashboard. */
  href?: string;
}

/**
 * Source of truth for FCY constituents. v1 weights must sum to 10_000 bps
 * (excluding roadmap entries, which are zero-weighted placeholders).
 *
 * Initial 60/40 split favors GAIB on the basis that GPU-backed datacenter financing
 * is the broader collateral category; sUSDai delivers complementary GPU-collateral
 * exposure. Methodology will be republished when a third constituent activates.
 */
export const COMPUTE_CONSTITUENTS: ComputeConstituentSpec[] = [
  {
    id: "gaib",
    asset: "GAIB",
    issuer: "GAIB",
    weightBps: 6000,
    baseApy: 18.0,
    maxApy: 25.0,
    riskDriver: "GPU-backed datacenter financing",
    description:
      "Exposure to GPU and datacenter financing facilities. Yield accrues from interest and lease payments on compute hardware deployed to neoclouds and AI infrastructure operators.",
    roadmap: false,
    href: "https://gaib.ai",
  },
  {
    id: "susdai",
    asset: "sUSDai",
    issuer: "USD.AI",
    weightBps: 4000,
    baseApy: 15.5,
    maxApy: 22.0,
    riskDriver: "GPU-collateralized lending",
    description:
      "GPU-collateralized lending infrastructure. Yield from overcollateralized loans where physical GPUs back outstanding USDC borrows for compute operators.",
    roadmap: false,
    href: "https://usd.ai",
  },
  {
    id: "datacenter-debt",
    asset: "Datacenter Debt",
    issuer: "TBD",
    weightBps: 0,
    baseApy: 0,
    maxApy: 0,
    riskDriver: "Datacenter construction & power",
    description:
      "Roadmap. A structurally different third constituent — likely datacenter construction debt or power infrastructure financing — to be added once a comparable on-chain primitive becomes available.",
    roadmap: true,
  },
];

const _activeWeightsCheck = COMPUTE_CONSTITUENTS.filter((c) => !c.roadmap).reduce(
  (s, c) => s + c.weightBps,
  0,
);
if (_activeWeightsCheck !== 10_000) {
  throw new Error(
    `COMPUTE_CONSTITUENTS active weights sum to ${_activeWeightsCheck}, must be 10_000`,
  );
}

/**
 * Fees published in the FCY methodology.
 *   - 10% of yield is collected as management fee
 *   - 0.3% mint/redeem fee on the secondary market
 */
export const COMPUTE_FEES = {
  managementBps: 1000, // 10% of yield
  mintRedeemBps: 30, // 0.3%
} as const;

/**
 * Spec-blended APY — deterministic, no I/O. Used by tests, fallback paths, and the
 * landing page when live feeds aren't available. Computed at runtime from
 * COMPUTE_CONSTITUENTS weights × baseApy. Excludes roadmap entries (weight = 0).
 */
export function getSpecBlendedApy(): number {
  const total = COMPUTE_CONSTITUENTS.reduce(
    (sum, c) => sum + (c.baseApy * c.weightBps) / 10_000,
    0,
  );
  return Math.round(total * 100) / 100;
}

export interface ComputeAggregateData {
  constituents: ComputeConstituentSpec[];
  blendedBaseApy: number;
  specBlendedApy: number;
  fetchedAt: number;
}

/**
 * Fetch live constituent data. Currently returns spec values — wire GAIB and USD.AI
 * APY feeds here following the AWY per-leg pattern when public APIs are available.
 */
export async function getComputeData(): Promise<ComputeAggregateData> {
  const spec = getSpecBlendedApy();
  return {
    constituents: COMPUTE_CONSTITUENTS,
    blendedBaseApy: spec,
    specBlendedApy: spec,
    fetchedAt: Date.now(),
  };
}
