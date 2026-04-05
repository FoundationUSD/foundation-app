import { NextRequest, NextResponse } from "next/server";
import { PublicKey, Connection, LAMPORTS_PER_SOL } from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  createMintToInstruction,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
  getAccount,
} from "@solana/spl-token";
import { executeVaultTransaction, getVaultAddresses, vaultIdToName } from "@/lib/solana/squads";
import { isSupabaseConfigured, supabaseAdmin } from "@/lib/supabase-server";
import { deployCapital } from "@/lib/deploy-capital";

export const dynamic = "force-dynamic";

const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const MIN_AUTHORITY_SOL = 0.01; // minimum SOL needed for Squads tx

export async function POST(req: NextRequest) {
  try {
    const { vaultId, txSignature, userWallet } = await req.json();

    // 1. Validate inputs
    if (!vaultId || !txSignature || !userWallet) {
      return NextResponse.json(
        { success: false, error: "Missing vaultId, txSignature, or userWallet" },
        { status: 400 },
      );
    }

    // 2. Resolve vault
    let vaultName;
    try {
      vaultName = vaultIdToName(vaultId);
    } catch {
      return NextResponse.json(
        { success: false, error: "Unknown vault" },
        { status: 400 },
      );
    }

    const vault = getVaultAddresses(vaultName);
    if (!vault.mint) {
      return NextResponse.json(
        { success: false, error: "Vault mint not configured" },
        { status: 500 },
      );
    }

    // 3. Check for duplicate — prevent double-mint
    if (isSupabaseConfigured()) {
      const { data: existing } = await supabaseAdmin
        .from("sol_deposits")
        .select("id")
        .eq("deposit_tx", txSignature)
        .limit(1);
      if (existing && existing.length > 0) {
        return NextResponse.json(
          { success: false, error: "This deposit was already processed" },
          { status: 409 },
        );
      }
    }

    // 4. Check authority has enough SOL for Squads tx
    const rpcUrl = process.env.SOLANA_RPC_URL || process.env.NEXT_PUBLIC_SOLANA_RPC_URL!;
    const connection = new Connection(rpcUrl, "confirmed");

    const authoritySecret = process.env.VAULT_AUTHORITY_SECRET;
    if (!authoritySecret) {
      return NextResponse.json(
        { success: false, error: "Server configuration error" },
        { status: 500 },
      );
    }

    const bs58 = await import("bs58");
    const { Keypair } = await import("@solana/web3.js");
    const authority = Keypair.fromSecretKey(bs58.default.decode(authoritySecret));
    const authBalance = await connection.getBalance(authority.publicKey);

    if (authBalance < MIN_AUTHORITY_SOL * LAMPORTS_PER_SOL) {
      console.error("Authority SOL too low:", authBalance / LAMPORTS_PER_SOL);
      return NextResponse.json(
        { success: false, error: "Vault temporarily unavailable. Please try again later." },
        { status: 503 },
      );
    }

    // 5. Fetch and verify the on-chain transaction
    const tx = await connection.getTransaction(txSignature, {
      commitment: "confirmed",
      maxSupportedTransactionVersion: 0,
    });

    if (!tx) {
      return NextResponse.json(
        { success: false, error: "Transaction not found. Wait a moment and retry." },
        { status: 404 },
      );
    }

    if (tx.meta?.err) {
      return NextResponse.json(
        { success: false, error: "Transaction failed on-chain" },
        { status: 400 },
      );
    }

    // 6. Calculate EXACT USDC received by THIS vault from THIS user
    //    Don't trust client-provided amount — read it from the tx
    const postBalances = tx.meta?.postTokenBalances || [];
    const preBalances = tx.meta?.preTokenBalances || [];

    const vaultPdaStr = vault.vaultPda.toBase58();

    // Find vault's USDC balance change
    let usdcReceived = 0;
    for (const post of postBalances) {
      if (post.mint === USDC_MINT && post.owner === vaultPdaStr) {
        const pre = preBalances.find(
          (p) => p.accountIndex === post.accountIndex,
        );
        const postAmt = Number(post.uiTokenAmount.amount);
        const preAmt = pre ? Number(pre.uiTokenAmount.amount) : 0;
        usdcReceived = postAmt - preAmt;
      }
    }

    if (usdcReceived <= 0) {
      return NextResponse.json(
        { success: false, error: "No USDC transfer to this vault found in transaction" },
        { status: 400 },
      );
    }

    // 7. Verify the sender is the claimed user
    //    Check that userWallet is a signer on this tx
    const accountKeys = tx.transaction.message.getAccountKeys
      ? tx.transaction.message.getAccountKeys()
      : (tx.transaction.message as any).accountKeys || [];

    // The first account is usually the fee payer / signer
    const signers: string[] = [];
    if (Array.isArray(accountKeys)) {
      // Legacy format
      for (let i = 0; i < Math.min(accountKeys.length, 5); i++) {
        signers.push(accountKeys[i].toBase58 ? accountKeys[i].toBase58() : String(accountKeys[i]));
      }
    } else if (accountKeys.staticAccountKeys) {
      // Versioned format
      for (let i = 0; i < Math.min(accountKeys.staticAccountKeys.length, 5); i++) {
        signers.push(accountKeys.staticAccountKeys[i].toBase58());
      }
    }

    if (!signers.includes(userWallet)) {
      return NextResponse.json(
        { success: false, error: "Transaction signer does not match claimed wallet" },
        { status: 400 },
      );
    }

    // 8. Mint exact amount of receipt tokens
    const sharesToMint = usdcReceived; // 1:1 USDC to receipt token
    const userPubkey = new PublicKey(userWallet);
    const userAta = getAssociatedTokenAddressSync(
      vault.mint,
      userPubkey,
      false,
      TOKEN_2022_PROGRAM_ID,
    );

    const mintInstructions = [];

    try {
      await getAccount(connection, userAta, "confirmed", TOKEN_2022_PROGRAM_ID);
    } catch {
      mintInstructions.push(
        createAssociatedTokenAccountInstruction(
          vault.vaultPda,
          userAta,
          userPubkey,
          vault.mint,
          TOKEN_2022_PROGRAM_ID,
        ),
      );
    }

    mintInstructions.push(
      createMintToInstruction(
        vault.mint,
        userAta,
        vault.vaultPda,
        sharesToMint,
        [],
        TOKEN_2022_PROGRAM_ID,
      ),
    );

    const mintSig = await executeVaultTransaction(vaultName, mintInstructions);

    // 9. Log to Supabase
    if (isSupabaseConfigured()) {
      await supabaseAdmin.from("sol_deposits").insert({
        vault_id: vaultId,
        wallet: userWallet,
        usdc_amount: usdcReceived,
        shares_minted: sharesToMint,
        deposit_tx: txSignature,
        mint_tx: mintSig,
      });
    }

    // 10. Deploy USDC into the underlying protocol (non-blocking)
    //     If this fails, USDC stays in vault — can be retried later
    deployCapital(vaultName, usdcReceived)
      .then((result) => {
        if (!result.success) {
          console.error(`Capital deployment failed for ${vaultName}:`, result.error);
        } else {
          console.log(`Capital deployed for ${vaultName}: ${result.tx}`);
          // Log deployment tx to Supabase
          if (isSupabaseConfigured() && result.tx && !result.tx.startsWith("skipped")) {
            supabaseAdmin.from("sol_deposits")
              .update({ deploy_tx: result.tx })
              .eq("deposit_tx", txSignature)
              .then(() => {});
          }
        }
      })
      .catch((err) => console.error(`Capital deployment error for ${vaultName}:`, err));

    return NextResponse.json({
      success: true,
      data: {
        mintTx: mintSig,
        sharesMinted: sharesToMint,
        usdcReceived,
      },
    });
  } catch (error) {
    console.error("POST /api/deposit error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Deposit failed" },
      { status: 500 },
    );
  }
}
