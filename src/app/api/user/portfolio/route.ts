import { NextRequest, NextResponse } from "next/server";
import { Connection, PublicKey } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } from "@solana/spl-token";
import { isSupabaseConfigured, supabaseAdmin } from "@/lib/supabase-server";
import { FOUNDATION_VAULTS } from "@/lib/vaults";

export const dynamic = "force-dynamic";

const USDC_MINT = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
const USDV_MINT = new PublicKey("Ex5DaKYMCN6QWFA4n67TmMwsH8MJV68RX6YXTmVM532C");

// Tunable haircut on USDv → USDC swap (basis points). The Jupiter reverse-
// swap typically takes ~50-100bps; we surface a conservative estimate so the
// "Max withdrawable" the user sees doesn't over-promise.
const USDV_SWAP_HAIRCUT_BPS = 100;

/**
 * Best-effort estimate of how much USDC the vault could pay out RIGHT NOW
 * for a single withdraw, given on-chain state. Idle USDC counts at face value;
 * USDv counts at face value minus a slippage haircut.
 */
async function vaultRecoverableUsdc(connection: Connection, vaultPdaStr: string, usdcAtaStr: string | null): Promise<number> {
  try {
    const pda = new PublicKey(vaultPdaStr);
    const usdcAta = usdcAtaStr ? new PublicKey(usdcAtaStr) : getAssociatedTokenAddressSync(USDC_MINT, pda, true, TOKEN_PROGRAM_ID);
    const usdvAta = getAssociatedTokenAddressSync(USDV_MINT, pda, true, TOKEN_PROGRAM_ID);

    const [usdcBal, usdvBal] = await Promise.all([
      connection.getTokenAccountBalance(usdcAta).catch(() => null),
      connection.getTokenAccountBalance(usdvAta).catch(() => null),
    ]);
    const idleUsdc = usdcBal ? Number(usdcBal.value.amount) : 0;
    // USDv is 9-dec, USDC is 6-dec → divide by 1000 to align units. Apply
    // haircut for swap slippage.
    const usdvBaseUnits = usdvBal ? Number(usdvBal.value.amount) : 0;
    const usdvAsUsdc = Math.floor((usdvBaseUnits / 1000) * (1 - USDV_SWAP_HAIRCUT_BPS / 10_000));
    return idleUsdc + usdvAsUsdc;
  } catch {
    return 0;
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
          const recoverableBaseUnits = await vaultRecoverableUsdc(connection, v.vaultPda, v.usdcAccount);
          const maxWithdrawableBaseUnits = Math.min(entitlementBaseUnits, recoverableBaseUnits);
          return {
            vaultId: v.id,
            vaultName: v.name,
            receiptToken: v.receiptToken,
            strategy: v.strategy,
            protocol: v.protocol,
            depositedUsdc: entitlementBaseUnits / 1e6,
            // Real-time max the user can pull right now. Use this for "Max"
            // button + max-amount validation in withdraw forms.
            maxWithdrawableUsdc: maxWithdrawableBaseUnits / 1e6,
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
