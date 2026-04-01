import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/* eslint-disable @typescript-eslint/no-explicit-any */

interface DriftApiVaultEntry {
  apys?: Record<string, number>;
  maxDrawdownPct?: number;
}

export async function GET() {
  try {
    // Fetch APY data from Drift app API
    const res = await fetch("https://app.drift.trade/api/vaults", {
      next: { revalidate: 300 },
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; FoundationApp/1.0)",
        Accept: "application/json",
      },
    });

    if (!res.ok) throw new Error(`Drift API ${res.status}`);
    const apyData: Record<string, DriftApiVaultEntry> = await res.json();

    if (!apyData || typeof apyData !== "object" || Array.isArray(apyData)) {
      return NextResponse.json({ success: true, data: [] });
    }

    // Filter to reasonable vaults
    const vaultEntries = Object.entries(apyData)
      .filter(([, v]) => {
        const apy30d = v.apys?.["30d"] ?? 0;
        return apy30d > 0 && apy30d < 100;
      })
      .sort((a, b) => (b[1].apys?.["30d"] ?? 0) - (a[1].apys?.["30d"] ?? 0))
      .slice(0, 30);

    // Fetch vault names from on-chain
    let nameMap: Record<string, string> = {};
    try {
      const web3 = await import("@solana/web3.js");
      const { decodeName, VAULT_PROGRAM_ID } = await import("@drift-labs/vaults-sdk");
      const anchor = await import("@coral-xyz/anchor");
      const { IDL } = await import("@drift-labs/vaults-sdk");

      const rpcUrl =
        process.env.SOLANA_RPC_URL ||
        process.env.NEXT_PUBLIC_SOLANA_RPC_URL ||
        "https://api.mainnet-beta.solana.com";
      const connection = new web3.Connection(rpcUrl, "confirmed");

      const pubkeys = vaultEntries.map(([pk]) => new web3.PublicKey(pk));

      // Batch fetch accounts
      const accounts = await connection.getMultipleAccountsInfo(pubkeys);

      // Decode vault names from account data using Anchor coder
      const provider = new anchor.AnchorProvider(connection as any, {} as any, {});
      const coder = new anchor.BorshAccountsCoder((IDL as any));

      for (let i = 0; i < accounts.length; i++) {
        const info = accounts[i];
        if (!info?.data) continue;
        try {
          const decoded = coder.decode("vault", info.data);
          if (decoded?.name) {
            nameMap[pubkeys[i].toBase58()] = decodeName(decoded.name);
          }
        } catch {
          // skip if decode fails
        }
      }
    } catch (err) {
      console.error("Failed to fetch vault names:", err);
    }

    const vaults = vaultEntries.map(([pubkey, v]) => ({
      name: nameMap[pubkey] || pubkey.slice(0, 8) + "...",
      address: pubkey,
      manager: "",
      apy7d: v.apys?.["7d"] ?? 0,
      apy30d: v.apys?.["30d"] ?? 0,
      apy90d: v.apys?.["90d"] ?? 0,
      maxDrawdownPct: v.maxDrawdownPct ?? 0,
      protocol: "drift",
    }));

    return NextResponse.json({ success: true, data: vaults });
  } catch (error) {
    console.error("GET /api/drift/vaults error:", error);
    return NextResponse.json({ success: true, data: [] });
  }
}
