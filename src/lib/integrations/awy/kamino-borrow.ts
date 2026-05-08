/**
 * Kamino borrow rate client — server-only.
 *
 * Used by the AWY leverage layer to fetch live borrow APY history per Kamino
 * market and pick the cheapest borrow asset per leg. Two endpoints:
 *
 *   GET https://api.kamino.finance/kamino-market/{market}/reserves/metrics
 *   GET https://api.kamino.finance/kamino-market/{market}/reserves/{reserve}/metrics/history?frequency=hour&start=…&end=…
 *
 * Same shape used by the AWY-model notebooks. Every call is wrapped in a
 * timeout + try/catch so a missing or slow upstream falls back to spec
 * values rather than failing the page render.
 */

import type { BorrowRatePoint } from "./leverage";

const KAMINO_API = "https://api.kamino.finance";
const FETCH_TIMEOUT_MS = 8_000;
const DEFAULT_HISTORY_DAYS = 30;
const DEFAULT_BORROW_CANDIDATES = ["USDC", "USDS", "PYUSD", "CASH"] as const;

export type BorrowAsset = (typeof DEFAULT_BORROW_CANDIDATES)[number];

export interface ReserveMeta {
  reserveId: string;
  symbol: string;
  /** Latest borrow APY published in the metrics endpoint, if available. */
  borrowApy: number;
}

export interface BorrowAssetPick {
  asset: BorrowAsset | string;
  reserveId: string;
  meanApy: number;
  stdApy: number;
  latestApy: number;
  source: "live" | "spec-fallback";
}

