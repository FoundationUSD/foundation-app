import { NextRequest, NextResponse } from "next/server";
import { PublicKey, Connection, LAMPORTS_PER_SOL } from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  createTransferInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { executeVaultTransaction, getVaultAddresses, vaultIdToName } from "@/lib/solana/squads";
import { isSupabaseConfigured, supabaseAdmin } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

const USDC_MINT = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
const MIN_AUTHORITY_SOL = 0.01;

export async function POST(req: NextRequest) {
  try {
    const { vaultId, burnTxSignature, userWallet } = await req.json();

    if (!vaultId || !burnTxSignature || !userWallet) {
      return NextResponse.json(
        { success: false, error: "Missing required fields" },
        { status: 400 },
      );
    }

    let vaultName;
    try {
      vaultName = vaultIdToName(vaultId);
    } catch {
      return NextResponse.json({ success: false, error: "Unknown vault" }, { status: 400 });
    }

    const vault = getVaultAddresses(vaultName);

    // Prevent duplicate withdrawal
    if (isSupabaseConfigured()) {
      const { data: existing } = await supabaseAdmin
        .from("sol_withdrawals")
        .select("id")
        .eq("burn_tx", burnTxSignature)
        .limit(1);
      if (existing && existing.length > 0) {
        return NextResponse.json(
          { success: false, error: "This withdrawal was already processed" },
          { status: 409 },
        );
      }
    }

    const rpcUrl = process.env.SOLANA_RPC_URL || process.env.NEXT_PUBLIC_SOLANA_RPC_URL!;
    const connection = new Connection(rpcUrl, "confirmed");

    // Check authority SOL
    const bs58 = await import("bs58");
    const { Keypair } = await import("@solana/web3.js");
    const authority = Keypair.fromSecretKey(
      bs58.default.decode(process.env.VAULT_AUTHORITY_SECRET!),
    );
    const authBalance = await connection.getBalance(authority.publicKey);
    if (authBalance < MIN_AUTHORITY_SOL * LAMPORTS_PER_SOL) {
      return NextResponse.json(
        { success: false, error: "Vault temporarily unavailable. Please try again later." },
        { status: 503 },
      );
    }

    // Verify burn tx on-chain
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

    // Read exact burn amount from tx — don't trust client
    const postBalances = burnTx.meta?.postTokenBalances || [];
    const preBalances = burnTx.meta?.preTokenBalances || [];
    const mintStr = vault.mint?.toBase58();

    let sharesBurned = 0;
    for (const pre of preBalances) {
      if (pre.mint === mintStr && pre.owner === userWallet) {
        const post = postBalances.find((p) => p.accountIndex === pre.accountIndex);
        const preAmt = Number(pre.uiTokenAmount.amount);
        const postAmt = post ? Number(post.uiTokenAmount.amount) : 0;
        sharesBurned = preAmt - postAmt;
      }
    }

    if (sharesBurned <= 0) {
      return NextResponse.json(
        { success: false, error: "No receipt token burn found in transaction" },
        { status: 400 },
      );
    }

    // Calculate USDC owed — check against actual deposits if Supabase available
    let usdcOwed = sharesBurned; // default 1:1

    if (isSupabaseConfigured()) {
      // Get total deposited by this user in this vault
      const { data: deposits } = await supabaseAdmin
        .from("sol_deposits")
        .select("usdc_amount")
        .eq("vault_id", vaultId)
        .eq("wallet", userWallet);

      const { data: withdrawals } = await supabaseAdmin
        .from("sol_withdrawals")
        .select("usdc_returned")
        .eq("vault_id", vaultId)
        .eq("wallet", userWallet);

      const totalDeposited = (deposits || []).reduce((s, d) => s + Number(d.usdc_amount), 0);
      const totalWithdrawn = (withdrawals || []).reduce((s, w) => s + Number(w.usdc_returned), 0);
      const maxWithdrawable = totalDeposited - totalWithdrawn;

      // Only return up to what they actually deposited
      if (usdcOwed > maxWithdrawable && maxWithdrawable >= 0) {
        usdcOwed = maxWithdrawable;
      }

      if (usdcOwed <= 0) {
        return NextResponse.json(
          { success: false, error: "No withdrawable balance found for this wallet" },
          { status: 400 },
        );
      }
    }

    // Check vault has enough USDC
    const vaultUsdcAta = vault.usdcAta
      || getAssociatedTokenAddressSync(USDC_MINT, vault.vaultPda, true, TOKEN_PROGRAM_ID);
    const vaultBalance = await connection.getTokenAccountBalance(vaultUsdcAta);
    if (Number(vaultBalance.value.amount) < usdcOwed) {
      return NextResponse.json(
        { success: false, error: "Insufficient vault liquidity. Please try again later." },
        { status: 400 },
      );
    }

    // Transfer USDC back to user
    const userPubkey = new PublicKey(userWallet);
    const userUsdcAta = getAssociatedTokenAddressSync(USDC_MINT, userPubkey, false, TOKEN_PROGRAM_ID);

    const transferIx = createTransferInstruction(
      vaultUsdcAta,
      userUsdcAta,
      vault.vaultPda,
      usdcOwed,
      [],
      TOKEN_PROGRAM_ID,
    );

    const sig = await executeVaultTransaction(vaultName, [transferIx]);

    // Log
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
