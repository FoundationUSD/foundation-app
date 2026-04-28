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
import { getOnycData } from "./onyc";
import { getPrimeData } from "./prime";
import { getSyrupUsdcData } from "./maple";
import { getSolomonAwyLegData } from "./solomon";

export type AwyLegId = "onyc" | "prime" | "syrup-usdc" | "solomon";

export interface AwyLegSpec {
  id: AwyLegId;
  asset: string;
  issuer: string;
  weightBps: number;
  baseApy: number;
  riskDriver: string;
  description: string;
}

/**
 * Source of truth for the AWY basket. Weights must sum to 10_000 bps.
 * Quarterly rebalance to these targets; drift > 3% per leg also triggers rebalance.
 */
export const AWY_COMPOSITION: AwyLegSpec[] = [
  {
    id: "onyc",
    asset: "ONyc",
    issuer: "OnRe",
    weightBps: 3500,
    baseApy: 11.0,
    riskDriver: "Actuarial events",
    description: "Reinsurance premiums + collateral yield. Bermuda BMA-regulated reinsurer.",
  },
  {
    id: "prime",
    asset: "PRIME",
    issuer: "Figure / Hastra",
    weightBps: 3000,
    baseApy: 7.5,
    riskDriver: "US rate cycle",
    description: "Tokenized HELOCs. Backed by Figure's $19B+ on-chain loan book.",
  },
  {
    id: "syrup-usdc",
    asset: "syrupUSDC",
    issuer: "Maple Finance",
    weightBps: 2500,
    baseApy: 6.5,
    riskDriver: "Crypto borrowing demand",
    description: "Overcollateralized lending to institutional borrowers (~160% LTV BTC/ETH).",
  },
  {
    id: "solomon",
    asset: "USDv",
    issuer: "Solomon",
    weightBps: 1000,
    baseApy: 12.5,
    riskDriver: "Basis spread",
    description: "Delta-neutral basis trade on BTC/ETH/SOL. Funding-rate yield with embedded perp leverage internal to the strategy.",
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

/**
 * Fetch live per-leg data. Each reader is fault-tolerant — a single leg failing falls
 * back to its spec value rather than blowing up the whole basket. Total failure budget
 * is implicit: if every leg falls back, blendedBaseApy === specBlendedApy.
 */
export async function getAwyData(): Promise<AwyAggregateData> {
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
