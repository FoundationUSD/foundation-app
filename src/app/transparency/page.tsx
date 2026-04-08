import { ExternalLink, Shield, Lock, FileText, BarChart3 } from "lucide-react";
import { FOUNDATION_VAULTS } from "@/lib/vaults";
import { getAccountUrl } from "@/lib/constants";

const MULTISIGS = FOUNDATION_VAULTS.filter((v) => v.status === "live").map((v) => ({
  name: v.name,
  receiptToken: v.receiptToken,
  multisig: v.multisig,
  vaultPda: v.vaultPda,
  protocol: v.protocol,
  apy: v.apy,
}));

const AUDIT_STATUS = [
  { label: "Smart Contracts", status: "Pending", note: "Q2 2026" },
  { label: "Multisig Setup", status: "Verified", note: "Squads Protocol v4" },
  { label: "Token-2022 Mints", status: "Verified", note: "SPL Token-2022" },
  { label: "Yield Strategy", status: "Live", note: "On-chain" },
];

function truncate(addr: string, chars = 6) {
  if (!addr || addr.length < chars * 2) return addr;
  return `${addr.slice(0, chars)}…${addr.slice(-4)}`;
}

export default function TransparencyPage() {
  return (
    <div className="fdn-page mx-auto max-w-5xl">
      {/* Hero */}
      <div className="mb-10 text-center">
        <p className="section-label mx-auto mb-6 block w-fit">On-Chain Verified</p>
        <h1 className="page-heading mb-4 text-[clamp(2.2rem,5vw,3.5rem)] leading-[1.08]">
          Foundation <em>Transparency</em>
        </h1>
        <p className="mx-auto max-w-lg text-sm text-[var(--muted)]">
          Every vault, every strategy, every transaction — fully verifiable on Solana. No black boxes.
        </p>
      </div>

      {/* Audit Status */}
      <div className="mb-6 infra-card overflow-hidden">
        <div className="flex items-center gap-2 border-b border-[var(--rule)] px-6 py-4">
          <Shield className="h-4 w-4 text-gold-500" />
          <span className="font-mono text-xs uppercase tracking-wider text-[var(--fg)]">
            Audit & Security Status
          </span>
        </div>
        <div className="grid grid-cols-2 gap-0 md:grid-cols-4">
          {AUDIT_STATUS.map(({ label, status, note }, i) => (
            <div
              key={label}
              className={`p-5 ${i < AUDIT_STATUS.length - 1 ? "border-r border-[var(--rule)]" : ""}`}
            >
              <p className="mb-1 font-mono text-[9px] uppercase tracking-[0.15em] text-[var(--muted)]">
                {label}
              </p>
              <p
                className={`mb-0.5 font-mono text-sm font-medium ${
                  status === "Verified" || status === "Live"
                    ? "text-emerald-400"
                    : "text-amber-400"
                }`}
              >
                {status}
              </p>
              <p className="font-mono text-[10px] text-[var(--muted)]">{note}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Vault Addresses */}
      <div className="mb-6 infra-card overflow-hidden">
        <div className="flex items-center gap-2 border-b border-[var(--rule)] px-6 py-4">
          <Lock className="h-4 w-4 text-gold-500" />
          <span className="font-mono text-xs uppercase tracking-wider text-[var(--fg)]">
            Multisig Vaults
          </span>
          <span className="ml-auto font-mono text-[10px] text-[var(--muted)]">Squads v4</span>
        </div>
        <div className="divide-y divide-[var(--rule)]">
          {MULTISIGS.map((v) => (
            <div key={v.name} className="flex items-center gap-4 px-6 py-4">
              <div className="flex-1 min-w-0">
                <p className="mb-0.5 text-sm font-medium text-[var(--fg)]">{v.name}</p>
                <p className="font-mono text-[10px] text-[var(--muted)]">{v.receiptToken}</p>
              </div>
              <div className="hidden md:block text-right">
                <p className="mb-0.5 font-mono text-[10px] text-[var(--muted)]">Multisig</p>
                <p className="font-mono text-[11px] text-[var(--fg)]">{truncate(v.multisig)}</p>
              </div>
              <div className="hidden md:block text-right">
                <p className="mb-0.5 font-mono text-[10px] text-[var(--muted)]">Vault PDA</p>
                <p className="font-mono text-[11px] text-[var(--fg)]">{truncate(v.vaultPda)}</p>
              </div>
              <span className="font-mono text-xs font-medium text-gold-500">{v.apy}% APY</span>
              <a
                href={getAccountUrl(v.multisig)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 font-mono text-[10px] text-[var(--muted)] transition-colors hover:text-[var(--fg)]"
              >
                <ExternalLink className="h-3 w-3" />
                <span className="hidden sm:inline">Orbmarkets</span>
              </a>
            </div>
          ))}
        </div>
      </div>

      {/* Two-column: Strategy Docs + Performance */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {/* Strategy Documentation */}
        <div className="infra-card overflow-hidden">
          <div className="flex items-center gap-2 border-b border-[var(--rule)] px-5 py-4">
            <FileText className="h-4 w-4 text-gold-500" />
            <span className="font-mono text-xs uppercase tracking-wider text-[var(--fg)]">
              Strategy Docs
            </span>
          </div>
          <div className="divide-y divide-[var(--rule)]">
            {[
              { name: "Solomon Basis Trade", desc: "Delta-neutral BTC/ETH/SOL yield via sUSDV staking" },
              { name: "Kamino PRIME Lending", desc: "Overcollateralized lending to institutional borrowers" },
              { name: "Oro Yield Strategy", desc: "Diversified yield allocation across DeFi protocols" },
            ].map(({ name, desc }) => (
              <div key={name} className="px-5 py-4">
                <p className="mb-0.5 text-sm font-medium text-[var(--fg)]">{name}</p>
                <p className="text-xs text-[var(--muted)]">{desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Risk Framework */}
        <div className="infra-card overflow-hidden">
          <div className="flex items-center gap-2 border-b border-[var(--rule)] px-5 py-4">
            <BarChart3 className="h-4 w-4 text-gold-500" />
            <span className="font-mono text-xs uppercase tracking-wider text-[var(--fg)]">
              Risk Framework
            </span>
          </div>
          <div className="divide-y divide-[var(--rule)]">
            {[
              { tier: "Conservative", color: "text-emerald-400", desc: "USDC-only exposure, no leverage, audited protocols" },
              { tier: "Moderate", color: "text-amber-400", desc: "Basis trades, delta-neutral, managed drawdown" },
              { tier: "Growth", color: "text-orange-400", desc: "Levered credit, higher yield, higher risk" },
            ].map(({ tier, color, desc }) => (
              <div key={tier} className="px-5 py-4">
                <p className={`mb-0.5 font-mono text-xs font-medium uppercase ${color}`}>{tier}</p>
                <p className="text-xs text-[var(--muted)]">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Disclaimer */}
      <div className="mt-6 rounded-lg border border-[var(--rule)] bg-[var(--surface)] px-6 py-4">
        <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--muted)] mb-1">
          Educational Disclaimer
        </p>
        <p className="text-xs text-[var(--muted)]">
          Foundation is currently in alpha. All vaults are for educational purposes only. Past yield figures are indicative and not guaranteed. Do not deposit funds you cannot afford to lose. Smart contract audits are pending — use at your own risk.
        </p>
      </div>
    </div>
  );
}
