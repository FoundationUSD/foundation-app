import { NextRequest, NextResponse } from "next/server";
import { Connection, PublicKey } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } from "@solana/spl-token";
import { isSupabaseConfigured, supabaseAdmin } from "@/lib/supabase-server";
import { FOUNDATION_VAULTS } from "@/lib/vaults";

export const dynamic = "force-dynamic";

const USDC_MINT = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
const USDV_MINT = new PublicKey("Ex5DaKYMCN6QWFA4n67TmMwsH8MJV68RX6YXTmVM532C");
const ONYC_MINT = new PublicKey("5Y8NV33Vv7WbnLfq3zBcKSdYPrk7g2KoiQoe7M2tcxp5");

// Tunable haircut on USDv → USDC swap (basis points). The Jupiter reverse-
// swap typically takes ~50-100bps; we surface a conservative estimate so the
// "Max withdrawable" the user sees doesn't over-promise.
const USDV_SWAP_HAIRCUT_BPS = 100;

// Kamino markets where AWY supplies USDC. We sum net obligation collateral
// (deposited_value - borrowed_value) across both to estimate sync-recoverable.
const KAMINO_PRIME_MARKET = "CqAoLuqWtavaVE8deBjMKe8ZfSt9ghR6Vb8nfsyabyHA";
const KAMINO_MAIN_MARKET = "7u3HeHxYDLhnCoErrtycNokbQYbWGzLs6JSDqGAv5PfF";

interface KaminoObligationResp {
  state?: {
    deposits?: Array<{ depositReserve?: string; depositedAmount?: string }>;
    borrows?: Array<{ borrowReserve?: string; borrowedAmountSf?: string }>;
  };
}

// Borrow amount is stored as fixed-point scaled by 2^60. Deposit amount is
// in raw token base units.
const BORROW_SF_SCALE = Math.pow(2, 60);
const NULL_ADDR = "11111111111111111111111111111111";

/**
 * Sum net Kamino collateral (deposit base units - borrow base units) across
 * all obligations in a market. Works for both AWY (deposit-only, USDC) and
 * levered AWY tiers (USDC supply, USDS/PYUSD borrow — all 1:1 with USDC at
 * the precision we care about for a withdraw estimate).
 */
async function fetchKaminoNetCollateralUsdc(market: string, owner: string): Promise<number> {
  try {
    const res = await fetch(
      `https://api.kamino.finance/kamino-market/${market}/users/${owner}/obligations`,
      { signal: AbortSignal.timeout(4000) },
    );
    if (!res.ok) return 0;
    const arr = (await res.json()) as KaminoObligationResp[];
    if (!Array.isArray(arr) || arr.length === 0) return 0;
    let totalNetBaseUnits = 0;
    for (const ob of arr) {
      const depSum = (ob.state?.deposits ?? []).reduce(
        (s, d) =>
          s + (d.depositReserve && d.depositReserve !== NULL_ADDR ? Number(d.depositedAmount ?? "0") : 0),
        0,
      );
      const borrowSum = (ob.state?.borrows ?? []).reduce(
        (s, b) =>
          s + (b.borrowReserve && b.borrowReserve !== NULL_ADDR ? Number(b.borrowedAmountSf ?? "0") / BORROW_SF_SCALE : 0),
        0,
      );
      totalNetBaseUnits += Math.max(0, depSum - borrowSum);
    }
    // 50 bps haircut for unwind slippage (stable-to-stable swap on borrow leg).
    return Math.floor(totalNetBaseUnits * 0.995);
  } catch {
    return 0;
  }
}

/**
 * Sync-recoverable USDC: what the vault can pay out within a single Squads
 * tx today. Includes idle USDC + USDv (via Jupiter reverse-swap) + Kamino
 * collateral (PRIME + Main, net of debt for levered tiers).
 *
 * Excludes ONyc — that path is async (OnRe admin fulfills in 24-72h) and
 * is surfaced separately as pendingViaOnycUsdc.
 */
