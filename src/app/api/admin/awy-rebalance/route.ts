import { NextRequest, NextResponse } from "next/server";
import { Connection } from "@solana/web3.js";
import { getVaultAddresses } from "@/lib/solana/squads";
import { deployCapital } from "@/lib/deploy-capital";
import { SOLANA_RPC_URL } from "@/lib/constants";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/awy-rebalance
 *
 * Picks up whatever idle USDC is sitting in the AWY vault USDC ATA and
 * re-runs `deployCapital("awy", idleUsdc)` on it. Returns per-leg deploy
 * results so we can see exactly which legs succeeded/failed without waiting
 * for a user deposit.
 *
 * Auth: Bearer token matching CRON_SECRET (same gate as the cron jobs).
 *
 * Optional query params:
 *   ?dry=1         — don't deploy, just report idle balance
 *   ?max=<usdc>    — cap the deploy amount (USDC units, e.g. ?max=5)
 */
export async function POST(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization");
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const dry = url.searchParams.get("dry") === "1";
  const maxUsdc = url.searchParams.get("max");

  const conn = new Connection(SOLANA_RPC_URL, "confirmed");
  const vault = getVaultAddresses("awy");
  if (!vault.usdcAta) {
    return NextResponse.json({ error: "AWY vault USDC ATA missing" }, { status: 500 });
  }

  const balRes = await conn.getTokenAccountBalance(vault.usdcAta).catch(() => null);
  const idleBaseUnits = balRes ? Number(balRes.value.amount) : 0;
  const idleUsdc = idleBaseUnits / 1e6;

  // Reserve a small buffer so we don't drain everything (avoids edge cases
  // where a concurrent withdrawal needs idle USDC).
  const BUFFER_USDC = 0.5;
  const targetBaseUnits = Math.max(
    0,
    idleBaseUnits - Math.floor(BUFFER_USDC * 1e6),
  );

  let deployBaseUnits = targetBaseUnits;
  if (maxUsdc) {
    const cap = Math.floor(Number(maxUsdc) * 1e6);
    if (Number.isFinite(cap) && cap > 0) {
      deployBaseUnits = Math.min(deployBaseUnits, cap);
    }
  }

  if (dry || deployBaseUnits === 0) {
    return NextResponse.json({
      success: true,
      vaultPda: vault.vaultPda.toBase58(),
      usdcAta: vault.usdcAta.toBase58(),
      idleUsdc,
      bufferUsdc: BUFFER_USDC,
      deployableUsdc: deployBaseUnits / 1e6,
      dryRun: true,
    });
  }

  const result = await deployCapital("awy", deployBaseUnits);

  return NextResponse.json({
    success: result.success,
    vaultPda: vault.vaultPda.toBase58(),
    idleUsdcBefore: idleUsdc,
    deployedUsdc: deployBaseUnits / 1e6,
    deploy: result,
  });
}
