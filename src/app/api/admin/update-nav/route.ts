import { NextRequest, NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";

export const dynamic = "force-dynamic";
import { TOKEN_2022_PROGRAM_ID, updateRateInterestBearingMint } from "@solana/spl-token";
import { getVaultAuthority, getConnection } from "@/lib/solana/vault-authority";
import { supabaseAdmin } from "@/lib/supabase-server";
import { VAULT_CONFIGS, type VaultId } from "@/lib/constants";

export async function POST(req: NextRequest) {
  try {
    // Auth check
    const authHeader = req.headers.get("authorization");
    if (authHeader !== `Bearer ${process.env.ADMIN_API_KEY}`) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const { vaultId, newRateBps } = await req.json();

    const vaultConfig = VAULT_CONFIGS[vaultId as VaultId];
    if (!vaultConfig) {
      return NextResponse.json({ success: false, error: "Unknown vault" }, { status: 400 });
    }

    // Safety: rate can't change more than 200bps per update
    if (Math.abs(newRateBps - vaultConfig.rateBps) > 200) {
      return NextResponse.json(
        { success: false, error: "Rate change exceeds 2% limit per update" },
        { status: 400 },
      );
    }

    const connection = getConnection();
    const vaultAuthority = getVaultAuthority();
    const mintPubkey = new PublicKey(vaultConfig.mint);

    await updateRateInterestBearingMint(
      connection,
      vaultAuthority,
      mintPubkey,
      vaultAuthority,
      newRateBps,
      [],
      undefined,
      TOKEN_2022_PROGRAM_ID,
    );

    // Log to Supabase
    await supabaseAdmin.from("sol_nav_history").insert({
      vault_id: vaultId,
      rate_bps: newRateBps,
      apy: newRateBps / 100,
    });

    // Update vault record
    await supabaseAdmin
      .from("sol_vaults")
      .update({ rate_bps: newRateBps, apy: newRateBps / 100 })
      .eq("id", vaultId);

    return NextResponse.json({
      success: true,
      data: { newRate: newRateBps, apy: newRateBps / 100 },
    });
  } catch (error) {
    console.error("POST /api/admin/update-nav error:", error);
    return NextResponse.json(
      { success: false, error: "NAV update failed" },
      { status: 500 },
    );
  }
}
