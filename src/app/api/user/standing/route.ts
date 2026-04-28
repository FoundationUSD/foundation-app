import { NextRequest, NextResponse } from "next/server";
import { isSupabaseConfigured, supabaseAdmin } from "@/lib/supabase-server";
import { validatePublicKey } from "@/lib/api-validation";
import { computeStanding } from "@/lib/standing";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const wallet = req.nextUrl.searchParams.get("wallet");
  if (!wallet) {
    return NextResponse.json({ success: false, error: "wallet param required" }, { status: 400 });
  }
  const err = validatePublicKey("wallet", wallet);
  if (err) return NextResponse.json({ success: false, error: err.message }, { status: 400 });

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ success: false, error: "Database not configured" }, { status: 503 });
  }

  const [{ data: deposits }, { data: withdrawals }] = await Promise.all([
    supabaseAdmin
      .from("sol_deposits")
      .select("vault_id,usdc_amount,created_at")
      .eq("wallet", wallet),
    supabaseAdmin
      .from("sol_withdrawals")
      .select("vault_id,usdc_returned,created_at")
      .eq("wallet", wallet),
  ]);

  const standing = computeStanding(
    deposits ?? [],
    withdrawals ?? [],
  );

  return NextResponse.json({ success: true, data: standing });
}
