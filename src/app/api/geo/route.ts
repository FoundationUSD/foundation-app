import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Lightweight visitor geo check used for compliance gates on legs that have
 * geographic restrictions (notably ONyc's permissionless mint, which is
 * geofenced from US persons per OnRe's Global Access terms).
 *
 * Resolution order:
 *   1. Cloudflare's `cf-ipcountry` header (if proxied through CF)
 *   2. Vercel's `x-vercel-ip-country` header
 *   3. ipapi.co lookup keyed on the visitor's IP (free tier, ~30k/day)
 *
 * Returns `{ country: "XX" | null, restricted: boolean, reason?: string }`.
 * `restricted` is true for sanctioned / blocked jurisdictions for AWY's
 * geofenced legs. The UI surfaces a non-actionable banner — it does not block
 * deposits server-side (the on-chain ONyc mint will reject US persons via
 * its own approver list when applicable).
 */

const RESTRICTED_COUNTRIES = new Set([
  "US", // ONyc permissionless mint geofence
  "CU", "IR", "KP", "SY", "RU", "BY", // OFAC standard
]);

function readIp(req: NextRequest): string | null {
  const h = req.headers;
  const xff = h.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  return h.get("x-real-ip") ?? h.get("cf-connecting-ip") ?? null;
}

async function lookupViaIpapi(ip: string): Promise<string | null> {
  try {
    const res = await fetch(`https://ipapi.co/${encodeURIComponent(ip)}/country/`, {
      // Plain-text body, ~2 chars. ipapi.co tolerates no auth on the country endpoint.
      next: { revalidate: 86_400 },
    });
    if (!res.ok) return null;
    const text = (await res.text()).trim().toUpperCase();
    return /^[A-Z]{2}$/.test(text) ? text : null;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const headerCountry =
    req.headers.get("cf-ipcountry") ||
    req.headers.get("x-vercel-ip-country") ||
    null;

  let country = headerCountry?.toUpperCase() ?? null;

  if (!country) {
    const ip = readIp(req);
    if (ip && ip !== "127.0.0.1" && ip !== "::1") {
      country = await lookupViaIpapi(ip);
    }
  }

  const restricted = !!country && RESTRICTED_COUNTRIES.has(country);
  return NextResponse.json({
    country,
    restricted,
    reason: restricted ? "Restricted jurisdiction (ONyc compliance)" : undefined,
  });
}
