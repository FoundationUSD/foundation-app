import { NextRequest, NextResponse } from "next/server";
import { Connection, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { isSupabaseConfigured, supabaseAdmin } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

const VAULTS = [
  { id: "fdn-solomon", usdc: "VAULT_SOLOMON_USDC_ATA", mint: "NEXT_PUBLIC_SOLOMON_MINT" },
  { id: "fdn-kamino", usdc: "VAULT_KAMINO_USDC_ATA", mint: "NEXT_PUBLIC_KAMINO_MINT" },
  { id: "fdn-oro", usdc: "VAULT_ORO_USDC_ATA", mint: "NEXT_PUBLIC_ORO_MINT" },
];

/**
 * GET /api/cron/sync-state
 *
 * Reads on-chain state for all vaults and authority.
 * Logs to Supabase. Call every hour.
 */
export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = req.headers.get("authorization");
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const rpcUrl = process.env.SOLANA_RPC_URL || process.env.NEXT_PUBLIC_SOLANA_RPC_URL!;
  const connection = new Connection(rpcUrl, "confirmed");
  const state: Record<string, unknown>[] = [];

  // Authority SOL balance
  let authSol = 0;
  try {
    const bs58 = await import("bs58");
    const { Keypair } = await import("@solana/web3.js");
    const auth = Keypair.fromSecretKey(bs58.default.decode(process.env.VAULT_AUTHORITY_SECRET!));
    authSol = (await connection.getBalance(auth.publicKey)) / LAMPORTS_PER_SOL;
  } catch {}

  // Per-vault
  for (const v of VAULTS) {
    const entry: Record<string, unknown> = { vault: v.id };
    const usdcAddr = process.env[v.usdc];
    const mintAddr = process.env[v.mint];

    if (usdcAddr) {
      try {
        const bal = await connection.getTokenAccountBalance(new PublicKey(usdcAddr));
        entry.usdcBalance = Number(bal.value.amount);
        entry.usdcDisplay = bal.value.uiAmountString;
      } catch { entry.usdcBalance = 0; }
    }

    if (mintAddr) {
      try {
        const supply = await connection.getTokenSupply(new PublicKey(mintAddr));
        entry.tokenSupply = Number(supply.value.amount);
        entry.supplyDisplay = supply.value.uiAmountString;
      } catch { entry.tokenSupply = 0; }
    }

    const usdc = Number(entry.usdcBalance || 0);
    const supply = Number(entry.tokenSupply || 0);
    entry.fullyBacked = usdc >= supply;
    entry.backingRatio = supply > 0 ? ((usdc / supply) * 100).toFixed(1) + "%" : "N/A";

    state.push(entry);

    // Log to Supabase
    if (isSupabaseConfigured()) {
      try {
        await supabaseAdmin.from("sol_nav_history").insert({
          vault_id: v.id,
          rate_bps: 0,
          apy: 0,
          tvl_usdc: usdc,
          total_shares: supply,
          metadata: { ...entry, authoritySol: authSol },
        });
      } catch {
        // non-critical
      }
    }
  }

  return NextResponse.json({
    success: true,
    data: {
      authoritySol: authSol,
      authorityLow: authSol < 0.05,
      vaults: state,
      timestamp: new Date().toISOString(),
    },
  });
}
