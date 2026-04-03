"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useWallet } from "@solana/wallet-adapter-react";
import { Wallet, Coins } from "lucide-react";
import { WalletModal } from "@/components/WalletModal";
import { FOUNDATION_VAULTS } from "@/lib/vaults";

interface Position {
  vaultId: string;
  vaultName: string;
  receiptToken: string;
  strategy: string;
  protocol: string;
  depositedUsdc: number;
  apy: number;
}

export default function PortfolioPage() {
  const wallet = useWallet();
  const [walletModalOpen, setWalletModalOpen] = useState(false);
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!wallet.publicKey) {
      setPositions([]);
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function load() {
      try {
        const res = await fetch(`/api/user/portfolio?wallet=${wallet.publicKey!.toBase58()}`);
        const json = await res.json();
        if (json.success && !cancelled) {
          setPositions(json.data);
        }
      } catch {
        // silently fail
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    const interval = setInterval(load, 30000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [wallet.publicKey]);

  if (!wallet.connected) {
    return (
      <>
        <div className="mx-auto flex max-w-5xl flex-col items-center justify-center px-6 py-24">
          <div className="glass-card max-w-md p-10 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-sm bg-gold-500/10">
              <Wallet className="h-8 w-8 text-gold-400" />
            </div>
            <h1 className="mb-2 font-serif text-2xl font-light text-foreground">
              Connect Your Wallet
            </h1>
            <p className="mb-6 text-sm text-muted-foreground">
              Connect your Solana wallet to view your Foundation vault positions.
            </p>
            <button onClick={() => setWalletModalOpen(true)} className="btn-primary w-full">
              Connect Wallet
            </button>
          </div>
        </div>
        <WalletModal open={walletModalOpen} onClose={() => setWalletModalOpen(false)} />
      </>
    );
  }

  const totalUsdc = positions.reduce((s, p) => s + p.depositedUsdc, 0);

  return (
    <div className="mx-auto max-w-5xl px-6 py-12">
      <h1 className="mb-8 font-serif text-3xl font-light text-foreground">Portfolio</h1>

      {/* Summary */}
      {totalUsdc > 0 && (
        <div className="mb-8 border border-white/[0.06] p-6">
          <p className="font-mono text-[9px] uppercase tracking-[0.15em] text-muted-foreground">Total Deposited</p>
          <p className="text-gradient-gold font-mono text-3xl font-medium">${totalUsdc.toFixed(2)}</p>
        </div>
      )}

      {/* Positions */}
      <div className="mb-10 border border-white/[0.06] p-6">
        <h3 className="section-label mb-4">Your Positions</h3>
        {loading ? (
          <div className="skeleton h-20 rounded-sm" />
        ) : positions.length > 0 ? (
          <div className="space-y-4">
            {positions.map((p) => (
              <Link key={p.vaultId} href={`/strategy/${p.vaultId}`}>
                <div className="flex items-center justify-between border border-white/[0.04] p-4 transition-all hover:border-white/[0.1]">
                  <div className="flex items-center gap-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-sm bg-gold-500/10">
                      <Coins className="h-5 w-5 text-gold-400" />
                    </div>
                    <div>
                      <h4 className="text-sm font-medium text-foreground">{p.vaultName}</h4>
                      <p className="font-mono text-[10px] text-muted-foreground">
                        {p.strategy} · {p.receiptToken}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-gradient-gold font-mono text-lg font-medium">
                      ${p.depositedUsdc.toFixed(2)}
                    </p>
                    <p className="font-mono text-[10px] text-muted-foreground">
                      deposited
                    </p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="py-6 text-center">
            <p className="mb-2 text-sm text-muted-foreground">No active positions</p>
            <Link href="/" className="font-mono text-xs text-gold-400 hover:text-gold-300">
              Deposit USDC to get started →
            </Link>
          </div>
        )}
      </div>

      {/* Vault links */}
      <div className="mb-10 border border-white/[0.06] p-6">
        <h3 className="section-label mb-4">Available Vaults</h3>
        <div className="space-y-3">
          {FOUNDATION_VAULTS.filter((v) => v.status === "live").map((v) => (
            <Link key={v.id} href={`/strategy/${v.id}`}>
              <div className="flex items-center justify-between border border-white/[0.04] p-4 transition-all hover:border-white/[0.1]">
                <div>
                  <p className="text-sm font-medium text-foreground">{v.name}</p>
                  <p className="font-mono text-[10px] text-muted-foreground">
                    {v.strategy} · {v.receiptToken}
                  </p>
                </div>
                <span className="font-mono text-xs text-gold-400">Deposit →</span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
