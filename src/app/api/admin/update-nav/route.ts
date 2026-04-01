import { NextRequest, NextResponse } from "next/server";
import {
  address,
  createTransactionMessage,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  appendTransactionMessageInstruction,
  signTransactionMessageWithSigners,
} from "@solana/kit";
import { getUpdateRateInterestBearingMintInstruction } from "@solana-program/token-2022";
import { getVaultAuthority, getRpc, getSendAndConfirmTransaction } from "@/lib/solana/vault-authority";
import { isSupabaseConfigured, supabaseAdmin } from "@/lib/supabase-server";
import { VAULT_CONFIGS, type VaultId } from "@/lib/constants";

export const dynamic = "force-dynamic";

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

    const rpc = getRpc();
    const vaultAuthority = await getVaultAuthority();
    const sendAndConfirm = getSendAndConfirmTransaction();
    const mintAddress = address(vaultConfig.mint);

    const updateRateIx = getUpdateRateInterestBearingMintInstruction({
      mint: mintAddress,
      rateAuthority: vaultAuthority,
      rate: newRateBps,
    });

    const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();

    const msg0 = createTransactionMessage({ version: 0 });
    const msg1 = setTransactionMessageFeePayerSigner(vaultAuthority, msg0);
    const msg2 = setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, msg1);
    const msg3 = appendTransactionMessageInstruction(updateRateIx, msg2);

    const signedTx = await signTransactionMessageWithSigners(msg3);
    await sendAndConfirm(signedTx, { commitment: "confirmed" });

    // Log to Supabase
    if (isSupabaseConfigured()) {
      await supabaseAdmin.from("sol_nav_history").insert({
        vault_id: vaultId,
        rate_bps: newRateBps,
        apy: newRateBps / 100,
      });

      await supabaseAdmin
        .from("sol_vaults")
        .update({ rate_bps: newRateBps, apy: newRateBps / 100 })
        .eq("id", vaultId);
    }

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
