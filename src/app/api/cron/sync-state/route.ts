import { NextRequest, NextResponse } from "next/server";
import { Connection, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import { isSupabaseConfigured, supabaseAdmin } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const USDV_MINT = "Ex5DaKYMCN6QWFA4n67TmMwsH8MJV68RX6YXTmVM532C";
const SUSDV_MINT = "pTA4St7D5WshfLUPBXoaxn5m8e3k2ort2DVt3gUTa17";

const VAULTS = [
  { id: "fdn-solomon", usdc: "VAULT_SOLOMON_USDC_ATA", mint: "NEXT_PUBLIC_SOLOMON_MINT", pda: "NEXT_PUBLIC_SOLOMON_VAULT_PDA" },
  { id: "fdn-kamino", usdc: "VAULT_KAMINO_USDC_ATA", mint: "NEXT_PUBLIC_KAMINO_MINT", pda: "NEXT_PUBLIC_KAMINO_VAULT_PDA" },
  { id: "fdn-oro", usdc: "VAULT_ORO_USDC_ATA", mint: "NEXT_PUBLIC_ORO_MINT", pda: "NEXT_PUBLIC_ORO_VAULT_PDA" },
];

/**
 * GET /api/cron/sync-state
 *
 * Monitors vault health:
 *   - USDC balance in each vault
 *   - Receipt token supply
 *   - Protocol positions (USDv/sUSDV for Solomon, Kamino positions)
 *   - Idle USDC detection
 *   - Authority SOL balance
 *
 * Call every 5-10 minutes.
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
  const alerts: string[] = [];

  // Authority SOL balance
  let authSol = 0;
  try {
    const bs58 = await import("bs58");
    const { Keypair } = await import("@solana/web3.js");
    const auth = Keypair.fromSecretKey(bs58.default.decode(process.env.VAULT_AUTHORITY_SECRET!));
    authSol = (await connection.getBalance(auth.publicKey)) / LAMPORTS_PER_SOL;
    if (authSol < 0.02) {
      alerts.push(`CRITICAL: Authority SOL balance is ${authSol.toFixed(4)} — deposits/withdrawals will fail`);
    } else if (authSol < 0.05) {
      alerts.push(`WARNING: Authority SOL balance low: ${authSol.toFixed(4)}`);
    }
  } catch {}

  // Per-vault monitoring
  for (const v of VAULTS) {
    const entry: Record<string, unknown> = { vault: v.id };
    const usdcAddr = process.env[v.usdc];
    const mintAddr = process.env[v.mint];
    const pdaAddr = process.env[v.pda];

    // 1. Vault USDC balance (idle, not deployed)
    let usdcBalance = 0;
    if (usdcAddr) {
      try {
        const bal = await connection.getTokenAccountBalance(new PublicKey(usdcAddr));
        usdcBalance = Number(bal.value.amount);
        entry.usdcBalance = usdcBalance;
        entry.usdcDisplay = bal.value.uiAmountString;
      } catch { entry.usdcBalance = 0; }
    }

    // 2. Receipt token supply (total minted)
    let tokenSupply = 0;
    if (mintAddr) {
      try {
        const supply = await connection.getTokenSupply(new PublicKey(mintAddr));
        tokenSupply = Number(supply.value.amount);
        entry.tokenSupply = tokenSupply;
        entry.supplyDisplay = supply.value.uiAmountString;
      } catch { entry.tokenSupply = 0; }
    }

    // 3. Protocol positions — check what's actually deployed
    let deployedValue = 0;

    if (v.id === "fdn-solomon" && pdaAddr) {
      // Check USDv + sUSDV held by vault PDA
      const vaultPda = new PublicKey(pdaAddr);
      try {
        const usdvAta = findAta(USDV_MINT, vaultPda, TOKEN_PROGRAM_ID);
        const usdvBal = await connection.getTokenAccountBalance(usdvAta).catch(() => null);
        const usdvAmount = usdvBal ? Number(usdvBal.value.amount) : 0;
        entry.usdvHeld = usdvAmount;

        const susdvAta = findAta(SUSDV_MINT, vaultPda, TOKEN_PROGRAM_ID);
        const susdvBal = await connection.getTokenAccountBalance(susdvAta).catch(() => null);
        const susdvAmount = susdvBal ? Number(susdvBal.value.amount) : 0;
        entry.susdvHeld = susdvAmount;

        // USDv and sUSDV are ~1:1 in USDC terms (9 decimals → 6 decimals)
        deployedValue = Math.floor((usdvAmount + susdvAmount) / 1e3); // 9 dec → 6 dec
      } catch {}
    }

    if (v.id === "fdn-kamino" && pdaAddr) {
      // For Kamino, check the user's obligations via API
      try {
        const res = await fetch(
          `https://api.kamino.finance/kamino-market/CqAoLuqWtavaVE8deBjMKe8ZfSt9ghR6Vb8nfsyabyHA/users/${pdaAddr}/obligations`,
          { signal: AbortSignal.timeout(5000) },
        );
        if (res.ok) {
          const obligations = await res.json();
          if (Array.isArray(obligations) && obligations.length > 0) {
            // Sum all USDC supply positions
            for (const ob of obligations) {
              const deposits = ob.deposits || ob.collateralDeposits || [];
              for (const d of deposits) {
                if (String(d.mintAddress || d.mint || "").includes("EPjFWdd5")) {
                  deployedValue += Math.floor(Number(d.amount || d.depositedAmount || 0));
                }
              }
            }
          }
        }
        entry.kaminoDeployed = deployedValue;
      } catch {}
    }

    entry.deployedValue = deployedValue;

    // 4. Backing analysis
    const totalBacking = usdcBalance + deployedValue;
    entry.totalBacking = totalBacking;
    entry.fullyBacked = totalBacking >= tokenSupply;
    entry.backingRatio = tokenSupply > 0 ? ((totalBacking / tokenSupply) * 100).toFixed(1) + "%" : "N/A";

    // 5. Alerts
    if (tokenSupply > 0 && totalBacking < tokenSupply) {
      const deficit = (tokenSupply - totalBacking) / 1e6;
      alerts.push(`UNDERCOLLATERALIZED: ${v.id} — minted ${(tokenSupply / 1e6).toFixed(2)} but only ${(totalBacking / 1e6).toFixed(2)} USDC backing (deficit: ${deficit.toFixed(2)} USDC)`);
    }

    if (usdcBalance > 1_000_000 && tokenSupply > 0) { // >1 USDC idle
      alerts.push(`IDLE USDC: ${v.id} has ${(usdcBalance / 1e6).toFixed(2)} USDC not deployed to protocol`);
    }

    state.push(entry);

    // Log to Supabase
    if (isSupabaseConfigured()) {
      try {
        await supabaseAdmin.from("sol_nav_history").insert({
          vault_id: v.id,
          rate_bps: 0,
          apy: 0,
          tvl_usdc: totalBacking,
          total_shares: tokenSupply,
          metadata: { ...entry, authoritySol: authSol, alerts: alerts.filter(a => a.includes(v.id)) },
        });
      } catch {}
    }
  }

  if (alerts.length > 0) {
    console.warn("VAULT ALERTS:", alerts);
  }

  return NextResponse.json({
    success: true,
    data: {
      authoritySol: authSol,
      authorityLow: authSol < 0.05,
      vaults: state,
      alerts,
      timestamp: new Date().toISOString(),
    },
  });
}

/** Derive ATA address */
function findAta(mint: string, owner: PublicKey, programId: PublicKey): PublicKey {
  const mintPk = new PublicKey(mint);
  const [ata] = PublicKey.findProgramAddressSync(
    [owner.toBuffer(), programId.toBuffer(), mintPk.toBuffer()],
    new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"),
  );
  return ata;
}
