import { NextRequest, NextResponse } from "next/server";
import { isSupabaseConfigured, supabaseAdmin } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

/**
 * GET /api/vaults/[id]/history?range=30d
 *
 * Returns time-series APY + TVL points for a vault from sol_nav_history.
 * Range: 7d | 30d | 90d | all (default 30d).
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ success: false, error: "Database not configured" }, { status: 503 });
  }
  const { id: vaultId } = await ctx.params;
  if (!vaultId) {
    return NextResponse.json({ success: false, error: "vaultId required" }, { status: 400 });
  }

  const range = (req.nextUrl.searchParams.get("range") || "30d").toLowerCase();
  const days = range === "7d" ? 7 : range === "90d" ? 90 : range === "all" ? 0 : 30;

  let query = supabaseAdmin
    .from("sol_nav_history")
    .select("recorded_at,apy,tvl_usdc,rate_bps,total_shares")
    .eq("vault_id", vaultId)
    .order("recorded_at", { ascending: true });

  if (days > 0) {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    query = query.gte("recorded_at", since);
  }

  const { data, error } = await query.limit(2000);
  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  const points = (data ?? []).map((row) => ({
    t: new Date(row.recorded_at as string).getTime(),
    apy: Number(row.apy ?? 0),
    tvl: row.tvl_usdc ? Number(row.tvl_usdc) / 1e6 : null,
    rateBps: row.rate_bps ?? null,
    shares: row.total_shares ? Number(row.total_shares) : null,
  }));

  return NextResponse.json({ success: true, data: { vaultId, range, points } });
}
