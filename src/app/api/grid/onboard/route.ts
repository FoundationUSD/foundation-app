import { NextRequest, NextResponse } from "next/server";
import { Connection, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { createWalletAccount, initiateEmailAccount } from "@/lib/grid/accounts";
import { ACCOUNT_SETUP_FEE_SOL, FEE_EXEMPT_WALLETS } from "@/lib/grid/client";
import { isSupabaseConfigured, supabaseAdmin } from "@/lib/supabase-server";
import { SOLANA_RPC_URL, VAULT_AUTHORITY_PUBKEY } from "@/lib/constants";

export const dynamic = "force-dynamic";

interface WalletRequest {
  authMode: "wallet";
  userWallet: string;
  /** Solana tx signature where the user paid the 0.024 SOL setup fee to Foundation. */
  feeTxSignature?: string;
}

interface EmailRequest {
  authMode: "email";
  email: string;
}

type OnboardRequest = WalletRequest | EmailRequest;

/**
 * POST /api/grid/onboard
 *
 * Wallet path (synchronous):
 *   1. Verify the user paid the setup fee on-chain (or is exempt).
 *   2. Create a 2-of-2 Grid smart account (Foundation co-signer + user wallet).
 *   3. Persist mapping in sol_user_accounts.
 *
 * Email path (asynchronous, two-step):
 *   1. Initiate Privy OTP — user receives email.
 *   2. Caller submits OTP code via /api/grid/onboard/complete (separate endpoint).
 */
export async function POST(req: NextRequest) {
  let body: OnboardRequest;
  try {
    body = (await req.json()) as OnboardRequest;
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON body" }, { status: 400 });
  }

  if (body.authMode === "wallet") {
    return handleWalletOnboard(body);
  }
  if (body.authMode === "email") {
    return handleEmailInitiate(body);
  }
  return NextResponse.json({ success: false, error: "authMode must be 'wallet' or 'email'" }, { status: 400 });
}

async function handleWalletOnboard(req: WalletRequest) {
  // 1. Validate wallet address
  let userPk: PublicKey;
  try {
    userPk = new PublicKey(req.userWallet);
  } catch {
    return NextResponse.json({ success: false, error: "Invalid userWallet" }, { status: 400 });
  }

  const exempt = FEE_EXEMPT_WALLETS.has(req.userWallet);

  // 2. Verify setup-fee tx (skipped for fee-exempt wallets like the test wallet)
  if (!exempt) {
    if (!req.feeTxSignature) {
      return NextResponse.json(
        { success: false, error: `Setup fee required: send ${ACCOUNT_SETUP_FEE_SOL} SOL to ${VAULT_AUTHORITY_PUBKEY} and pass feeTxSignature` },
        { status: 402 },
      );
    }
    const conn = new Connection(SOLANA_RPC_URL, "confirmed");
    try {
      const tx = await conn.getParsedTransaction(req.feeTxSignature, { maxSupportedTransactionVersion: 0 });
      if (!tx || tx.meta?.err) throw new Error("Fee tx not confirmed or failed");

      const transferred = (tx.transaction.message.instructions as Array<{ parsed?: { type?: string; info?: { source?: string; destination?: string; lamports?: number } } }>)
        .filter((ix) => ix.parsed?.type === "transfer")
        .reduce((s, ix) => {
          const info = ix.parsed?.info;
          const isFromUser = info?.source === req.userWallet;
          const isToFoundation = info?.destination === VAULT_AUTHORITY_PUBKEY;
          return s + (isFromUser && isToFoundation ? Number(info?.lamports || 0) : 0);
        }, 0);

      const expected = Math.floor(ACCOUNT_SETUP_FEE_SOL * LAMPORTS_PER_SOL);
      if (transferred < expected) {
        return NextResponse.json({ success: false, error: `Fee tx transferred ${transferred} lamports, expected >= ${expected}` }, { status: 402 });
      }
    } catch (err) {
      return NextResponse.json({ success: false, error: `Fee verification failed: ${err instanceof Error ? err.message : err}` }, { status: 402 });
    }
  }

  // 3. Idempotency — return existing account if user already onboarded
  if (isSupabaseConfigured()) {
    const { data: existing } = await supabaseAdmin
      .from("sol_user_accounts")
      .select("smart_account, vault_pda, auth_mode")
      .eq("user_wallet", req.userWallet)
      .is("closed_at", null)
      .maybeSingle();
    if (existing) {
      return NextResponse.json({ success: true, account: existing, alreadyExisted: true });
    }
  }

  // 4. Create the 2-of-2 smart account on Grid
  let account;
  try {
    account = await createWalletAccount(req.userWallet);
  } catch (err) {
    return NextResponse.json({ success: false, error: `Grid createAccount failed: ${err instanceof Error ? err.message : err}` }, { status: 502 });
  }

  // 5. Persist mapping
  if (isSupabaseConfigured()) {
    await supabaseAdmin.from("sol_user_accounts").insert({
      smart_account: account.address,
      vault_pda: account.vaultAddress ?? null,
      user_wallet: req.userWallet,
      user_pubkey: req.userWallet,
      auth_mode: "wallet",
      setup_fee_paid: exempt ? 0 : ACCOUNT_SETUP_FEE_SOL,
      fee_exempt: exempt,
    });
  }

  return NextResponse.json({ success: true, account, exempt });
}

async function handleEmailInitiate(req: EmailRequest) {
  if (!req.email || !req.email.includes("@")) {
    return NextResponse.json({ success: false, error: "Invalid email" }, { status: 400 });
  }
  try {
    const otp = await initiateEmailAccount(req.email);
    // The OTP id is opaque; client passes it back to /complete with the code.
    return NextResponse.json({ success: true, ...otp });
  } catch (err) {
    return NextResponse.json({ success: false, error: `Grid initAuth failed: ${err instanceof Error ? err.message : err}` }, { status: 502 });
  }
}
