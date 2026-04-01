import { NextResponse } from "next/server";
import { FOUNDATION_VAULTS } from "@/lib/vaults";

export const dynamic = "force-dynamic";

const KAMINO_API = "https://api.kamino.finance";

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
    // Look for known Gauntlet RWA vaults
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

export async function GET() {
  try {
    const [kaminoApy, driftApy] = await Promise.all([
      fetchKaminoApy(),
      fetchDriftApy(),
    ]);

    const vaults = FOUNDATION_VAULTS.map((v) => ({
      ...v,
      apy:
        v.protocol === "kamino" && kaminoApy > 0
          ? kaminoApy
          : v.protocol === "drift" && driftApy > 0
            ? driftApy
            : v.apy,
    }));

    return NextResponse.json({ success: true, data: vaults });
  } catch (error) {
    console.error("GET /api/strategies error:", error);
    return NextResponse.json({ success: true, data: FOUNDATION_VAULTS });
  }
}
