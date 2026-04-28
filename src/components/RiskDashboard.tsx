"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useWallet } from "@solana/wallet-adapter-react";
import { ShieldCheck, AlertTriangle, TrendingUp } from "lucide-react";
import { AWY_COMPOSITION } from "@/lib/integrations/awy";
import { formatNumber } from "@/lib/utils";

interface Position {
  vaultId: string;
  vaultName: string;
  receiptToken: string;
  protocol: string;
  depositedUsdc: number;
  apy: number;
}

interface DriverExposure {
  driver: string;
  usd: number;
  pct: number;
  legs: { vaultId: string; vaultName: string; usd: number; weightInVault: number }[];
}

const PROTOCOL_DRIVER: Record<string, string> = {
  solomon: "Basis spread",
  kamino: "US rate cycle",
  oro: "Gold spot price",
  hephaestus: "Metals spot prices",
};

const DRIVER_DESCRIPTIONS: Record<string, string> = {
  "Basis spread": "Funding-rate yield from delta-neutral perp basis trades. Risk: rate compression or basis inversion.",
  "US rate cycle": "Tokenized HELOC and credit lending yield. Risk: Fed cuts compress spreads; defaults rise in downturns.",
  "Crypto borrowing demand": "Overcollateralized institutional lending. Risk: borrow demand falls during bear markets.",
  "Actuarial events": "Reinsurance premium income. Risk: catastrophic insurance events trigger payouts.",
  "Gold spot price": "Tokenized physical gold tracks LBMA spot. Risk: gold market drawdowns flow through directly.",
  "Fed funds rate": "Short-term US Treasury yield. Risk: rate cuts compress yield.",
  "Metals spot prices": "Diversified metals basket — gold, silver, platinum, copper. Risk: synchronized commodity drawdowns; copper has industrial-cycle exposure.",
};

const DRIVER_COLORS: Record<string, string> = {
  "Basis spread":            "rgb(59, 130, 246)",
  "US rate cycle":           "rgb(245, 158, 11)",
  "Crypto borrowing demand": "rgb(168, 85, 247)",
  "Actuarial events":        "rgb(236, 72, 153)",
  "Gold spot price":         "rgb(234, 179, 8)",
  "Fed funds rate":          "rgb(20, 184, 166)",
  "Metals spot prices":      "rgb(217, 119, 6)",
};

function buildExposures(positions: Position[]): DriverExposure[] {
  const byDriver: Record<string, DriverExposure> = {};
  const total = positions.reduce((s, p) => s + p.depositedUsdc, 0);

  const add = (driver: string, vaultId: string, vaultName: string, usd: number, weightInVault: number) => {
    if (!byDriver[driver]) byDriver[driver] = { driver, usd: 0, pct: 0, legs: [] };
    byDriver[driver].usd += usd;
    byDriver[driver].legs.push({ vaultId, vaultName, usd, weightInVault });
  };

  for (const p of positions) {
    if (p.protocol === "awy") {
      for (const leg of AWY_COMPOSITION) {
        const slice = p.depositedUsdc * (leg.weightBps / 10_000);
        add(leg.riskDriver, p.vaultId, p.vaultName, slice, leg.weightBps / 100);
      }
    } else {
      const driver = PROTOCOL_DRIVER[p.protocol] || "Unknown";
      add(driver, p.vaultId, p.vaultName, p.depositedUsdc, 100);
    }
  }

  return Object.values(byDriver)
    .map((e) => ({ ...e, pct: total > 0 ? (e.usd / total) * 100 : 0 }))
    .sort((a, b) => b.usd - a.usd);
}

