import { NextRequest, NextResponse } from "next/server";
import { PublicKey, Connection } from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  createTransferInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { executeVaultTransaction, getVaultPda } from "@/lib/solana/squads";
import { isSupabaseConfigured, supabaseAdmin } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

const USDC_MINT = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");

export async function POST(req: NextRequest) {
  try {
    const { vaultId, burnTxSignature, userWallet, sharesBurned } = await req.json();

    if (!vaultId || !burnTxSignature || !userWallet || !sharesBurned) {
      return NextResponse.json(
        { success: false, error: "Missing required fields" },
        { status: 400 },
      );
    }

    const rpcUrl = process.env.SOLANA_RPC_URL || process.env.NEXT_PUBLIC_SOLANA_RPC_URL!;
    const connection = new Connection(rpcUrl, "confirmed");
    const vaultPda = getVaultPda();

    // 1. Verify burn tx
    const burnTx = await connection.getTransaction(burnTxSignature, {
      commitment: "confirmed",
      maxSupportedTransactionVersion: 0,
    });

    if (!burnTx || burnTx.meta?.err) {
      return NextResponse.json(
        { success: false, error: "Burn transaction not found or failed" },
        { status: 400 },
      );
    }

    // 2. Calculate USDC owed (1:1 for now — interest handled by Token-2022)
    const usdcOwed = sharesBurned;

    // 3. Check vault has enough USDC
    const vaultUsdcAta = getAssociatedTokenAddressSync(USDC_MINT, vaultPda, true, TOKEN_PROGRAM_ID);
    const vaultBalance = await connection.getTokenAccountBalance(vaultUsdcAta);
    if (Number(vaultBalance.value.amount) < usdcOwed) {
      return NextResponse.json(
        { success: false, error: "Insufficient vault liquidity" },
        { status: 400 },
      );
    }

    // 4. Transfer USDC from vault PDA to user via Squads
    const userPubkey = new PublicKey(userWallet);
    const userUsdcAta = getAssociatedTokenAddressSync(USDC_MINT, userPubkey, false, TOKEN_PROGRAM_ID);

    const transferIx = createTransferInstruction(
      vaultUsdcAta,
      userUsdcAta,
      vaultPda, // authority = vault PDA
      usdcOwed,
      [],
      TOKEN_PROGRAM_ID,
    );

    const sig = await executeVaultTransaction([transferIx]);

    // 5. Log
    if (isSupabaseConfigured()) {
      await supabaseAdmin.from("sol_withdrawals").insert({
        vault_id: vaultId,
        wallet: userWallet,
        shares_burned: sharesBurned,
        usdc_returned: usdcOwed,
        burn_tx: burnTxSignature,
        transfer_tx: sig,
      });
    }

    return NextResponse.json({
      success: true,
      data: { transferTx: sig, usdcReturned: usdcOwed },
    });
  } catch (error) {
    console.error("POST /api/withdraw error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Withdrawal failed" },
      { status: 500 },
    );
  }
}
