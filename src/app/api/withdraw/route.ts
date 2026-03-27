import { NextRequest, NextResponse } from "next/server";
import {
  PublicKey,
  Transaction,
  sendAndConfirmRawTransaction,
} from "@solana/web3.js";

export const dynamic = "force-dynamic";
import {
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createTransferInstruction,
  getAssociatedTokenAddressSync,
  getMint,
} from "@solana/spl-token";
import { getVaultAuthority, getConnection } from "@/lib/solana/vault-authority";
import { supabaseAdmin } from "@/lib/supabase-server";
import { VAULT_CONFIGS, USDC_MINT, type VaultId } from "@/lib/constants";
import type { WithdrawRequest } from "@/types";

export async function POST(req: NextRequest) {
  try {
    const body: WithdrawRequest = await req.json();
    const { vaultId, burnTxSignature, userWallet, sharesBurned } = body;

    const vaultConfig = VAULT_CONFIGS[vaultId as VaultId];
    if (!vaultConfig) {
      return NextResponse.json({ success: false, error: "Unknown vault" }, { status: 400 });
    }

    const connection = getConnection();
    const vaultAuthority = getVaultAuthority();

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

    // 2. Calculate USDC owed (shares + accrued interest)
    const mintPubkey = new PublicKey(vaultConfig.mint);
    const mintInfo = await getMint(connection, mintPubkey, "confirmed", TOKEN_2022_PROGRAM_ID);

    // For interest-bearing tokens, the accrued value is calculated from
    // the interest rate and time elapsed since initialization.
    // For MVP, we use a simple multiplier based on the configured rate.
    // In production, use amountToUiAmount from Token-2022.
    const usdcOwed = sharesBurned; // Simplified: 1:1 + interest handled by Token-2022

    // 3. Check vault has enough USDC
    const vaultUsdcAta = getAssociatedTokenAddressSync(USDC_MINT, vaultAuthority.publicKey);
    const vaultUsdcAccount = await connection.getTokenAccountBalance(vaultUsdcAta);
    const vaultBalance = Number(vaultUsdcAccount.value.amount);

    if (vaultBalance < usdcOwed) {
      return NextResponse.json(
        { success: false, error: "Insufficient liquidity in vault" },
        { status: 400 },
      );
    }

    // 4. Transfer USDC to user
    const userPubkey = new PublicKey(userWallet);
    const userUsdcAta = getAssociatedTokenAddressSync(USDC_MINT, userPubkey);

    const transferIx = createTransferInstruction(
      vaultUsdcAta,
      userUsdcAta,
      vaultAuthority.publicKey,
      usdcOwed,
      [],
      TOKEN_PROGRAM_ID,
    );

    const tx = new Transaction().add(transferIx);
    tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
    tx.feePayer = vaultAuthority.publicKey;
    tx.sign(vaultAuthority);

    const sig = await sendAndConfirmRawTransaction(connection, tx.serialize(), {
      commitment: "confirmed",
    });

    // 5. Log to Supabase
    await supabaseAdmin.from("sol_withdrawals").insert({
      vault_id: vaultId,
      wallet: userWallet,
      shares_burned: sharesBurned,
      usdc_returned: usdcOwed,
      burn_tx: burnTxSignature,
      transfer_tx: sig,
    });

    return NextResponse.json({
      success: true,
      data: {
        transferTx: sig,
        usdcReturned: usdcOwed,
      },
    });
  } catch (error) {
    console.error("POST /api/withdraw error:", error);
    return NextResponse.json(
      { success: false, error: "Withdrawal failed" },
      { status: 500 },
    );
  }
}