async function fetchJsonWithTimeout(url: string, timeoutMs = FETCH_TIMEOUT_MS): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "fdn-app/1.0" },
      next: { revalidate: 600 },
    });
    if (!res.ok) throw new Error(`kamino: HTTP ${res.status} for ${url}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * List the reserves in a Kamino market with their latest borrow APY.
 * Returns [] on any failure — callers fall back to spec values.
 */
export async function fetchReserves(market: string): Promise<ReserveMeta[]> {
  if (!market) return [];
  try {
    const payload = await fetchJsonWithTimeout(
      `${KAMINO_API}/kamino-market/${market}/reserves/metrics`,
    );
    if (!Array.isArray(payload)) return [];
    return payload
      .map((r): ReserveMeta | null => {
        const symbol = String(
          (r as Record<string, unknown>).liquidityToken ??
            (r as Record<string, unknown>).tokenSymbol ??
            (r as Record<string, unknown>).symbol ??
            (r as Record<string, unknown>).mintSymbol ??
            "",
        ).toUpperCase();
        const reserveId = String(
          (r as Record<string, unknown>).reserve ??
            (r as Record<string, unknown>).reserveAddress ??
            (r as Record<string, unknown>).reserveId ??
            (r as Record<string, unknown>).address ??
            "",
        );
        const borrowApy = Number(
          (r as Record<string, unknown>).borrowApy ??
            (r as Record<string, unknown>).borrow_apy ??
            0,
        );
        if (!symbol || !reserveId) return null;
        return { symbol, reserveId, borrowApy };
      })
      .filter((r): r is ReserveMeta => r !== null);
  } catch (err) {
    console.warn(`[kamino-borrow] fetchReserves failed for ${market}:`, err);
    return [];
  }
}

/**
 * Hourly borrow APY history for a single reserve. Returns [] on any failure.
 */
export async function fetchBorrowRateHistory(
  market: string,
  reserve: string,
  startMs: number,
  endMs: number,
  frequency: "hour" | "day" = "hour",
): Promise<BorrowRatePoint[]> {
  if (!market || !reserve) return [];
  try {
    const start = new Date(startMs).toISOString();
    const end = new Date(endMs).toISOString();
    const payload = await fetchJsonWithTimeout(
      `${KAMINO_API}/kamino-market/${market}/reserves/${reserve}/metrics/history?frequency=${frequency}&start=${start}&end=${end}`,
    );
    if (!Array.isArray(payload)) return [];
    return payload
      .map((row): BorrowRatePoint | null => {
        const r = row as Record<string, unknown>;
        const ts = Date.parse(String(r.timestamp ?? r.date ?? r.time ?? ""));
        const borrow = Number(
          r.borrow_interest_apy ??
            r.borrowInterestApy ??
            r.borrowApy ??
            r.borrow_apy ??
            NaN,
        );
        if (!Number.isFinite(ts) || !Number.isFinite(borrow)) return null;
        return { timestamp: ts, borrowApy: borrow };
      })
      .filter((p): p is BorrowRatePoint => p !== null);
  } catch (err) {
    console.warn(`[kamino-borrow] fetchBorrowRateHistory failed for ${market}/${reserve}:`, err);
    return [];
  }
}

/**
 * Fetch borrow rate history for each candidate asset in a market and rank by
 * mean APY (lowest = cheapest = best loop currency). Falls back to a spec
 * value if every fetch fails.
 *
 * Result is the chosen borrow asset for the leg. The notebook does the same
 * thing (`kamino_*_borrow_alternatives.ipynb` -> ranking table -> conclusion).
 */
export async function pickCheapestBorrow(
  market: string,
  options: {
    candidates?: readonly string[];
    historyDays?: number;
    /** Spec fallback APY when no live data is available. */
    specFallbackApy: number;
  },
): Promise<BorrowAssetPick> {
  const candidates = options.candidates ?? DEFAULT_BORROW_CANDIDATES;
  const historyDays = options.historyDays ?? DEFAULT_HISTORY_DAYS;

  const reserves = await fetchReserves(market);
  if (reserves.length === 0) {
    return {
      asset: "USDC",
      reserveId: "",
      meanApy: options.specFallbackApy,
      stdApy: 0,
      latestApy: options.specFallbackApy,
      source: "spec-fallback",
    };
  }

  const now = Date.now();
  const start = now - historyDays * 86_400_000;

  const matched = reserves.filter((r) =>
    candidates.some((c) => c.toUpperCase() === r.symbol),
  );
  const targets = matched.length > 0 ? matched : reserves.slice(0, 1);

  type Candidate = {
    asset: string;
    reserveId: string;
    meanApy: number;
    stdApy: number;
    latestApy: number;
    points: number;
  };

  const evaluations = await Promise.all(
    targets.map(async (r): Promise<Candidate> => {
      const hist = await fetchBorrowRateHistory(market, r.reserveId, start, now);
      if (hist.length === 0) {
        return {
          asset: r.symbol,
          reserveId: r.reserveId,
          meanApy: r.borrowApy || options.specFallbackApy,
          stdApy: 0,
          latestApy: r.borrowApy || options.specFallbackApy,
          points: 0,
        };
      }
      const apys = hist.map((p) => p.borrowApy);
      const mean = apys.reduce((s, v) => s + v, 0) / apys.length;
      const variance = apys.reduce((s, v) => s + (v - mean) * (v - mean), 0) / apys.length;
      return {
        asset: r.symbol,
        reserveId: r.reserveId,
        meanApy: mean,
        stdApy: Math.sqrt(variance),
        latestApy: hist[hist.length - 1].borrowApy,
        points: hist.length,
      };
    }),
  );

  // Lowest mean APY wins (matches notebook's ranking).
  const best = evaluations.reduce<Candidate | null>((acc, c) => {
    if (!acc) return c;
    return c.meanApy < acc.meanApy ? c : acc;
  }, null);

  if (!best) {
    return {
      asset: "USDC",
      reserveId: "",
      meanApy: options.specFallbackApy,
      stdApy: 0,
      latestApy: options.specFallbackApy,
      source: "spec-fallback",
    };
  }

  return {
    asset: best.asset,
    reserveId: best.reserveId,
    meanApy: best.meanApy,
    stdApy: best.stdApy,
    latestApy: best.latestApy,
    source: best.points > 0 ? "live" : "spec-fallback",
  };
}
