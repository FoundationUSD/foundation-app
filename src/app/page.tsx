"use client";

import { useVaults } from "@/hooks/useVaults";
import { VaultCard } from "@/components/VaultCard";
import { ExternalVaultCard } from "@/components/ExternalVaultCard";
import { ProtocolStats } from "@/components/ProtocolStats";
import type { ExternalVault } from "@/types";

// Static external vault data for MVP — will be replaced with live SDK data
const EXTERNAL_VAULTS: ExternalVault[] = [
  {
    id: "solomon-susdv",
    type: "external",
    protocol: "solomon",
    name: "sUSDV",
    description: "Staked USDV — yield-bearing stablecoin backed by basis trading strategies",
    apy: 12.5,
    tvlUsdc: 0,
    vaultAddress: "pTA4St7D5WshfLUPBXoaxn5m8e3k2ort2DVt3gUTa17",
    externalUrl: "https://app.solomonlabs.org",
    metadata: {},
    updatedAt: new Date().toISOString(),
  },
  {
    id: "kamino-rwa-acred",
    type: "external",
    protocol: "kamino",
    name: "Kamino ACRED Earn",
    description: "Apollo Diversified Credit RWA vault on Kamino Finance",
    apy: 8.5,
    tvlUsdc: 0,
    vaultAddress: "",
    externalUrl: "https://app.kamino.finance",
    metadata: {},
    updatedAt: new Date().toISOString(),
  },
  {
    id: "drift-rwa-vault",
    type: "external",
    protocol: "drift",
    name: "Drift Gauntlet RWA",
    description: "Leveraged RWA vault managed by Gauntlet on Drift Protocol",
    apy: 16.0,
    tvlUsdc: 0,
    vaultAddress: "",
    externalUrl: "https://app.drift.trade/vaults",
    metadata: {},
    updatedAt: new Date().toISOString(),
  },
];

export default function HomePage() {
  const { vaults, loading } = useVaults();

  return (
    <div className="mx-auto max-w-7xl px-6 py-12">
      {/* Hero */}
      <div className="animate-fade-up mb-16 text-center">
        <p className="section-label mb-4 justify-center">Institutional RWA Yield</p>
        <h1 className="mb-4 font-serif text-5xl font-light leading-tight text-foreground md:text-6xl">
          Real-World Assets.
          <br />
          <span className="text-gradient-gold">On-Chain Yield.</span>
        </h1>
        <p className="mx-auto max-w-xl text-lg font-light text-muted">
          Deposit USDC into institutional credit vaults. Earn yield from Apollo, BlackRock, and
          Hamilton Lane — all on Solana.
        </p>
      </div>

      {/* Protocol stats */}
      <div className="animate-fade-up mb-12" style={{ animationDelay: "0.1s" }}>
        <ProtocolStats vaults={vaults} />
      </div>

      {/* Foundation Vaults */}
      <div className="mb-16">
        <h2 className="section-label mb-6">Foundation Vaults</h2>
        {loading ? (
          <div className="grid gap-6 md:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="skeleton h-[260px] rounded-xl" />
            ))}
          </div>
        ) : (
          <div className="stagger-children grid gap-6 md:grid-cols-3">
            {vaults.map((vault) => (
              <VaultCard key={vault.id} vault={vault} />
            ))}
          </div>
        )}
      </div>

      {/* External RWA Vaults */}
      <div className="mb-16">
        <h2 className="section-label mb-2">Explore More RWA Yield</h2>
        <p className="mb-6 text-sm text-muted-foreground">
          Third-party RWA vaults from leading Solana protocols
        </p>
        <div className="stagger-children grid gap-4 md:grid-cols-3">
          {EXTERNAL_VAULTS.map((vault) => (
            <ExternalVaultCard key={vault.id} vault={vault} />
          ))}
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-white/[0.06] pt-8 text-center">
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
          Foundation Protocol — Solana Devnet
        </p>
      </footer>
    </div>
  );
}
