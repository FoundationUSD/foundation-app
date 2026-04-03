import { NextRequest, NextResponse } from "next/server";
import { isSupabaseConfigured, supabaseAdmin } from "@/lib/supabase-server";
import { FOUNDATION_VAULTS } from "@/lib/vaults";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const wallet = req.nextUrl.searchParams.get("wallet");
  if (!wallet) {
    return NextResponse.json({ success: false, error: "Missing wallet param" }, { status: 400 });
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ success: true, data: [] });
  }

  try {
    const { data: deposits } = await supabaseAdmin
      .from("sol_deposits")
      .select("vault_id, usdc_amount")
      .eq("wallet", wallet);

    const { data: withdrawals } = await supabaseAdmin
      .from("sol_withdrawals")
      .select("vault_id, usdc_returned")
      .eq("wallet", wallet);

    // Calculate net per vault
    const netByVault: Record<string, number> = {};
    for (const d of deposits || []) {
      netByVault[d.vault_id] = (netByVault[d.vault_id] || 0) + Number(d.usdc_amount);
    }
    for (const w of withdrawals || []) {
      netByVault[w.vault_id] = (netByVault[w.vault_id] || 0) - Number(w.usdc_returned);
    }

    const positions = FOUNDATION_VAULTS
      .filter((v) => (netByVault[v.id] || 0) > 0)
      .map((v) => ({
        vaultId: v.id,
        vaultName: v.name,
        receiptToken: v.receiptToken,
        strategy: v.strategy,
        protocol: v.protocol,
        depositedUsdc: netByVault[v.id] / 1e6,
        apy: v.apy,
      }));

    return NextResponse.json({ success: true, data: positions });
  } catch (error) {
    console.error("GET /api/user/portfolio error:", error);
    return NextResponse.json({ success: true, data: [] });
  }
}
