import { NextRequest, NextResponse } from "next/server";
import { isSupabaseConfigured, supabaseAdmin } from "@/lib/supabase-server";
import { notify } from "@/lib/notifications";
import { FOUNDATION_VAULTS } from "@/lib/vaults";

export const dynamic = "force-dynamic";

const APY_DELTA_THRESHOLD_PP = Number(process.env.APY_DELTA_THRESHOLD_PP) || 2.0;

/**
 * Cron: detect significant APY moves and broadcast to subscribers.
 *
 * Compares each live vault's current APY (from /api/strategies, which reads
 * live data per-protocol) against the last known APY in sol_apy_state. If
 * |delta| ≥ APY_DELTA_THRESHOLD_PP percentage points (default 2.0), emits a
 * notification and updates state.
 *
 * Schedule: hourly via vercel.json or external cron.
 */
export async function GET(req: NextRequest) {
  // Optional bearer secret to prevent random hits
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const got = req.headers.get("authorization");
    if (got !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ success: false, error: "Database not configured" }, { status: 503 });
  }

  // Pull live APYs from /api/strategies (uses live readers per protocol)
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || `https://${req.headers.get("host")}`;
  const stratRes = await fetch(`${baseUrl}/api/strategies`, { cache: "no-store" }).catch(() => null);
  if (!stratRes || !stratRes.ok) {
    return NextResponse.json({ success: false, error: "Strategies API unreachable" }, { status: 502 });
  }
  const { data: strategies } = await stratRes.json();
  if (!Array.isArray(strategies)) {
    return NextResponse.json({ success: false, error: "Strategies payload invalid" }, { status: 502 });
  }

  type Strat = { id: string; name: string; apy: number; status: string };
  const live = (strategies as Strat[]).filter((s) => s.status === "live" && Number.isFinite(s.apy));

  // Load prior state
  const { data: prior } = await supabaseAdmin
    .from("sol_apy_state")
    .select("vault_id,last_apy");
  const priorByVault: Record<string, number> = {};
  for (const r of prior ?? []) priorByVault[r.vault_id] = Number(r.last_apy);

  const events: Array<{ vault_id: string; delta: number; from: number; to: number }> = [];

  for (const s of live) {
    const last = priorByVault[s.id];
    const current = s.apy;
    if (last === undefined) {
      // First seen — record baseline, no event
      await supabaseAdmin.from("sol_apy_state").upsert({
        vault_id: s.id,
        last_apy: current,
        last_change_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      continue;
    }
    const delta = current - last;
    if (Math.abs(delta) >= APY_DELTA_THRESHOLD_PP) {
      events.push({ vault_id: s.id, delta, from: last, to: current });
      const direction = delta > 0 ? "up" : "down";
      const sign = delta > 0 ? "+" : "";
      const vaultMeta = FOUNDATION_VAULTS.find((v) => v.id === s.id);
      await notify({
        wallet: null, // broadcast
        type: "apy_change",
        title: `${s.name}: APY ${direction} ${sign}${delta.toFixed(2)}pp`,
        body: `${s.name} APY moved from ${last.toFixed(2)}% to ${current.toFixed(2)}% (${sign}${delta.toFixed(2)} percentage points). Strategy: ${vaultMeta?.strategy ?? s.name}.`,
        link: `${baseUrl}/strategy/${s.id}`,
        metadata: { vault_id: s.id, from: last, to: current, delta },
      });
      await supabaseAdmin.from("sol_apy_state").upsert({
        vault_id: s.id,
        last_apy: current,
        last_change_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    } else {
      // Touch updated_at without changing baseline
      await supabaseAdmin
        .from("sol_apy_state")
        .update({ updated_at: new Date().toISOString() })
        .eq("vault_id", s.id);
    }
  }

  return NextResponse.json({
    success: true,
    data: { checked: live.length, events },
  });
}
