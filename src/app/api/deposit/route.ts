import { NextRequest, NextResponse } from "next/server";
import {
  address,
  createTransactionMessage,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  appendTransactionMessageInstructions,
  getSignatureFromTransaction,
  signTransactionMessageWithSigners,
  type Instruction,
} from "@solana/kit";
import {
  findAssociatedTokenPda,
  fetchMaybeToken,
  getCreateAssociatedTokenInstruction,
  getMintToInstruction,
  TOKEN_2022_PROGRAM_ADDRESS,
} from "@solana-program/token-2022";
import { getVaultAuthority, getRpc, getSendAndConfirmTransaction } from "@/lib/solana/vault-authority";
import { isSupabaseConfigured, supabaseAdmin } from "@/lib/supabase-server";
import { VAULT_CONFIGS, USDC_MINT, type VaultId } from "@/lib/constants";
import type { DepositRequest } from "@/types";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body: DepositRequest = await req.json();
    const { vaultId, txSignature, userWallet, amount } = body;

    // Validate vault
    const vaultConfig = VAULT_CONFIGS[vaultId as VaultId];
    if (!vaultConfig) {
      return NextResponse.json({ success: false, error: "Unknown vault" }, { status: 400 });
    }
    if (!vaultConfig.mint) {
      return NextResponse.json(
        { success: false, error: "Vault not initialized" },
        { status: 400 },
      );
    }

    const rpc = getRpc();
    const vaultAuthority = await getVaultAuthority();
    const sendAndConfirm = getSendAndConfirmTransaction();

    // 1. Verify the USDC transfer actually happened
    const txResult = await rpc
      .getTransaction(txSignature as Parameters<typeof rpc.getTransaction>[0], {
        commitment: "confirmed",
        maxSupportedTransactionVersion: 0,
        encoding: "jsonParsed",
      })
      .send();

    if (!txResult) {
      return NextResponse.json(
        { success: false, error: "Transaction not found" },
        { status: 404 },
      );
    }

    if (txResult.meta?.err) {
      return NextResponse.json(
        { success: false, error: "Transaction failed on-chain" },
        { status: 400 },
      );
    }

    // Verify USDC transfer amount by checking token balance changes
    const preBalances = txResult.meta?.preTokenBalances || [];
    const postBalances = txResult.meta?.postTokenBalances || [];

    const vaultPostBalance = postBalances.find(
      (b) => b.owner === vaultAuthority.address && b.mint === USDC_MINT,
    );
    const vaultPreBalance = preBalances.find(
      (b) => b.owner === vaultAuthority.address && b.mint === USDC_MINT,
    );

    const received =
      (Number(vaultPostBalance?.uiTokenAmount?.amount) || 0) -
      (Number(vaultPreBalance?.uiTokenAmount?.amount) || 0);

    if (received < amount) {
      return NextResponse.json(
        { success: false, error: "Insufficient USDC transfer verified" },
        { status: 400 },
      );
    }

    // 2. Calculate shares (1:1 at deposit for interest-bearing tokens)
    const sharesToMint = BigInt(amount);

    // 3. Get or create user's Token-2022 ATA
    const userAddress = address(userWallet);
    const mintAddress = address(vaultConfig.mint);
    const [userAtaPda] = await findAssociatedTokenPda({
      owner: userAddress,
      tokenProgram: TOKEN_2022_PROGRAM_ADDRESS,
      mint: mintAddress,
    });

    const instructions: Instruction[] = [];

    // Check if ATA exists
    const maybeAccount = await fetchMaybeToken(rpc, userAtaPda, {
      commitment: "confirmed",
    });

    if (!maybeAccount.exists) {
      instructions.push(
        getCreateAssociatedTokenInstruction({
          payer: vaultAuthority,
          ata: userAtaPda,
          owner: userAddress,
          mint: mintAddress,
          tokenProgram: TOKEN_2022_PROGRAM_ADDRESS,
        }),
      );
    }

    // 4. Mint fdnTokens to user
    instructions.push(
      getMintToInstruction({
        mint: mintAddress,
        token: userAtaPda,
        mintAuthority: vaultAuthority,
        amount: sharesToMint,
      }),
    );

    // Build, sign, and send transaction
    const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();

    const msg0 = createTransactionMessage({ version: 0 });
    const msg1 = setTransactionMessageFeePayerSigner(vaultAuthority, msg0);
    const msg2 = setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, msg1);
    const msg3 = appendTransactionMessageInstructions(instructions, msg2);

    const signedTx = await signTransactionMessageWithSigners(msg3);
    await sendAndConfirm(signedTx, { commitment: "confirmed" });
    const mintSig = getSignatureFromTransaction(signedTx);

    // 5. Log to Supabase
    if (isSupabaseConfigured()) {
      await supabaseAdmin.from("sol_deposits").insert({
        vault_id: vaultId,
        wallet: userWallet,
        usdc_amount: amount,
        shares_minted: Number(sharesToMint),
        deposit_tx: txSignature,
        mint_tx: mintSig,
      });

      await supabaseAdmin.rpc("increment_vault_tvl", {
        p_vault_id: vaultId,
        p_amount: amount,
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        mintTx: mintSig,
        sharesMinted: Number(sharesToMint),
      },
    });
  } catch (error) {
    console.error("POST /api/deposit error:", error);
    return NextResponse.json(
      { success: false, error: "Deposit failed" },
      { status: 500 },
    );
  }
}
