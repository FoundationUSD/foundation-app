import { NextRequest, NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import { executeVaultTransaction, getVaultAddresses } from "@/lib/solana/squads";
import { isSupabaseConfigured, supabaseAdmin } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

const KAMINO_API = "https://api.kamino.finance";

async function fetchSolomonApy(): Promise<number> {
  return 12.5; // From Solomon docs — basis trading target
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

type VaultRate = {
  name: "solomon" | "kamino" | "oro";
  envMint: string;
  fetchApy: () => Promise<number>;
  haircut: number; // Foundation fee %
};

const VAULT_RATES: VaultRate[] = [
  { name: "solomon", envMint: "NEXT_PUBLIC_SOLOMON_MINT", fetchApy: fetchSolomonApy, haircut: 0.10 },
  { name: "kamino", envMint: "NEXT_PUBLIC_KAMINO_MINT", fetchApy: fetchKaminoApy, haircut: 0.10 },
  { name: "oro", envMint: "NEXT_PUBLIC_ORO_MINT", fetchApy: fetchOroApy, haircut: 0.10 },
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
  if (cronSecret) {
    const authHeader = req.headers.get("authorization");
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
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
      const newRateBps = Math.max(50, Math.min(2000, Math.round(netApy * 100)));

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
