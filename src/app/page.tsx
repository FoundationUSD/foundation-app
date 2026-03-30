"use client";

import { useVaults } from "@/hooks/useVaults";
import { useExternalVaults } from "@/hooks/useExternalVaults";
import { VaultCard } from "@/components/VaultCard";
import { ExternalVaultCard } from "@/components/ExternalVaultCard";
import { ProtocolStats } from "@/components/ProtocolStats";

export default function HomePage() {
  const { vaults, loading: vaultsLoading } = useVaults();
  const { vaults: externalVaults, loading: externalLoading } = useExternalVaults();

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
        {vaultsLoading ? (
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

      {/* External RWA Vaults — live data from Kamino, Drift, Solomon */}
      <div className="mb-16">
        <h2 className="section-label mb-2">Explore More RWA Yield</h2>
        <p className="mb-6 text-sm text-muted-foreground">
          Live vault data from Kamino Finance, Drift Protocol, and Solomon Labs
        </p>
        {externalLoading ? (
          <div className="grid gap-4 md:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="skeleton h-[220px] rounded-xl" />
            ))}
          </div>
        ) : externalVaults.length === 0 ? (
          <div className="glass rounded-xl p-8 text-center">
            <p className="font-mono text-xs text-muted-foreground">
              External vault data unavailable — check back soon
            </p>
          </div>
        ) : (
          <div className="stagger-children grid gap-4 md:grid-cols-3">
            {externalVaults.map((vault) => (
              <ExternalVaultCard key={vault.id} vault={vault} />
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <footer className="border-t border-white/[0.06] pt-8 text-center">
        <div className="flex items-center justify-center gap-6">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            Foundation Protocol
          </p>
          <span className="text-white/[0.1]">|</span>
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            Solana Devnet
          </p>
          <span className="text-white/[0.1]">|</span>
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            Token-2022
          </p>
        </div>
      </footer>
    </div>
  );
}
