"use client";

import { useEffect, useState } from "react";

interface GeoState {
  loading: boolean;
  country: string | null;
  restricted: boolean;
  reason?: string;
}

let _cache: GeoState | null = null;
let _inflight: Promise<GeoState> | null = null;

async function fetchGeo(): Promise<GeoState> {
  try {
    const res = await fetch("/api/geo", { cache: "no-store" });
    if (!res.ok) return { loading: false, country: null, restricted: false };
    const json = (await res.json()) as Omit<GeoState, "loading">;
    return { loading: false, ...json };
  } catch {
    return { loading: false, country: null, restricted: false };
  }
}

/**
 * Visitor geo state, cached for the page session. Used by deposit forms with
 * jurisdictional restrictions (e.g. AWY → ONyc mint, geofenced from US).
 *
 * Fail-open by design: if the lookup fails, `restricted` is false and the
 * deposit proceeds. The on-chain program enforces the actual gate; this hook
 * is a UX/compliance courtesy.
 */
export function useGeoGate(): GeoState {
  const [state, setState] = useState<GeoState>(_cache ?? {
    loading: true,
    country: null,
    restricted: false,
  });

  useEffect(() => {
    if (_cache) {
      setState(_cache);
      return;
    }
    if (!_inflight) _inflight = fetchGeo();
    _inflight.then((s) => {
      _cache = s;
      setState(s);
    });
  }, []);

  return state;
}
