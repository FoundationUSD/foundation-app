import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { VAULT_CONFIGS, type VaultId } from "@/lib/constants";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    // Try Supabase
    const { data: vault } = await supabaseAdmin
      .from("sol_vaults")
      .select("*")
      .eq("id", id)
      .single();

    if (vault) {
      return NextResponse.json({
        success: true,
        data: {
          id: vault.id,
          type: "native" as const,
          name: vault.name,
          symbol: vault.id,
          underlying: vault.underlying,
          mintAddress: vault.mint_address,
          vaultAuthority: vault.vault_authority,
          rateBps: vault.rate_bps,
          apy: Number(vault.apy),
          tvlUsdc: Number(vault.tvl_usdc || 0),
          totalDeposits: Number(vault.total_deposits || 0),
          createdAt: vault.created_at,
        },
      });
    }

    // Fallback to config
    const config = VAULT_CONFIGS[id as VaultId];
    if (!config) {
      return NextResponse.json({ success: false, error: "Vault not found" }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      data: {
        id: config.id,
        type: "native" as const,
        name: config.name,
        symbol: config.symbol,
        underlying: config.underlying,
        mintAddress: config.mint,
        vaultAuthority: "",
        rateBps: config.rateBps,
        apy: config.apy,
        tvlUsdc: 0,
        totalDeposits: 0,
        createdAt: new Date().toISOString(),
      },
    });
  } catch {
    const config = VAULT_CONFIGS[id as VaultId];
    if (!config) {
      return NextResponse.json({ success: false, error: "Vault not found" }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      data: {
        id: config.id,
        type: "native",
        name: config.name,
        symbol: config.symbol,
        underlying: config.underlying,
        mintAddress: config.mint,
        vaultAuthority: "",
        rateBps: config.rateBps,
        apy: config.apy,
        tvlUsdc: 0,
        totalDeposits: 0,
        createdAt: new Date().toISOString(),
      },
    });
  }
}
