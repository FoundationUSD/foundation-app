import { NextRequest, NextResponse } from "next/server";
import { isSupabaseConfigured, supabaseAdmin } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ success: true, data: [] });
  }

  const { searchParams } = new URL(req.url);
  const days = parseInt(searchParams.get("days") || "30", 10);

  try {
    const since = new Date();
    since.setDate(since.getDate() - days);

    const { data, error } = await supabaseAdmin
      .from("sol_nav_history")
      .select("*")
      .eq("vault_id", id)
      .gte("recorded_at", since.toISOString())
      .order("recorded_at", { ascending: true });

    if (error) throw error;

    return NextResponse.json({
      success: true,
      data: (data || []).map((row) => ({
        rateBps: row.rate_bps,
        apy: Number(row.apy),
        tvlUsdc: Number(row.tvl_usdc || 0),
        totalShares: Number(row.total_shares || 0),
        recordedAt: row.recorded_at,
      })),
    });
  } catch (error) {
    console.error("GET /api/vaults/[id]/history error:", error);
    return NextResponse.json({ success: true, data: [] });
  }
}
