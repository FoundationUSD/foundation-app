/**
 * GET /api/cron/sweep-idle
 *
 * Sweeps idle USDC sitting in vault PDA USDC ATAs back into the underlying
 * protocol legs. Idle USDC accumulates when:
 *   - A deposit's deploy step partially failed (one leg deployed, others didn't)
 *   - A withdraw's unwind pulled extra USDC into the vault that wasn't claimed
 *   - Manual deposits to the vault PDA outside the deposit flow
 *
 * Different from /api/cron/retry-deploy which scans Supabase deposit rows.
 * This cron looks at on-chain state and reconciles regardless of ledger state.
 *
 * Call every 30–60 minutes.
 */

import { NextRequest, NextResponse } from "next/server";
import { Connection, PublicKey } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } from "@solana/spl-token";
import { getVaultAddresses, type VaultName } from "@/lib/solana/squads";
import { deployCapital } from "@/lib/deploy-capital";

export const dynamic = "force-dynamic";

const USDC_MINT = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");

// Sweep threshold — leave at least this much idle to avoid sweeping dust
// (and to keep enough buffer for outstanding withdraw requests). Tune up if
// withdraw traffic is high.
const SWEEP_THRESHOLD_USDC = 0.5;

// Vaults the sweeper services. Read-only — sweep can't pick up vaults not
// listed here. Adding a new vault to this list opts it in.
const SWEEP_VAULTS: VaultName[] = ["solomon", "kamino", "oro", "awy", "awy2x", "awy3x"];

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization");
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rpcUrl = process.env.SOLANA_RPC_URL || process.env.NEXT_PUBLIC_SOLANA_RPC_URL!;
  const connection = new Connection(rpcUrl, "confirmed");

  const results: Array<Record<string, unknown>> = [];

  for (const vaultName of SWEEP_VAULTS) {
    try {
      const vault = getVaultAddresses(vaultName);
      const usdcAta = vault.usdcAta
        || getAssociatedTokenAddressSync(USDC_MINT, vault.vaultPda, true, TOKEN_PROGRAM_ID);

      const bal = await connection.getTokenAccountBalance(usdcAta).catch(() => null);
      const idleBaseUnits = bal ? Number(bal.value.amount) : 0;
      const idleUsdc = idleBaseUnits / 1e6;

      if (idleUsdc < SWEEP_THRESHOLD_USDC) {
        results.push({ vault: vaultName, idleUsdc, action: "skipped (under threshold)" });
        continue;
      }

      // Sweep the full idle amount. deployCapital handles per-leg failure
      // gracefully — if a leg's deploy fails, that slice stays idle and the
      // next sweep cycle retries it.
      const r = await deployCapital(vaultName, idleBaseUnits);
      results.push({
        vault: vaultName,
        idleUsdc,
        action: r.success ? "deployed" : "deploy-failed",
        tx: r.tx,
        error: r.error,
      });
      console.log(`[sweep-idle] ${vaultName}: ${idleUsdc} USDC → ${r.success ? "deployed" : "failed"} (${r.error ?? r.tx})`);
    } catch (e) {
      results.push({
        vault: vaultName,
        action: "error",
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return NextResponse.json({ success: true, data: { swept: results.filter((r) => r.action === "deployed").length, results } });
}
