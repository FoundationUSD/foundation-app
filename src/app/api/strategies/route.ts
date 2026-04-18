import { NextResponse } from "next/server";
import { FOUNDATION_VAULTS } from "@/lib/vaults";
import { getOroData } from "@/lib/integrations/oro";
import { isSupabaseConfigured, supabaseAdmin } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

const KAMINO_API = "https://api.kamino.finance";

/**
 * Net USDC deposited per vault = sum(deposits) − sum(withdrawals), in USD.
 * Returns an empty map when Supabase isn't configured so the UI can degrade gracefully.
 */
async function fetchVaultTvlMap(): Promise<Record<string, number>> {
  if (!isSupabaseConfigured()) return {};
  try {
    const [depRes, wdRes] = await Promise.all([
      supabaseAdmin.from("sol_deposits").select("vault_id, usdc_amount"),
      supabaseAdmin.from("sol_withdrawals").select("vault_id, usdc_returned"),
    ]);

    const net: Record<string, number> = {};
    for (const d of (depRes.data ?? []) as Array<{ vault_id: string; usdc_amount: number | string }>) {
      net[d.vault_id] = (net[d.vault_id] || 0) + Number(d.usdc_amount || 0);
    }
    for (const w of (wdRes.data ?? []) as Array<{ vault_id: string; usdc_returned: number | string }>) {
      net[w.vault_id] = (net[w.vault_id] || 0) - Number(w.usdc_returned || 0);
    }
    // Stored in 6-decimal USDC base units → convert to USD.
    for (const k of Object.keys(net)) net[k] = Math.max(0, net[k] / 1e6);
    return net;
  } catch (err) {
    console.error("fetchVaultTvlMap error:", err);
    return {};
  }
}

async function fetchKaminoApy(): Promise<number> {
  try {
    const res = await fetch(
      `${KAMINO_API}/kamino-market/CqAoLuqWtavaVE8deBjMKe8ZfSt9ghR6Vb8nfsyabyHA/reserves/metrics`,
      { next: { revalidate: 300 } },
    );
    if (!res.ok) return 0;
    const data = await res.json();
    if (!Array.isArray(data)) return 0;
    const usdc = data.find((r: Record<string, unknown>) =>
      String(r.liquidityToken || "").toUpperCase() === "USDC",
    );
    return usdc ? Number(usdc.supplyApy || 0) * 100 : 0;
  } catch {
    return 0;
  }
}

async function fetchDriftApy(): Promise<number> {
  try {
    const res = await fetch("https://app.drift.trade/api/vaults", {
      next: { revalidate: 300 },
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; FoundationApp/1.0)",
        Accept: "application/json",
      },
    });
    if (!res.ok) return 0;
    const data = await res.json();
    const rwaAddresses = [
      "G3RT2wdEYCphzcvXEHb8u4Yc4ZRscsQ1KRYywdBjgUZp",
      "5otPTvEkpk9CQGqnSfgo7QSYXYPAyf76sUgzVzhvNSQk",
    ];
    for (const addr of rwaAddresses) {
      const v = data[addr];
      if (v?.apys?.["30d"] && v.apys["30d"] > 0 && v.apys["30d"] < 100) {
        return v.apys["30d"];
      }
    }
    return 0;
  } catch {
    return 0;
  }
}

/**
 * Gold price from ORO's authoritative tradebook (source of truth for their pricing).
 * Returns USD per oz. Falls back to 0 on failure; callers decide how to degrade.
 */
async function fetchOroGoldPrice(): Promise<number> {
  try {
    const res = await fetch("https://oro-tradebook-devnet.up.railway.app/api/trading/gold/price", {
      next: { revalidate: 600 },
    });
    if (!res.ok) return 0;
    const data = await res.json();
    // Response shape: { success: true, data: { price: "4794.03", unit: "troy_ounce", ... } }
    const price = Number(data?.data?.price ?? data?.price ?? data?.usdPrice ?? 0);
    return Number.isFinite(price) && price > 0 ? price : 0;
  } catch {
    return 0;
  }
}

export async function GET() {
  try {
    const [kaminoApy, driftApy, oroGoldPrice, oroData, tvlMap] = await Promise.all([
      fetchKaminoApy(),
      fetchDriftApy(),
      fetchOroGoldPrice(),
      getOroData(),
      fetchVaultTvlMap(),
    ]);

    const vaults = FOUNDATION_VAULTS.map((v) => {
      const tvlUsd = tvlMap[v.id] ?? 0;
      if (v.protocol === "kamino" && kaminoApy > 0) return { ...v, apy: kaminoApy, tvlUsd };
      if (v.protocol === "drift" && driftApy > 0) return { ...v, apy: driftApy, tvlUsd };
      if (v.protocol === "oro") {
        // Prefer ORO's authoritative API; fall back to Jupiter-derived price.
        const spot = oroGoldPrice || oroData.pricePerGoldUsd;
        return {
          ...v,
          apy: v.apy, // keep 3.5% target until staking lands
          tvlUsd,
          meta: {
            goldPriceUsd: spot,
            goldSupply: oroData.goldSupply,
            marketCapUsd: oroData.goldSupply * spot,
            priceImpactBps1K: oroData.priceImpactBps1K,
            priceSource: oroGoldPrice > 0 ? "oro-tradebook" : "jupiter",
          },
        };
      }
      return { ...v, tvlUsd };
    });

    return NextResponse.json({ success: true, data: vaults });
  } catch (error) {
    console.error("GET /api/strategies error:", error);
    return NextResponse.json({ success: true, data: FOUNDATION_VAULTS });
  }
}
