import { NextRequest, NextResponse } from "next/server";
import {
  Connection,
  PublicKey,
  Transaction,
  sendAndConfirmRawTransaction,
} from "@solana/web3.js";

export const dynamic = "force-dynamic";
import {
  TOKEN_2022_PROGRAM_ID,
  createMintToInstruction,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
  getAccount,
} from "@solana/spl-token";
import { getVaultAuthority, getConnection } from "@/lib/solana/vault-authority";
import { supabaseAdmin } from "@/lib/supabase-server";
import { VAULT_CONFIGS, USDC_MINT, type VaultId } from "@/lib/constants";
import type { DepositRequest } from "@/types";

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

    const connection = getConnection();
    const vaultAuthority = getVaultAuthority();

    // 1. Verify the USDC transfer actually happened
    const tx = await connection.getTransaction(txSignature, {
      commitment: "confirmed",
      maxSupportedTransactionVersion: 0,
    });

    if (!tx) {
      return NextResponse.json(
        { success: false, error: "Transaction not found" },
        { status: 404 },
      );
    }

    if (tx.meta?.err) {
      return NextResponse.json(
        { success: false, error: "Transaction failed on-chain" },
        { status: 400 },
      );
    }

    // Verify USDC transfer amount by checking token balance changes
    const preBalances = tx.meta?.preTokenBalances || [];
    const postBalances = tx.meta?.postTokenBalances || [];

    const vaultUsdcAta = getAssociatedTokenAddressSync(USDC_MINT, vaultAuthority.publicKey);
    const vaultPostBalance = postBalances.find(
      (b) => b.owner === vaultAuthority.publicKey.toBase58() && b.mint === USDC_MINT.toBase58(),
    );
    const vaultPreBalance = preBalances.find(
      (b) => b.owner === vaultAuthority.publicKey.toBase58() && b.mint === USDC_MINT.toBase58(),
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
    const sharesToMint = amount;

    // 3. Get or create user's Token-2022 ATA
    const userPubkey = new PublicKey(userWallet);
    const mintPubkey = new PublicKey(vaultConfig.mint);
    const userAta = getAssociatedTokenAddressSync(
      mintPubkey,
      userPubkey,
      false,
      TOKEN_2022_PROGRAM_ID,
    );

    const instructions = [];

    try {
      await getAccount(connection, userAta, "confirmed", TOKEN_2022_PROGRAM_ID);
    } catch {
      instructions.push(
        createAssociatedTokenAccountInstruction(
          vaultAuthority.publicKey,
          userAta,
          userPubkey,
          mintPubkey,
          TOKEN_2022_PROGRAM_ID,
        ),
      );
    }

    // 4. Mint fdnTokens to user
    instructions.push(
      createMintToInstruction(
        mintPubkey,
        userAta,
        vaultAuthority.publicKey,
        sharesToMint,
        [],
        TOKEN_2022_PROGRAM_ID,
      ),
    );

    const mintTx = new Transaction().add(...instructions);
    mintTx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
    mintTx.feePayer = vaultAuthority.publicKey;
    mintTx.sign(vaultAuthority);

    const mintSig = await sendAndConfirmRawTransaction(connection, mintTx.serialize(), {
      commitment: "confirmed",
    });

    // 5. Log to Supabase
    await supabaseAdmin.from("sol_deposits").insert({
      vault_id: vaultId,
      wallet: userWallet,
      usdc_amount: amount,
      shares_minted: sharesToMint,
      deposit_tx: txSignature,
      mint_tx: mintSig,
    });

    // Update vault TVL
    await supabaseAdmin.rpc("increment_vault_tvl", {
      p_vault_id: vaultId,
      p_amount: amount,
    });

    return NextResponse.json({
      success: true,
      data: {
        mintTx: mintSig,
        sharesMinted: sharesToMint,
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
