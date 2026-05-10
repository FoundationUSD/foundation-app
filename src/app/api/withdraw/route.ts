/**
 * POST /api/withdraw
 *
 * Atomic withdraw — server-orchestrated, single-Squads-tx burn + transfer.
 *
 * Contract:
 *   Request:  { vaultId, amount, userWallet, feeTxSignature }
 *     - amount: USDC base units (6-dec)
 *     - feeTxSignature: client-signed tx that paid the protocol fee +
 *       (if needed) granted vault-PDA delegate authority over the receipt
 *       token ATA. Acts as the user's proof-of-intent and the idempotency key.
 *   Response: { success, data: { transferTx, usdcReturned } }
 *
 * Flow:
 *   1. Verify feeTxSignature: on-chain, no err, transferred PROTOCOL_FEE_SOL
 *      from userWallet → vault authority, and not previously consumed.
 *   2. Validate user's ledger entitlement (sol_deposits - sol_withdrawals >= amount).
 *   3. Read user's on-chain receipt-token ATA balance + delegate state.
 *   4. If ATA has tokens AND vault PDA is approved as delegate: burn via
 *      delegate inside the server's Squads tx.
 *      If ATA has tokens but vault PDA is NOT delegate: return 412 — client
 *      re-signs the fee tx with an Approve ix bundled and retries.
 *      If ATA has 0 tokens: skip burn (recovery flow).
 *   5. Ensure vault has enough idle USDC; unwind via withdrawCapital if not.
 *   6. Run one Squads tx: [optional BurnChecked via delegate, TransferChecked].
 *      Either succeeds end-to-end or reverts entirely.
 *   7. Insert sol_withdrawals row keyed on burn_tx = feeTxSignature.
 */

import { NextRequest, NextResponse } from "next/server";
import { PublicKey, Connection, LAMPORTS_PER_SOL, TransactionInstruction } from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  createTransferCheckedInstruction,
  createBurnCheckedInstruction,
  createAssociatedTokenAccountIdempotentInstruction,
  getAssociatedTokenAddressSync,
  getAccount,
} from "@solana/spl-token";
import { executeVaultTransaction, getVaultAddresses, vaultIdToName } from "@/lib/solana/squads";
import { isSupabaseConfigured, supabaseAdmin } from "@/lib/supabase-server";
import { withdrawCapital } from "@/lib/deploy-capital";
import { validatePublicKey, validateAmount, validateTxSignature, badRequest } from "@/lib/api-validation";
import { notify } from "@/lib/notifications";
import { FOUNDATION_VAULTS } from "@/lib/vaults";
import { PROTOCOL_FEE_SOL } from "@/lib/constants";

export const dynamic = "force-dynamic";

