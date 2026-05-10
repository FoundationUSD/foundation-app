import { NextRequest, NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import { executeVaultTransaction, getVaultAddresses } from "@/lib/solana/squads";
import { isSupabaseConfigured, supabaseAdmin } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

const KAMINO_API = "https://api.kamino.finance";

async function fetchSolomonApy(): Promise<number> {
  // Compute APY from on-chain exchange rate: vaultUsdvBalance / susdvSupply
  // Compare current rate vs rate stored 7 days ago in Supabase
  try {
    const { Connection, PublicKey } = await import("@solana/web3.js");
    const rpcUrl = process.env.SOLANA_RPC_URL || process.env.NEXT_PUBLIC_SOLANA_RPC_URL!;
    const conn = new Connection(rpcUrl, "confirmed");

    const vaultUsdvAccount = new PublicKey("4AZVLwe6KinAmV3p7Hpj4PYQHrAGXhbpcCCiqLYRxwHf");
    const susdvMint = new PublicKey("pTA4St7D5WshfLUPBXoaxn5m8e3k2ort2DVt3gUTa17");

    const [usdvBal, susdvSupply] = await Promise.all([
      conn.getTokenAccountBalance(vaultUsdvAccount),
      conn.getTokenSupply(susdvMint),
    ]);

    const vaultUsdv = Number(usdvBal.value.amount);
    const totalSusdv = Number(susdvSupply.value.amount);
    if (totalSusdv === 0) return 12.5;

    const currentRate = vaultUsdv / totalSusdv;

    // Try to get historical rate from Supabase for APY calculation
    if (isSupabaseConfigured()) {
      const weekAgo = new Date(Date.now() - 7 * 86400_000).toISOString();
      const { data: history } = await supabaseAdmin
        .from("sol_nav_history")
        .select("metadata")
        .eq("vault_id", "fdn-solomon")
        .gte("created_at", weekAgo)
        .order("created_at", { ascending: true })
        .limit(1);

      if (history?.[0]?.metadata?.solomonRate) {
        const oldRate = history[0].metadata.solomonRate;
        const daysDiff = 7;
        const apy = (currentRate / oldRate - 1) * (365 / daysDiff) * 100;
        if (apy > 0 && apy < 50) {
          console.log(`Solomon live APY: ${apy.toFixed(2)}% (rate: ${currentRate.toFixed(6)} vs ${oldRate.toFixed(6)})`);
          return apy;
        }
      }

      // Store current rate for future APY calculation
      await supabaseAdmin.from("sol_nav_history").insert({
        vault_id: "fdn-solomon",
        rate_bps: 0,
        apy: 0,
        metadata: { solomonRate: currentRate, vaultUsdv, totalSusdv },
      });
    }

    return 12.5; // Fallback until we have historical data
  } catch (err) {
    console.error("Failed to compute Solomon APY:", err);
    return 12.5;
  }
}

async function fetchKaminoApy(): Promise<number> {
  try {
    const res = await fetch(
      `${KAMINO_API}/kamino-market/CqAoLuqWtavaVE8deBjMKe8ZfSt9ghR6Vb8nfsyabyHA/reserves/metrics`,
    );
    if (!res.ok) return 0;
    const data = await res.json();
    if (!Array.isArray(data)) return 0;
    const usdc = data.find(
      (r: Record<string, unknown>) => String(r.liquidityToken || "").toUpperCase() === "USDC",
    );
    return usdc ? Number(usdc.supplyApy || 0) * 100 : 0;
  } catch {
    return 0;
  }
}

async function fetchOroApy(): Promise<number> {
  return 3.5; // Gold leasing via Monetary Metals
}

/**
 * AWY blended APY = weighted sum of live per-leg APYs (or spec fallback per leg).
 * Uses the same getAwyData() that powers the UI so the receipt rate matches what
 * the user sees on the strategy page.
 */
async function fetchAwyApy(): Promise<number> {
  const { getAwyData } = await import("@/lib/integrations/awy");
  const data = await getAwyData();
  return data.blendedBaseApy > 0 ? data.blendedBaseApy : data.specBlendedApy;
}

/**
 * Tier-specific levered AWY APY. The leverage tier matches the on-chain
 * iterated-loop config in deploy-capital.ts (50% LTV for 2x, 80% LTV for 3x).
 * Returns net APY in percent (decimal × 100), matching the convention used by
 * the other fetchers.
 */
async function fetchAwyLeveredApy(tier: "2x" | "3x"): Promise<number> {
  const { getLeveragedAwyDataForTier } = await import("@/lib/integrations/awy");
  const data = await getLeveragedAwyDataForTier(tier);
  // netApy is in decimal form (0.21 = 21%). Convert to percent.
  return data.netApy > 0 ? data.netApy * 100 : 0;
}

type VaultRate = {
  name: "solomon" | "kamino" | "oro" | "awy" | "awy2x" | "awy3x";
  envMint: string;
  fetchApy: () => Promise<number>;
  haircut: number; // Foundation fee %
};

const VAULT_RATES: VaultRate[] = [
  { name: "solomon", envMint: "NEXT_PUBLIC_SOLOMON_MINT", fetchApy: fetchSolomonApy, haircut: 0.10 },
  { name: "kamino", envMint: "NEXT_PUBLIC_KAMINO_MINT", fetchApy: fetchKaminoApy, haircut: 0.10 },
  { name: "oro", envMint: "NEXT_PUBLIC_ORO_MINT", fetchApy: fetchOroApy, haircut: 0.10 },
  { name: "awy", envMint: "NEXT_PUBLIC_AWY_MINT", fetchApy: fetchAwyApy, haircut: 0.10 },
  { name: "awy2x", envMint: "NEXT_PUBLIC_AWY2X_MINT", fetchApy: () => fetchAwyLeveredApy("2x"), haircut: 0.10 },
  { name: "awy3x", envMint: "NEXT_PUBLIC_AWY3X_MINT", fetchApy: () => fetchAwyLeveredApy("3x"), haircut: 0.10 },
];

/**
 * GET /api/cron/update-rate
 *
 * Fetches live APY from each protocol, applies haircut,
 * updates each vault's Token-2022 interest rate via Squads.
 *
 * Call every 6-12 hours.
 */
export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization");
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results: Record<string, unknown>[] = [];

  for (const vr of VAULT_RATES) {
    try {
      const mintAddr = process.env[vr.envMint];
      if (!mintAddr) {
        results.push({ vault: vr.name, error: "mint not configured" });
        continue;
      }

      const liveApy = await vr.fetchApy();
      if (liveApy <= 0) {
        results.push({ vault: vr.name, error: "failed to fetch APY", liveApy });
        continue;
      }

      const netApy = liveApy * (1 - vr.haircut);
      // Cap at 2500 bps (25%) to leave headroom for levered AWY tiers
      // (AWY 3x targets ~21% net per AWY-model). Floor at 50 bps to filter
      // failed reads from a 0% rate push.
      const newRateBps = Math.max(50, Math.min(2500, Math.round(netApy * 100)));

      // Build updateRateInterestBearingMint instruction
      const { createUpdateRateInterestBearingMintInstruction } = await import("@solana/spl-token");
      const { vaultPda } = getVaultAddresses(vr.name);

      const updateIx = createUpdateRateInterestBearingMintInstruction(
        new PublicKey(mintAddr),
        vaultPda, // rate authority
        newRateBps,
        undefined,
        TOKEN_2022_PROGRAM_ID,
      );

      const sig = await executeVaultTransaction(vr.name, [updateIx]);

      // Log
      if (isSupabaseConfigured()) {
        await supabaseAdmin.from("sol_nav_history").insert({
          vault_id: `fdn-${vr.name}`,
          rate_bps: newRateBps,
          apy: newRateBps / 100,
          metadata: { liveApy, netApy, tx: sig },
        });
      }

      results.push({
        vault: vr.name,
        liveApy,
        netApy: Math.round(netApy * 100) / 100,
        rateBps: newRateBps,
        tx: sig,
      });
    } catch (error) {
      results.push({
        vault: vr.name,
        error: error instanceof Error ? error.message : "Failed",
      });
    }
  }

  return NextResponse.json({ success: true, data: results });
}
