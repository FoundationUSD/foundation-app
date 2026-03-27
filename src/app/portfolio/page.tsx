"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { useVaults } from "@/hooks/useVaults";
import { useUserPosition } from "@/hooks/useUserPosition";
import { PositionCard } from "@/components/PositionCard";
import { formatCurrency } from "@/lib/utils";

function PositionLoader({ vaultId, mintAddress }: { vaultId: string; mintAddress: string }) {
  const { position, loading } = useUserPosition(vaultId, mintAddress);

  if (loading) return <div className="skeleton h-[140px] rounded-xl" />;
  if (!position || position.shares === 0) return null;

  return <PositionCard position={position} />;
}

export default function PortfolioPage() {
  const wallet = useWallet();
  const { vaults, loading } = useVaults();

  if (!wallet.connected) {
    return (
      <div className="mx-auto max-w-5xl px-6 py-24 text-center">
        <h1 className="mb-4 font-serif text-3xl font-light text-foreground">Portfolio</h1>
        <p className="text-muted">Connect your wallet to view your positions</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-12">
      <div className="mb-8">
        <p className="section-label mb-2">Your Positions</p>
        <h1 className="font-serif text-3xl font-light text-foreground">Portfolio</h1>
      </div>

      {loading ? (
        <div className="grid gap-4 md:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="skeleton h-[140px] rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-3">
          {vaults.map((vault) => (
            <PositionLoader
              key={vault.id}
              vaultId={vault.id}
              mintAddress={vault.mintAddress}
            />
          ))}
        </div>
      )}

      {!loading && vaults.length === 0 && (
        <div className="glass rounded-xl p-12 text-center">
          <p className="text-muted">No positions found. Deposit into a vault to get started.</p>
        </div>
      )}
    </div>
  );
}
