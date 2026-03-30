import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const externalVaults = [];

  // Fetch all in parallel — dynamic imports to avoid build-time WASM issues
  const results = await Promise.allSettled([
    // Solomon — lightweight, on-chain reads only
    (async () => {
      const { getSolomonData } = await import("@/lib/integrations/solomon");
      return { type: "solomon" as const, data: await getSolomonData() };
    })(),
    // Kamino — heavy SDK with WASM deps, may fail
    (async () => {
      const { getKaminoVaultData } = await import("@/lib/integrations/kamino");
      return { type: "kamino" as const, data: await getKaminoVaultData() };
    })(),
    // Drift — REST API, lightweight
    (async () => {
      const { getDriftVaults } = await import("@/lib/integrations/drift");
      return { type: "drift" as const, data: await getDriftVaults() };
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
        name: "sUSDV",
        description: "Yield-bearing stablecoin — basis trading on BTC/ETH/SOL",
        apy: sol.estimatedApy,
        tvl: sol.usdvSupply,
        externalUrl: "https://app.solomonlabs.org",
        depositEnabled: false,
      });
    }

    if (type === "kamino") {
      const k = data as Awaited<ReturnType<typeof import("@/lib/integrations/kamino")["getKaminoVaultData"]>>;
      externalVaults.push({
        id: "kamino-lending",
        protocol: "kamino",
        name: "Kamino Lending",
        description: `USDC lending — ${k.reserves.length} reserves available`,
        apy: k.apy,
        tvl: k.tvl,
        externalUrl: k.url,
        depositEnabled: false, // TX builder uses @solana/kit types, needs migration
      });
    }

    if (type === "drift") {
      const vaults = data as Awaited<ReturnType<typeof import("@/lib/integrations/drift")["getDriftVaults"]>>;
      const topVaults = vaults
        .filter((v) => v.tvl > 0)
        .sort((a, b) => b.tvl - a.tvl)
        .slice(0, 3);

      for (const v of topVaults) {
        externalVaults.push({
          id: `drift-${v.address.slice(0, 8)}`,
          protocol: "drift",
          name: v.name,
          description: `Managed vault — ${v.manager ? v.manager.slice(0, 8) + "..." : "Drift"}`,
          apy: v.apy,
          tvl: v.tvl,
          externalUrl: `https://app.drift.trade/vaults/${v.address}`,
          depositEnabled: false,
        });
      }
    }
  }

  return NextResponse.json({ success: true, data: externalVaults });
}
