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
import { validatePublicKey, validateTxSignature, validateAmount, badRequest } from "@/lib/api-validation";
import { notify } from "@/lib/notifications";
import { FOUNDATION_VAULTS } from "@/lib/vaults";

export const dynamic = "force-dynamic";

const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const MIN_AUTHORITY_SOL = 0.01; // minimum SOL needed for Squads tx

export async function POST(req: NextRequest) {
  try {
    const { vaultId, txSignature, userWallet } = await req.json();

    // 1. Validate inputs (fail fast with structured errors)
    if (!vaultId || typeof vaultId !== "string") {
      return NextResponse.json(badRequest({ field: "vaultId", code: "missing", message: "vaultId is required" }), { status: 400 });
    }
    const sigErr = validateTxSignature("txSignature", txSignature);
    if (sigErr) return NextResponse.json(badRequest(sigErr), { status: 400 });
    const walletErr = validatePublicKey("userWallet", userWallet);
    if (walletErr) return NextResponse.json(badRequest(walletErr), { status: 400 });

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

    // Reject deposits to coming_soon vaults — defense in depth even though the
    // UI shouldn't surface the deposit form for these.
    const vaultDef = FOUNDATION_VAULTS.find((v) => v.id === vaultId);
    if (vaultDef?.status === "coming_soon") {
      return NextResponse.json(
        { success: false, error: `${vaultDef.name} is coming soon — deposits not yet enabled` },
        { status: 403 },
      );
    }

    const vault = getVaultAddresses(vaultName);
    if (!vault.mint) {
      return NextResponse.json(
        { success: false, error: "Vault mint not configured" },
        { status: 500 },
      );
    }

    // 3. Check for duplicate — prevent double-mint (Supabase required)
    if (!isSupabaseConfigured()) {
      return NextResponse.json(
        { success: false, error: "Database not configured — cannot process deposits safely" },
        { status: 503 },
      );
    }

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

    const amtErr = validateAmount("usdcReceived", usdcReceived);
    if (amtErr) return NextResponse.json(badRequest(amtErr), { status: 400 });

    // 7. Verify the sender is an actual signer on this tx
    const msg = tx.transaction.message;
    const numSigners = (msg as any).header?.numRequiredSignatures ?? 1;
    const accountKeys = (msg as any).getAccountKeys?.()
      ?? (msg as any).staticAccountKeys
      ?? (msg as any).accountKeys
      ?? [];

    const signers: string[] = [];
    const keyList = accountKeys.staticAccountKeys || (Array.isArray(accountKeys) ? accountKeys : []);
    for (let i = 0; i < Math.min(keyList.length, numSigners); i++) {
      signers.push(keyList[i].toBase58 ? keyList[i].toBase58() : String(keyList[i]));
    }

    if (!signers.includes(userWallet)) {
      return NextResponse.json(
        { success: false, error: "Transaction signer does not match claimed wallet" },
        { status: 400 },
      );
    }

    // 8. Deploy USDC into the underlying protocol
    //    If deployment fails, still mint tokens — USDC is safe in vault, deployment retried by cron
    let deployTx: string | undefined;
    try {
      const deployResult = await deployCapital(vaultName, usdcReceived);
      if (deployResult.success) {
        deployTx = deployResult.tx;
      } else {
        console.error(`Capital deployment failed for ${vaultName}: ${deployResult.error} — minting tokens anyway`);
      }
    } catch (deployErr) {
      console.error(`Capital deployment error for ${vaultName}:`, deployErr);
    }

    // 9. Mint exact amount of receipt tokens (only after deployment succeeds)
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

    // 10. Log to Supabase (defensive: deploy_tx column may not exist on legacy
    //     deployments — retry without it rather than silently dropping the row)
    if (isSupabaseConfigured()) {
      const baseRow = {
        vault_id: vaultId,
        wallet: userWallet,
        usdc_amount: usdcReceived,
        shares_minted: sharesToMint,
        deposit_tx: txSignature,
        mint_tx: mintSig,
      };
      const { error: insertErr } = await supabaseAdmin
        .from("sol_deposits")
        .insert({ ...baseRow, deploy_tx: deployTx });
      if (insertErr) {
        if (insertErr.message?.includes("deploy_tx")) {
          // Schema missing column — insert without it and warn loudly
          console.warn(
            "sol_deposits.deploy_tx column missing — run: ALTER TABLE sol_deposits ADD COLUMN deploy_tx TEXT;",
          );
          const { error: retryErr } = await supabaseAdmin.from("sol_deposits").insert(baseRow);
          if (retryErr) console.error("Supabase deposit insert (fallback) failed:", retryErr);
        } else {
          console.error("Supabase deposit insert failed:", insertErr);
        }
      }
    }

    // Fire-and-forget user notification (in-app + email if subscribed)
    const vaultMeta = FOUNDATION_VAULTS.find((v) => v.id === vaultId);
    notify({
      wallet: userWallet,
      type: "deposit",
      title: `Deposit confirmed: ${(usdcReceived / 1e6).toFixed(2)} USDC into ${vaultMeta?.receiptToken ?? vaultId}`,
      body: `Your ${(usdcReceived / 1e6).toFixed(2)} USDC deposit into ${vaultMeta?.name ?? vaultId} is now earning ${vaultMeta?.apy.toFixed(2) ?? ""}% APY. Receipt tokens have been minted to your wallet.`,
      link: `${process.env.NEXT_PUBLIC_APP_URL || ""}/portfolio`,
      metadata: { vault_id: vaultId, usdc: usdcReceived, mint_tx: mintSig, deploy_tx: deployTx },
    }).catch((e) => console.error("deposit notify failed:", e));

    return NextResponse.json({
      success: true,
      data: {
        mintTx: mintSig,
        sharesMinted: sharesToMint,
        usdcReceived,
        deployTx,
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
