import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const wallet = req.nextUrl.searchParams.get("wallet");
  if (!wallet) {
    return NextResponse.json({ success: false, error: "Missing wallet" }, { status: 400 });
  }

  try {
    const [deposits, withdrawals] = await Promise.all([
      supabaseAdmin
        .from("sol_deposits")
        .select("*")
        .eq("wallet", wallet)
        .order("created_at", { ascending: false })
        .limit(20),
      supabaseAdmin
        .from("sol_withdrawals")
        .select("*")
        .eq("wallet", wallet)
        .order("created_at", { ascending: false })
        .limit(20),
    ]);

    const txs = [
      ...(deposits.data || []).map((d) => ({
        id: d.id,
        type: "deposit" as const,
        vaultId: d.vault_id,
        amount: d.usdc_amount,
        tx: d.deposit_tx,
        createdAt: d.created_at,
      })),
      ...(withdrawals.data || []).map((w) => ({
        id: w.id,
        type: "withdrawal" as const,
        vaultId: w.vault_id,
        amount: w.usdc_returned,
        tx: w.burn_tx,
        createdAt: w.created_at,
      })),
    ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return NextResponse.json({ success: true, data: txs });
  } catch (error) {
    console.error("GET /api/user/history error:", error);
    return NextResponse.json({ success: true, data: [] });
  }
}
