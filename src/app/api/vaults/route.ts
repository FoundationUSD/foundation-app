import { NextResponse } from "next/server";
import { isSupabaseConfigured, supabaseAdmin } from "@/lib/supabase-server";
import { VAULT_CONFIGS } from "@/lib/constants";

export const dynamic = "force-dynamic";

function getConfigFallback() {
  return Object.values(VAULT_CONFIGS).map((v) => ({
    id: v.id,
    type: "native" as const,
    name: v.name,
    symbol: v.symbol,
    underlying: v.underlying,
    mintAddress: v.mint,
    vaultAuthority: "",
    rateBps: v.rateBps,
    apy: v.apy,
    tvlUsdc: 0,
    totalDeposits: 0,
    createdAt: new Date().toISOString(),
  }));
}

export async function GET() {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ success: true, data: getConfigFallback() });
  }

  try {
    const { data: dbVaults } = await supabaseAdmin.from("sol_vaults").select("*");

    if (dbVaults && dbVaults.length > 0) {
      return NextResponse.json({
        success: true,
        data: dbVaults.map((v) => ({
          id: v.id,
          type: "native" as const,
          name: v.name,
          symbol: v.id,
          underlying: v.underlying,
          mintAddress: v.mint_address,
          vaultAuthority: v.vault_authority,
          rateBps: v.rate_bps,
          apy: Number(v.apy),
          tvlUsdc: Number(v.tvl_usdc || 0),
          totalDeposits: Number(v.total_deposits || 0),
          createdAt: v.created_at,
        })),
      });
    }

    return NextResponse.json({ success: true, data: getConfigFallback() });
  } catch (error) {
    console.error("GET /api/vaults error:", error);
    return NextResponse.json({ success: true, data: getConfigFallback() });
  }
}
