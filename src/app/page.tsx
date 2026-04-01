"use client";

import { useState } from "react";
import Link from "next/link";
import { useWallet } from "@solana/wallet-adapter-react";
import { Shield, TrendingUp, Lock, ArrowRight } from "lucide-react";
import { useStrategies } from "@/hooks/useStrategies";
import { WalletModal } from "@/components/WalletModal";
import { formatAPY } from "@/lib/utils";
import type { FoundationVault } from "@/lib/vaults";

const RISK_CONFIG = {
  conservative: { color: "text-emerald-400", bg: "bg-emerald-500/10", label: "Conservative" },
  moderate: { color: "text-blue-400", bg: "bg-blue-500/10", label: "Moderate" },
  growth: { color: "text-amber-400", bg: "bg-amber-500/10", label: "Growth" },
};

export default function HomePage() {
  const { strategies, loading } = useStrategies();
  const wallet = useWallet();
  const [walletModalOpen, setWalletModalOpen] = useState(false);

  const bestApy = strategies.length > 0 ? Math.max(...strategies.map((s) => s.apy)) : 0;

  return (
    <div className="mx-auto max-w-6xl px-6 py-12">
      {/* Hero */}
      <div className="animate-fade-up mb-20 text-center">
        <p className="section-label mb-4 justify-center">Managed RWA Yield</p>
        <h1 className="mb-4 font-serif text-5xl font-light leading-tight text-foreground md:text-6xl">
          Deposit USDC.
          <br />
          <span className="text-gradient-gold">We Handle The Rest.</span>
        </h1>
        <p className="mx-auto mb-8 max-w-2xl text-lg font-light text-muted">
          Foundation deploys your USDC across institutional RWA strategies — Solomon basis trades,
          Kamino PRIME lending, Drift levered credit. All managed via Squads multisig.
        </p>

        {!wallet.connected && (
          <button
            onClick={() => setWalletModalOpen(true)}
            className="btn-primary inline-flex items-center gap-2 px-8 py-3 text-sm"
          >
            Connect Wallet
            <ArrowRight className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Value props */}
      <div className="animate-fade-up mb-16 grid gap-px overflow-hidden border border-white/[0.06] md:grid-cols-3" style={{ animationDelay: "0.1s" }}>
        <div className="bg-white/[0.02] p-6">
          <Shield className="mb-3 h-5 w-5 text-gold-400" />
          <h3 className="mb-1 text-sm font-medium text-foreground">Squads Multisig</h3>
          <p className="text-xs text-muted-foreground">
            Every vault is a Squads multisig. No single key controls funds. Fully auditable on-chain.
          </p>
        </div>
        <div className="bg-white/[0.02] p-6">
          <TrendingUp className="mb-3 h-5 w-5 text-gold-400" />
          <h3 className="mb-1 text-sm font-medium text-foreground">Up to {bestApy > 0 ? formatAPY(bestApy) : "12%+"} APY</h3>
          <p className="text-xs text-muted-foreground">
            Yield from institutional credit, basis trading, and levered RWA strategies.
          </p>
        </div>
        <div className="bg-white/[0.02] p-6">
          <Lock className="mb-3 h-5 w-5 text-gold-400" />
          <h3 className="mb-1 text-sm font-medium text-foreground">Token-2022 Receipt</h3>
          <p className="text-xs text-muted-foreground">
            Receive fdnALPHA — yield accrues automatically via interest-bearing extension. Like ERC-4626.
          </p>
        </div>
      </div>

      {/* Vaults */}
      <div className="mb-16">
        <h2 className="section-label mb-8">Vaults</h2>
        {loading ? (
          <div className="space-y-8">
            {[1, 2, 3].map((i) => (
              <div key={i} className="skeleton h-[160px] rounded-sm" />
            ))}
          </div>
        ) : (
          <div className="space-y-8">
            {strategies.map((vault) => (
              <VaultCard key={vault.id} vault={vault} />
            ))}
          </div>
        )}
      </div>

      {/* How it works */}
      <div className="mb-16 border border-white/[0.06] p-8">
        <h2 className="section-label mb-6">How It Works</h2>
        <div className="grid gap-8 md:grid-cols-4">
          {[
            { step: "1", title: "Deposit USDC", desc: "Connect wallet and deposit any amount of USDC into a Foundation vault." },
            { step: "2", title: "Receive fdnALPHA", desc: "Get fdnALPHA receipt tokens. Your balance grows as yield accrues." },
            { step: "3", title: "We Manage", desc: "Foundation deploys USDC into the strategy via Squads multisig." },
            { step: "4", title: "Withdraw", desc: "Burn fdnALPHA anytime to get USDC back with accrued yield." },
          ].map((item) => (
            <div key={item.step}>
              <span className="mb-2 inline-block font-mono text-2xl font-light text-gold-400">
                {item.step}
              </span>
              <h4 className="mb-1 text-sm font-medium text-foreground">{item.title}</h4>
              <p className="text-xs text-muted-foreground">{item.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-white/[0.06] pt-8 text-center">
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
          Foundation · Solana · Squads Multisig · Token-2022 · Non-custodial
        </p>
      </footer>

      <WalletModal open={walletModalOpen} onClose={() => setWalletModalOpen(false)} />
    </div>
  );
}

function VaultCard({ vault }: { vault: FoundationVault }) {
  const risk = RISK_CONFIG[vault.riskTier];

  return (
    <Link href={`/strategy/${vault.id}`}>
      <div className="glass-card group cursor-pointer overflow-hidden transition-all hover:border-white/[0.15]">
        <div className="flex items-stretch">
          {/* Left accent */}
          <div className={`w-1 ${
            vault.protocol === "solomon" ? "bg-emerald-500" :
            vault.protocol === "kamino" ? "bg-blue-500" : "bg-purple-500"
          }`} />

          {/* Content */}
          <div className="flex flex-1 items-start justify-between gap-6 p-8">
            <div className="min-w-0 flex-1">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <h3 className="font-serif text-xl font-light text-foreground">{vault.name}</h3>
                <span className={`${risk.bg} ${risk.color} rounded-sm px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.1em]`}>
                  {risk.label}
                </span>
              </div>
              <p className="mb-1 font-mono text-xs text-muted-foreground">{vault.strategy}</p>
              <p className="mb-4 text-sm text-muted-foreground">{vault.description}</p>
              <div className="flex flex-wrap gap-2">
                {vault.features.slice(0, 3).map((f) => (
                  <span
                    key={f}
                    className="border border-white/[0.06] px-2 py-0.5 font-mono text-[9px] text-muted-foreground"
                  >
                    {f}
                  </span>
                ))}
              </div>
            </div>

            {/* Right: APY + CTA */}
            <div className="shrink-0 text-right">
              <p className="text-gradient-gold font-mono text-3xl font-medium">
                {vault.apy > 0 ? formatAPY(vault.apy) : "--"}
              </p>
              <p className="mb-4 font-mono text-[9px] uppercase tracking-[0.15em] text-muted-foreground">
                APY
              </p>
              <div className="btn-primary inline-flex items-center gap-2 px-5 py-2 text-xs">
                Deposit USDC
                <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-1" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}
