import { NextRequest, NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  createMintToInstruction,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
  getAccount,
} from "@solana/spl-token";
import { Connection } from "@solana/web3.js";
import { executeVaultTransaction, getVaultPda } from "@/lib/solana/squads";
import { isSupabaseConfigured, supabaseAdmin } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

const USDC_MINT = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");

export async function POST(req: NextRequest) {
  try {
    const { vaultId, txSignature, userWallet, amount } = await req.json();

    if (!vaultId || !txSignature || !userWallet || !amount) {
      return NextResponse.json(
        { success: false, error: "Missing required fields" },
        { status: 400 },
      );
    }

    const fdnAlphaMint = process.env.NEXT_PUBLIC_FDN_ALPHA_MINT;
    if (!fdnAlphaMint) {
      return NextResponse.json(
        { success: false, error: "fdnALPHA mint not configured" },
        { status: 500 },
      );
    }

    const rpcUrl = process.env.SOLANA_RPC_URL || process.env.NEXT_PUBLIC_SOLANA_RPC_URL!;
    const connection = new Connection(rpcUrl, "confirmed");
    const vaultPda = getVaultPda();

    // 1. Verify the USDC transfer to our vault PDA
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

    // Verify USDC went to our vault
    const postBalances = tx.meta?.postTokenBalances || [];
    const preBalances = tx.meta?.preTokenBalances || [];

    const vaultPost = postBalances.find(
      (b) => b.owner === vaultPda.toBase58() && b.mint === USDC_MINT.toBase58(),
    );
    const vaultPre = preBalances.find(
      (b) => b.owner === vaultPda.toBase58() && b.mint === USDC_MINT.toBase58(),
    );

    const received =
      (Number(vaultPost?.uiTokenAmount?.amount) || 0) -
      (Number(vaultPre?.uiTokenAmount?.amount) || 0);

    if (received < amount) {
      return NextResponse.json(
        { success: false, error: "USDC transfer not verified" },
        { status: 400 },
      );
    }

    // 2. Mint fdnALPHA to user via Squads vault (vault PDA is mint authority)
    const mintPubkey = new PublicKey(fdnAlphaMint);
    const userPubkey = new PublicKey(userWallet);
    const userAta = getAssociatedTokenAddressSync(
      mintPubkey,
      userPubkey,
      false,
      TOKEN_2022_PROGRAM_ID,
    );

    const mintInstructions = [];

    // Create user's fdnALPHA ATA if needed
    try {
      await getAccount(connection, userAta, "confirmed", TOKEN_2022_PROGRAM_ID);
    } catch {
      mintInstructions.push(
        createAssociatedTokenAccountInstruction(
          vaultPda, // payer = vault PDA
          userAta,
          userPubkey,
          mintPubkey,
          TOKEN_2022_PROGRAM_ID,
        ),
      );
    }

    // Mint fdnALPHA (1:1 with USDC deposited)
    mintInstructions.push(
      createMintToInstruction(
        mintPubkey,
        userAta,
        vaultPda, // mint authority = vault PDA
        amount,
        [],
        TOKEN_2022_PROGRAM_ID,
      ),
    );

    // Execute through Squads multisig
    const mintSig = await executeVaultTransaction(mintInstructions);

    // 3. Log to Supabase
    if (isSupabaseConfigured()) {
      await supabaseAdmin.from("sol_deposits").insert({
        vault_id: vaultId,
        wallet: userWallet,
        usdc_amount: amount,
        shares_minted: amount,
        deposit_tx: txSignature,
        mint_tx: mintSig,
      });
    }

    return NextResponse.json({
      success: true,
      data: { mintTx: mintSig, sharesMinted: amount },
    });
  } catch (error) {
    console.error("POST /api/deposit error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Deposit failed" },
      { status: 500 },
    );
  }
}