const USDC_MINT = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
const USDC_DECIMALS = 6;
const RECEIPT_DECIMALS = 6; // Foundation receipt mints all use 6 dec.
const MIN_AUTHORITY_SOL = 0.01;
const MIN_FEE_LAMPORTS = Math.floor(PROTOCOL_FEE_SOL * LAMPORTS_PER_SOL);
const VAULT_AUTHORITY_PUBKEY_STR = "4J9mszyDLi4js4rh8Hq5spNaLCNt4fRozr781zcVBYgv";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { vaultId, amount, userWallet, feeTxSignature } = body;

    // 1. Validate inputs
    if (!vaultId || typeof vaultId !== "string") {
      return NextResponse.json(badRequest({ field: "vaultId", code: "missing", message: "vaultId is required" }), { status: 400 });
    }
    const walletErr = validatePublicKey("userWallet", userWallet);
    if (walletErr) return NextResponse.json(badRequest(walletErr), { status: 400 });
    const amtErr = validateAmount("amount", amount);
    if (amtErr) return NextResponse.json(badRequest(amtErr), { status: 400 });
    const feeSigErr = validateTxSignature("feeTxSignature", feeTxSignature);
    if (feeSigErr) return NextResponse.json(badRequest(feeSigErr), { status: 400 });

    const requestedBaseUnits = Number(amount);

    // 2. Resolve vault
    let vaultName;
    try {
      vaultName = vaultIdToName(vaultId);
    } catch {
      return NextResponse.json({ success: false, error: "Unknown vault" }, { status: 400 });
    }

    const vault = getVaultAddresses(vaultName);
    if (!vault.mint) {
      return NextResponse.json({ success: false, error: "Vault mint not configured" }, { status: 500 });
    }

    if (!isSupabaseConfigured()) {
      return NextResponse.json(
        { success: false, error: "Database not configured — cannot process withdrawals safely" },
        { status: 503 },
      );
    }

    // 3. Idempotency — fee tx already consumed?
    const { data: dupe } = await supabaseAdmin
      .from("sol_withdrawals")
      .select("id, transfer_tx, usdc_returned")
      .eq("burn_tx", feeTxSignature)
      .limit(1);
    if (dupe && dupe.length > 0) {
      return NextResponse.json(
        { success: false, error: "This fee transaction was already used for a withdrawal" },
        { status: 409 },
      );
    }

    // 4. Validate ledger entitlement
    const [{ data: deposits }, { data: withdrawals }] = await Promise.all([
      supabaseAdmin
        .from("sol_deposits")
        .select("usdc_amount")
        .eq("vault_id", vaultId)
        .eq("wallet", userWallet),
      supabaseAdmin
        .from("sol_withdrawals")
        .select("usdc_returned")
        .eq("vault_id", vaultId)
        .eq("wallet", userWallet),
    ]);
    const totalDeposited = (deposits || []).reduce((s: number, d: { usdc_amount: number | string }) => s + Number(d.usdc_amount), 0);
    const totalWithdrawn = (withdrawals || []).reduce((s: number, w: { usdc_returned: number | string }) => s + Number(w.usdc_returned), 0);
    const entitlement = totalDeposited - totalWithdrawn;

    if (entitlement <= 0) {
      return NextResponse.json(
        { success: false, error: "No withdrawable balance for this wallet" },
        { status: 400 },
      );
    }
    if (requestedBaseUnits > entitlement) {
      return NextResponse.json(
        { success: false, error: `Requested ${requestedBaseUnits / 1e6} exceeds entitlement ${entitlement / 1e6}` },
        { status: 400 },
      );
    }

    // 5. Server SOL check
    const rpcUrl = process.env.SOLANA_RPC_URL || process.env.NEXT_PUBLIC_SOLANA_RPC_URL!;
    const connection = new Connection(rpcUrl, "confirmed");
    const authoritySecret = process.env.VAULT_AUTHORITY_SECRET;
    if (!authoritySecret) {
      return NextResponse.json({ success: false, error: "Server configuration error" }, { status: 500 });
    }
    const bs58 = await import("bs58");
    const { Keypair } = await import("@solana/web3.js");
    const authority = Keypair.fromSecretKey(bs58.default.decode(authoritySecret));
    const authBalance = await connection.getBalance(authority.publicKey);
    if (authBalance < MIN_AUTHORITY_SOL * LAMPORTS_PER_SOL) {
      return NextResponse.json(
        { success: false, error: "Vault temporarily unavailable. Please try again later." },
        { status: 503 },
      );
    }

    // 6. Verify the protocol fee tx — user must have paid PROTOCOL_FEE_SOL
    //    to the vault authority before we process anything. The tx signature
    //    serves as the idempotency key (already checked above against
    //    sol_withdrawals.burn_tx).
    const feeTx = await connection.getTransaction(feeTxSignature, {
      commitment: "confirmed",
      maxSupportedTransactionVersion: 0,
    });
    if (!feeTx) {
      return NextResponse.json(
        { success: false, error: "Fee transaction not found. Wait a moment and retry." },
        { status: 404 },
      );
    }
    if (feeTx.meta?.err) {
      return NextResponse.json(
        { success: false, error: "Fee transaction failed on-chain" },
        { status: 400 },
      );
    }
    // Verify the fee tx actually transferred ≥ MIN_FEE_LAMPORTS from the
    // user wallet to the vault authority. Reading native lamport deltas via
    // pre/post balances is robust to compute-budget ixs and ix re-ordering.
    {
      const msg = feeTx.transaction.message;
      const accountKeys = (msg as { staticAccountKeys?: PublicKey[] }).staticAccountKeys
        ?? (msg as { accountKeys?: PublicKey[] }).accountKeys
        ?? [];
      const preBal = feeTx.meta?.preBalances ?? [];
      const postBal = feeTx.meta?.postBalances ?? [];
      const userIdx = accountKeys.findIndex((k) => k.toBase58() === userWallet);
      const authIdx = accountKeys.findIndex((k) => k.toBase58() === VAULT_AUTHORITY_PUBKEY_STR);
      if (userIdx < 0 || authIdx < 0) {
        return NextResponse.json(
          { success: false, error: "Fee tx must reference both the user wallet and vault authority" },
          { status: 400 },
        );
      }
      const authDelta = postBal[authIdx] - preBal[authIdx];
      if (authDelta < MIN_FEE_LAMPORTS) {
        return NextResponse.json(
          { success: false, error: `Fee transfer too small (got ${authDelta} lamports, need ${MIN_FEE_LAMPORTS})` },
          { status: 400 },
        );
      }
      // userIdx must be a signer (slot < numRequiredSignatures) — guarantees the user authorised this fee.
      const numSigners = (msg as { header?: { numRequiredSignatures?: number } }).header?.numRequiredSignatures ?? 1;
      if (userIdx >= numSigners) {
        return NextResponse.json(
          { success: false, error: "Fee tx signer does not match userWallet" },
          { status: 400 },
        );
      }
    }

    // 7. Read user's receipt-token ATA + delegate state
    const userPubkey = new PublicKey(userWallet);
    const userReceiptAta = getAssociatedTokenAddressSync(vault.mint, userPubkey, false, TOKEN_2022_PROGRAM_ID);

    let ataBalance = BigInt(0);
    let delegateOk = false;
    try {
      const acct = await getAccount(connection, userReceiptAta, "confirmed", TOKEN_2022_PROGRAM_ID);
      ataBalance = acct.amount;
      delegateOk = acct.delegate?.equals(vault.vaultPda) === true && acct.delegatedAmount > BigInt(0);
    } catch {
      // ATA doesn't exist — nothing to burn (recovery flow).
    }

    // Burn amount: at most what the ATA holds, capped by request.
    const requestedBig = BigInt(requestedBaseUnits);
    const burnAmount = ataBalance > BigInt(0)
      ? (ataBalance < requestedBig ? ataBalance : requestedBig)
      : BigInt(0);

    // If user has tokens but hasn't approved delegate, ask them to approve.
    if (burnAmount > BigInt(0) && !delegateOk) {
      return NextResponse.json(
        {
          success: false,
          needsApproval: true,
          error: "Delegate approval required",
          data: {
            mint: vault.mint.toBase58(),
            ata: userReceiptAta.toBase58(),
            delegate: vault.vaultPda.toBase58(),
            decimals: RECEIPT_DECIMALS,
          },
        },
        { status: 412 },
      );
    }

    // 6. Ensure vault has enough idle USDC. If not, unwind protocol positions.
    const vaultUsdcAta = vault.usdcAta
      || getAssociatedTokenAddressSync(USDC_MINT, vault.vaultPda, true, TOKEN_PROGRAM_ID);

    let idle = await connection.getTokenAccountBalance(vaultUsdcAta).then((r) => Number(r.value.amount)).catch(() => 0);
    if (idle < requestedBaseUnits) {
      // Try to free up enough USDC by unwinding protocol positions.
      console.log(`[withdraw ${vaultName}] idle=${idle / 1e6} requested=${requestedBaseUnits / 1e6} → unwinding`);
      const r = await withdrawCapital(vaultName, requestedBaseUnits);
      if (!r.success) {
        console.warn(`[withdraw ${vaultName}] unwind failed: ${r.error}`);
      }
      idle = await connection.getTokenAccountBalance(vaultUsdcAta).then((r) => Number(r.value.amount)).catch(() => 0);
    }

    // Hard requirement: vault must have AT LEAST what was requested.
    // No partial-fulfilment (bad UX). The /api/user/portfolio endpoint
    // exposes maxWithdrawableUsdc so the form's Max button is set to the
    // actual recoverable amount up front — users shouldn't hit this case
    // unless they typed an amount > maxWithdrawable.
    if (idle < requestedBaseUnits) {
      return NextResponse.json(
        {
          success: false,
          error: `Max withdrawable right now is ${(idle / 1e6).toFixed(4)} USDC. Try that amount or wait a few minutes for protocol liquidity.`,
          data: { maxWithdrawableUsdc: idle / 1e6 },
        },
        { status: 503 },
      );
    }

    // Burn amount stays as computed up top — paid exactly as requested.
    const burnPayable = burnAmount;
    const payableBaseUnits = requestedBaseUnits;

    // 7. Build the atomic Squads tx: [optional burn via delegate, transfer USDC].
    const ixs: TransactionInstruction[] = [];

    if (burnPayable > BigInt(0)) {
      ixs.push(
        createBurnCheckedInstruction(
          userReceiptAta,
          vault.mint,
          vault.vaultPda,        // delegate signer (vault PDA executes via Squads)
          burnPayable,
          RECEIPT_DECIMALS,
          [],
          TOKEN_2022_PROGRAM_ID,
        ),
      );
    }

    const userUsdcAta = getAssociatedTokenAddressSync(USDC_MINT, userPubkey, false, TOKEN_PROGRAM_ID);
    // Idempotent ATA create — Phantom (and other wallets) auto-close USDC
    // ATAs that hit zero balance, so by the time we transfer the destination
    // may not exist. The instruction is a no-op when the ATA already exists.
    // Vault PDA is the payer; pre-funded with rent buffer at vault setup.
    ixs.push(
      createAssociatedTokenAccountIdempotentInstruction(
        vault.vaultPda,    // funder
        userUsdcAta,
        userPubkey,
        USDC_MINT,
        TOKEN_PROGRAM_ID,
      ),
    );
    ixs.push(
      createTransferCheckedInstruction(
        vaultUsdcAta,
        USDC_MINT,
        userUsdcAta,
        vault.vaultPda,
        BigInt(payableBaseUnits),
        USDC_DECIMALS,
        [],
        TOKEN_PROGRAM_ID,
      ),
    );

    const sig = await executeVaultTransaction(vaultName, ixs);

    // 8. Log success. burn_tx stores the user-signed fee/approve tx (the
    //    idempotency key — checked at the top of this route). transfer_tx
    //    stores the server's atomic Squads tx that did the burn + transfer.
    //    usdc_returned is what was actually paid (may be < requested due to
    //    slippage); the residual stays in the user's ledger entitlement.
    const { error: insertErr } = await supabaseAdmin.from("sol_withdrawals").insert({
      vault_id: vaultId,
      wallet: userWallet,
      shares_burned: Number(burnPayable),
      usdc_returned: payableBaseUnits,
      burn_tx: feeTxSignature,
      transfer_tx: sig,
    });
    if (insertErr) {
      // The on-chain tx already happened. Logging failure is non-fatal but
      // creates ledger drift — alert and recover via reconciliation cron.
      console.error("[withdraw] LEDGER DRIFT — Supabase insert failed after successful tx:", insertErr, "tx:", sig);
    }

    const partial = payableBaseUnits < requestedBaseUnits;
    const residualBaseUnits = requestedBaseUnits - payableBaseUnits;

    const vaultMeta = FOUNDATION_VAULTS.find((v) => v.id === vaultId);
    notify({
      wallet: userWallet,
      type: "withdrawal",
      title: `Withdrawal confirmed: ${(payableBaseUnits / 1e6).toFixed(4)} USDC from ${vaultMeta?.receiptToken ?? vaultId}`,
      body: partial
        ? `Withdrew ${(payableBaseUnits / 1e6).toFixed(4)} USDC. ${(residualBaseUnits / 1e6).toFixed(4)} USDC stays in your entitlement (slippage on protocol unwind) — claim it on your next withdraw.`
        : `Your withdrawal of ${(payableBaseUnits / 1e6).toFixed(2)} USDC is complete.`,
      link: `${process.env.NEXT_PUBLIC_APP_URL || ""}/portfolio`,
      metadata: { vault_id: vaultId, usdc: payableBaseUnits, transfer_tx: sig, residual: residualBaseUnits },
    }).catch((e) => console.error("withdraw notify failed:", e));

    return NextResponse.json({
      success: true,
      data: {
        transferTx: sig,
        usdcReturned: payableBaseUnits,
        sharesBurned: Number(burnPayable),
        requested: requestedBaseUnits,
        residual: residualBaseUnits,
        partial,
      },
    });
  } catch (error) {
    console.error("POST /api/withdraw error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Withdrawal failed" },
      { status: 500 },
    );
  }
}
