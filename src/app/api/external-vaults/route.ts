import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const externalVaults = [];

  const results = await Promise.allSettled([
    (async () => {
      const { getSolomonData } = await import("@/lib/integrations/solomon");
      return { type: "solomon" as const, data: await getSolomonData() };
    })(),
    (async () => {
      const { getKaminoRWAMarkets } = await import("@/lib/integrations/kamino");
      return { type: "kamino" as const, data: await getKaminoRWAMarkets() };
    })(),
    (async () => {
      const { getTopDriftVaults } = await import("@/lib/integrations/drift");
      return { type: "drift" as const, data: await getTopDriftVaults(3) };
    })(),
  ]);

  for (const result of results) {
    if (result.status !== "fulfilled") continue;
    const { type, data } = result.value;

    if (type === "solomon") {
      const sol = data as Awaited<ReturnType<typeof import("@/lib/integrations/solomon")["getSolomonData"]>>;
      externalVaults.push({
        id: "solomon-susdv",
        protocol: "solomon",
        name: "sUSDV Staking",
        description: `${sol.estimatedApy}% APY — basis trading on BTC/ETH/SOL. Direct on-chain staking.`,
        apy: sol.estimatedApy,
        tvl: sol.usdvSupply,
        slug: "solomon",
        depositEnabled: true,
      });
    }

    if (type === "kamino") {
      const markets = data as Awaited<ReturnType<typeof import("@/lib/integrations/kamino")["getKaminoRWAMarkets"]>>;
      for (const m of markets.filter((m) => m.tvl > 100_000)) {
        externalVaults.push({
          id: `kamino-${m.market.id}`,
          protocol: "kamino",
          name: `Kamino ${m.market.name}`,
          description: `${m.market.description} · ${m.topSupplyApy > 0 ? `${m.topSupplyApy.toFixed(2)}% APY` : "live rates"}`,
          apy: m.topSupplyApy,
          tvl: m.tvl,
          slug: "kamino",
          depositEnabled: true,
        });
      }
    }

    if (type === "drift") {
      const vaults = data as Awaited<ReturnType<typeof import("@/lib/integrations/drift")["getTopDriftVaults"]>>;
      if (vaults.length > 0) {
        const best = vaults[0];
        externalVaults.push({
          id: `drift-vaults`,
          protocol: "drift",
          name: "Drift Managed Vaults",
          description: `${vaults.length}+ vaults — top: ${best.apy30d.toFixed(1)}% (30d). SDK deposit.`,
          apy: best.apy30d,
          tvl: 0,
          slug: "drift",
          depositEnabled: true,
        });
      }
    }
  }

  return NextResponse.json({ success: true, data: externalVaults });
}
