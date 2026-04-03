/**
 * Cron: Sync vault state from on-chain to Supabase
 * 
 * Captures:
 * - Total fdnALPHA supply (total shares)
 * - Vault USDC balance (TVL)
 * - NAV per share
 * 
 * Runs every hour via Fly.io cron.
 */

import { NextRequest, NextResponse } from "next/server";
import { PublicKey, Connection } from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  getMint,
  getAccount,
} from "@solana/spl-token";
import { isSupabaseConfigured, supabaseAdmin } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

const USDC_MINT = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { error: "Supabase not configured" },
      { status: 500 }
    );
  }

  try {
    const connection = new Connection(
      process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com",
      "confirmed"
    );

    const fdnAlphaMint = process.env.NEXT_PUBLIC_FDN_ALPHA_MINT;
    const vaultPda = process.env.VAULT_PDA;

    if (!fdnAlphaMint || !vaultPda) {
      return NextResponse.json(
        { error: "Vault addresses not configured" },
        { status: 500 }
      );
    }

    const mintPubkey = new PublicKey(fdnAlphaMint);
    const vaultPubkey = new PublicKey(vaultPda);
    const vaultUsdcAta = getAssociatedTokenAddressSync(
      USDC_MINT,
      vaultPubkey,
      true,
      TOKEN_PROGRAM_ID
    );

    // Fetch on-chain state
    const [mintInfo, vaultUsdcBalance] = await Promise.all([
      getMint(connection, mintPubkey, "confirmed", TOKEN_2022_PROGRAM_ID),
      getAccount(connection, vaultUsdcAta, "confirmed", TOKEN_PROGRAM_ID),
    ]);

    const totalShares = Number(mintInfo.supply);
    const tvlUsdc = Number(vaultUsdcBalance.amount);
    const navPerShare = totalShares > 0 ? tvlUsdc / totalShares : 1;

    // Get current APY from vaults table
    const { data: vaultData } = await supabaseAdmin
      .from("sol_vaults")
      .select("rate_bps, apy")
      .eq("id", "fdn-solomon")
      .single();

    // Log to NAV history
    await supabaseAdmin.from("sol_nav_history").insert({
      vault_id: "fdn-solomon",
      rate_bps: vaultData?.rate_bps || 800,
      apy: vaultData?.apy || 8.0,
      tvl_usdc: tvlUsdc,
      total_shares: totalShares,
      recorded_at: new Date().toISOString(),
    });

    // Update vault TVL
    await supabaseAdmin
      .from("sol_vaults")
      .update({ tvl_usdc: tvlUsdc })
      .eq("id", "fdn-solomon");

    console.log("✅ Vault state synced:", {
      tvl_usdc: tvlUsdc,
      total_shares: totalShares,
      nav_per_share: navPerShare,
    });

    return NextResponse.json({
      success: true,
      data: {
        tvl_usdc: tvlUsdc,
        total_shares: totalShares,
        nav_per_share: navPerShare,
        synced_at: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("Cron sync state failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Sync failed" },
      { status: 500 }
    );
  }
}
