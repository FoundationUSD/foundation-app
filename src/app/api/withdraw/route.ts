import { NextRequest, NextResponse } from "next/server";
import {
  address,
  createTransactionMessage,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  appendTransactionMessageInstruction,
  signTransactionMessageWithSigners,
  getSignatureFromTransaction,
} from "@solana/kit";
import {
  fetchToken,
} from "@solana-program/token-2022";
import {
  findAssociatedTokenPda as findTokenPda,
  getTransferInstruction,
  TOKEN_PROGRAM_ADDRESS,
} from "@solana-program/token";
import { getVaultAuthority, getRpc, getSendAndConfirmTransaction } from "@/lib/solana/vault-authority";
import { isSupabaseConfigured, supabaseAdmin } from "@/lib/supabase-server";
import { VAULT_CONFIGS, USDC_MINT, type VaultId } from "@/lib/constants";
import type { WithdrawRequest } from "@/types";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body: WithdrawRequest = await req.json();
    const { vaultId, burnTxSignature, userWallet, sharesBurned } = body;

    const vaultConfig = VAULT_CONFIGS[vaultId as VaultId];
    if (!vaultConfig) {
      return NextResponse.json({ success: false, error: "Unknown vault" }, { status: 400 });
    }

    const rpc = getRpc();
    const vaultAuthority = await getVaultAuthority();
    const sendAndConfirm = getSendAndConfirmTransaction();

    // 1. Verify burn tx
    const burnTxResult = await rpc
      .getTransaction(burnTxSignature as Parameters<typeof rpc.getTransaction>[0], {
        commitment: "confirmed",
        maxSupportedTransactionVersion: 0,
        encoding: "jsonParsed",
      })
      .send();

    if (!burnTxResult || burnTxResult.meta?.err) {
      return NextResponse.json(
        { success: false, error: "Burn transaction not found or failed" },
        { status: 400 },
      );
    }

    // 2. Calculate USDC owed (shares + accrued interest)
    // For interest-bearing tokens, interest accrues via Token-2022 extension.
    // For MVP, 1:1 — production should use amountToUiAmountForInterestBearingMintWithoutSimulation
    const usdcOwed = BigInt(sharesBurned);

    // 3. Check vault has enough USDC
    const [vaultUsdcAtaPda] = await findTokenPda({
      owner: vaultAuthority.address,
      tokenProgram: TOKEN_PROGRAM_ADDRESS,
      mint: USDC_MINT,
    });
    const vaultUsdcAccount = await fetchToken(rpc, vaultUsdcAtaPda, {
      commitment: "confirmed",
    });

    if (vaultUsdcAccount.data.amount < usdcOwed) {
      return NextResponse.json(
        { success: false, error: "Insufficient liquidity in vault" },
        { status: 400 },
      );
    }

    // 4. Transfer USDC to user
    const userAddress = address(userWallet);
    const [userUsdcAtaPda] = await findTokenPda({
      owner: userAddress,
      tokenProgram: TOKEN_PROGRAM_ADDRESS,
      mint: USDC_MINT,
    });

    const transferIx = getTransferInstruction({
      source: vaultUsdcAtaPda,
      destination: userUsdcAtaPda,
      authority: vaultAuthority,
      amount: usdcOwed,
    });

    const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();

    const msg0 = createTransactionMessage({ version: 0 });
    const msg1 = setTransactionMessageFeePayerSigner(vaultAuthority, msg0);
    const msg2 = setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, msg1);
    const msg3 = appendTransactionMessageInstruction(transferIx, msg2);

    const signedTx = await signTransactionMessageWithSigners(msg3);
    await sendAndConfirm(signedTx, { commitment: "confirmed" });
    const sig = getSignatureFromTransaction(signedTx);

    // 5. Log to Supabase
    if (isSupabaseConfigured()) {
      await supabaseAdmin.from("sol_withdrawals").insert({
        vault_id: vaultId,
        wallet: userWallet,
        shares_burned: Number(sharesBurned),
        usdc_returned: Number(usdcOwed),
        burn_tx: burnTxSignature,
        transfer_tx: sig,
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        transferTx: sig,
        usdcReturned: Number(usdcOwed),
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