async function vaultRecoverableUsdc(
  connection: Connection,
  vaultPdaStr: string,
  usdcAtaStr: string | null,
): Promise<{ syncUsdc: number; pendingViaOnycUsdc: number }> {
  try {
    const pda = new PublicKey(vaultPdaStr);
    const usdcAta = usdcAtaStr ? new PublicKey(usdcAtaStr) : getAssociatedTokenAddressSync(USDC_MINT, pda, true, TOKEN_PROGRAM_ID);
    const usdvAta = getAssociatedTokenAddressSync(USDV_MINT, pda, true, TOKEN_PROGRAM_ID);
    const onycAta = getAssociatedTokenAddressSync(ONYC_MINT, pda, true, TOKEN_PROGRAM_ID);

    const [usdcBal, usdvBal, onycBal, primeNet, mainNet] = await Promise.all([
      connection.getTokenAccountBalance(usdcAta).catch(() => null),
      connection.getTokenAccountBalance(usdvAta).catch(() => null),
      connection.getTokenAccountBalance(onycAta).catch(() => null),
      fetchKaminoNetCollateralUsdc(KAMINO_PRIME_MARKET, vaultPdaStr),
      fetchKaminoNetCollateralUsdc(KAMINO_MAIN_MARKET, vaultPdaStr),
    ]);
    const idleUsdc = usdcBal ? Number(usdcBal.value.amount) : 0;
    // USDv is 9-dec, USDC is 6-dec → divide by 1000. Apply Jupiter haircut.
    const usdvBaseUnits = usdvBal ? Number(usdvBal.value.amount) : 0;
    const usdvAsUsdc = Math.floor((usdvBaseUnits / 1000) * (1 - USDV_SWAP_HAIRCUT_BPS / 10_000));

    // ONyc is 9-dec. NAV is ~1 USDC/ONyc (small premium for accrued interest).
    // Conservative: count at NAV=1 face, no haircut — OnRe redemption is at
    // current NAV which only goes up over time.
    const onycBaseUnits = onycBal ? Number(onycBal.value.amount) : 0;
    const onycAsUsdc = Math.floor(onycBaseUnits / 1000);

    return {
      syncUsdc: idleUsdc + usdvAsUsdc + primeNet + mainNet,
      pendingViaOnycUsdc: onycAsUsdc,
    };
  } catch {
    return { syncUsdc: 0, pendingViaOnycUsdc: 0 };
  }
}

export async function GET(req: NextRequest) {
  const wallet = req.nextUrl.searchParams.get("wallet");
  if (!wallet) {
    return NextResponse.json({ success: false, error: "Missing wallet param" }, { status: 400 });
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ success: true, data: [] });
  }

  try {
    const { data: deposits } = await supabaseAdmin
      .from("sol_deposits")
      .select("vault_id, usdc_amount")
      .eq("wallet", wallet);

    const { data: withdrawals } = await supabaseAdmin
      .from("sol_withdrawals")
      .select("vault_id, usdc_returned")
      .eq("wallet", wallet);

    // Calculate net per vault (entitlement = deposits − withdrawals).
    const netByVault: Record<string, number> = {};
    for (const d of deposits || []) {
      netByVault[d.vault_id] = (netByVault[d.vault_id] || 0) + Number(d.usdc_amount);
    }
    for (const w of withdrawals || []) {
      netByVault[w.vault_id] = (netByVault[w.vault_id] || 0) - Number(w.usdc_returned);
    }

    // Compute max-withdrawable-now per vault: min(user entitlement, vault
    // recoverable). The form uses this to set the Max button + validate input.
    const rpcUrl = process.env.SOLANA_RPC_URL || process.env.NEXT_PUBLIC_SOLANA_RPC_URL!;
    const connection = new Connection(rpcUrl, "confirmed");

    const positions = await Promise.all(
      FOUNDATION_VAULTS
        .filter((v) => (netByVault[v.id] || 0) > 0)
        .map(async (v) => {
          const entitlementBaseUnits = netByVault[v.id];
          const { syncUsdc, pendingViaOnycUsdc } = await vaultRecoverableUsdc(
            connection,
            v.vaultPda,
            v.usdcAccount,
          );
          // Sync max (instant withdraw): capped by entitlement + sync-recoverable.
          const maxWithdrawableBaseUnits = Math.min(entitlementBaseUnits, syncUsdc);
          // Async ONyc capacity: only the entitlement remaining beyond the
          // sync portion that the ONyc balance can still cover.
          const remainingAfterSync = Math.max(0, entitlementBaseUnits - maxWithdrawableBaseUnits);
          const onycAvailableBaseUnits = Math.min(remainingAfterSync, pendingViaOnycUsdc);
          return {
            vaultId: v.id,
            vaultName: v.name,
            receiptToken: v.receiptToken,
            strategy: v.strategy,
            protocol: v.protocol,
            depositedUsdc: entitlementBaseUnits / 1e6,
            // Real-time max the user can pull synchronously (instant tx).
            maxWithdrawableUsdc: maxWithdrawableBaseUnits / 1e6,
            // Additional capacity via ONyc redemption (24-72h admin fulfilment).
            // The form lets the user request up to (max + pending) and queues
            // an OnRe redemption for the residual.
            pendingViaOnycUsdc: onycAvailableBaseUnits / 1e6,
            apy: v.apy,
          };
        }),
    );

    return NextResponse.json({ success: true, data: positions });
  } catch (error) {
    console.error("GET /api/user/portfolio error:", error);
    return NextResponse.json({ success: true, data: [] });
  }
}
