import { NextRequest, NextResponse } from "next/server";
import { isSupabaseConfigured, supabaseAdmin } from "@/lib/supabase-server";
import { deployCapital } from "@/lib/deploy-capital";
import { vaultIdToName } from "@/lib/solana/squads";

export const dynamic = "force-dynamic";

/**
 * GET /api/cron/retry-deploy
 *
 * Retries capital deployment for deposits where USDC was received and
 * tokens were minted but capital was not deployed to the protocol.
 *
 * Finds deposits with deploy_tx = null and retries deployCapital().
 * Call every 10–15 minutes.
 */
export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization");
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  }

  // Find deposits with no deploy_tx (failed or skipped deployment)
  const { data: pendingDeposits, error: fetchErr } = await supabaseAdmin
    .from("sol_deposits")
    .select("id, vault_id, usdc_amount, deposit_tx")
    .is("deploy_tx", null)
    .order("created_at", { ascending: true })
    .limit(5); // Process max 5 per cron run to avoid timeout

  if (fetchErr) {
    return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  }

  if (!pendingDeposits || pendingDeposits.length === 0) {
    return NextResponse.json({ success: true, data: { retried: 0, message: "No pending deployments" } });
  }

  const results: Record<string, unknown>[] = [];

  for (const deposit of pendingDeposits) {
    try {
      const vaultName = vaultIdToName(deposit.vault_id);
      const result = await deployCapital(vaultName, deposit.usdc_amount);

      if (result.success && result.tx && !result.tx.startsWith("skipped")) {
        await supabaseAdmin
          .from("sol_deposits")
          .update({ deploy_tx: result.tx })
          .eq("id", deposit.id);

        results.push({ id: deposit.id, vault: deposit.vault_id, status: "deployed", tx: result.tx });
        console.log(`Retry deploy: ${deposit.vault_id} deposit ${deposit.deposit_tx?.slice(0, 12)} → deployed: ${result.tx}`);
      } else if (result.tx?.startsWith("skipped")) {
        // Mark as skipped so we don't retry forever
        await supabaseAdmin
          .from("sol_deposits")
          .update({ deploy_tx: "skipped" })
          .eq("id", deposit.id);

        results.push({ id: deposit.id, vault: deposit.vault_id, status: "skipped" });
      } else {
        results.push({ id: deposit.id, vault: deposit.vault_id, status: "failed", error: result.error });
        console.error(`Retry deploy failed: ${deposit.vault_id} deposit ${deposit.deposit_tx?.slice(0, 12)}: ${result.error}`);
      }
    } catch (err) {
      results.push({ id: deposit.id, vault: deposit.vault_id, status: "error", error: err instanceof Error ? err.message : "Unknown" });
    }
  }

  return NextResponse.json({
    success: true,
    data: {
      retried: results.length,
      results,
    },
  });
}