export function RiskDashboard() {
  const wallet = useWallet();
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!wallet.publicKey) {
      setPositions([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetch(`/api/user/portfolio?wallet=${wallet.publicKey.toBase58()}`)
      .then((r) => r.json())
      .then((j) => { if (j.success && !cancelled) setPositions(j.data); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [wallet.publicKey]);

  const totalUsd = positions.reduce((s, p) => s + p.depositedUsdc, 0);
  const exposures = useMemo(() => buildExposures(positions), [positions]);
  const blendedApy = totalUsd > 0
    ? positions.reduce((s, p) => s + p.depositedUsdc * p.apy, 0) / totalUsd
    : 0;

  if (!wallet.connected) {
    return (
      <div className="rounded-xl border border-[var(--rule)] bg-[var(--surface)] p-8 text-center">
        <p className="text-sm text-[var(--text-accent)]">Connect a wallet to see your risk exposure.</p>
      </div>
    );
  }

  if (loading) {
    return <div className="skeleton h-64 rounded-xl" />;
  }

  if (positions.length === 0) {
    return (
      <div className="rounded-xl border border-[var(--rule)] bg-[var(--surface)] p-12 text-center">
        <p className="mb-2 font-serif text-base font-light text-[var(--muted)]">No positions yet</p>
        <Link href="/" className="font-mono text-xs text-gold-500 hover:text-gold-400">
          Deposit into a vault →
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <MetricCard label="Total Exposure" value={`$${formatNumber(totalUsd)}`} icon={<ShieldCheck className="h-4 w-4" />} />
        <MetricCard label="Blended APY" value={`${blendedApy.toFixed(2)}%`} icon={<TrendingUp className="h-4 w-4" />} />
        <MetricCard label="Risk Drivers" value={`${exposures.length}`} icon={<AlertTriangle className="h-4 w-4" />} />
      </div>

      <div className="rounded-xl border border-[var(--rule)] bg-[var(--surface)] p-5">
        <h2 className="mb-4 text-sm font-semibold text-[var(--fg)]">Exposure by Risk Driver</h2>
        <div className="space-y-3">
          {exposures.map((e) => (
            <div key={e.driver}>
              <div className="mb-1 flex items-center justify-between text-xs">
                <span className="font-medium text-[var(--fg)]">{e.driver}</span>
                <span className="font-mono text-[var(--text-accent)]">
                  ${formatNumber(e.usd)} ({e.pct.toFixed(1)}%)
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--rule)]">
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${e.pct}%`, background: DRIVER_COLORS[e.driver] || "rgb(100, 116, 139)" }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-[var(--fg)]">Driver Detail</h2>
        {exposures.map((e) => (
          <div key={e.driver} className="rounded-xl border border-[var(--rule)] bg-[var(--surface)] p-4">
            <div className="mb-2 flex items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ background: DRIVER_COLORS[e.driver] || "rgb(100, 116, 139)" }}
                />
                <h3 className="text-sm font-semibold text-[var(--fg)]">{e.driver}</h3>
              </div>
              <div className="text-right">
                <div className="font-mono text-sm text-[var(--fg)]">${formatNumber(e.usd)}</div>
                <div className="font-mono text-[10px] text-[var(--text-accent)]">{e.pct.toFixed(1)}% of book</div>
              </div>
            </div>
            <p className="mb-3 text-[11px] leading-relaxed text-[var(--text-accent)]">
              {DRIVER_DESCRIPTIONS[e.driver] || "Risk driver mapped from this vault's underlying strategy."}
            </p>
            <div className="space-y-1.5 border-t border-[var(--rule)] pt-2">
              {e.legs.map((leg, i) => (
                <div key={i} className="flex items-center justify-between text-[11px]">
                  <span className="text-[var(--text-accent)]">
                    {leg.vaultName}
                    <span className="ml-1.5 font-mono text-[10px] text-[var(--muted)]">({leg.weightInVault.toFixed(0)}% of vault)</span>
                  </span>
                  <span className="font-mono text-[var(--fg)]">${formatNumber(leg.usd)}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function MetricCard({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-[var(--rule)] bg-[var(--surface)] p-4">
      <div className="mb-1.5 flex items-center gap-2 text-[var(--text-accent)]">
        {icon}
        <span className="font-mono text-[10px] uppercase tracking-wider">{label}</span>
      </div>
      <div className="text-xl font-semibold text-[var(--fg)]">{value}</div>
    </div>
  );
}
