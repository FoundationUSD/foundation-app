"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { useWallet } from "@solana/wallet-adapter-react";
import { Wallet, Copy, Check, ArrowDownLeft, ArrowUpRight, ExternalLink, Loader2, Download } from "lucide-react";
import Avatar from "boring-avatars";
import { WalletModal } from "@/components/WalletModal";
import { RiskDashboard } from "@/components/RiskDashboard";
import { StandingDashboard } from "@/components/StandingDashboard";
import { RebalanceFlow } from "@/components/RebalanceFlow";
import { FOUNDATION_VAULTS } from "@/lib/vaults";
import { getTxUrl } from "@/lib/constants";
import { formatAPY, formatNumber, lamportsToUsdc } from "@/lib/utils";

interface Position {
  vaultId: string;
  vaultName: string;
  receiptToken: string;
  strategy: string;
  protocol: string;
  depositedUsdc: number;
  apy: number;
}

interface TxRecord {
  id: string;
  type: "deposit" | "withdrawal";
  vaultId: string;
  amount: number;
  tx: string;
  createdAt: string;
}

const VAULT_ICONS: Record<string, string> = {
  solomon: "/partners/solomon-circle.png",
  kamino: "/partners/prime.png",
  oro: "/partners/oro.png",
};

export default function PortfolioPage() {
  const wallet = useWallet();
  const [walletModalOpen, setWalletModalOpen] = useState(false);
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(true);
  const [history, setHistory] = useState<TxRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [selectedSubTab, setSelectedSubTab] = useState<"funds" | "history" | "risk" | "standing" | "rebalance">("funds");
  const [copied, setCopied] = useState(false);
  const [filterVault, setFilterVault] = useState<string>("all");
  const [filterType, setFilterType] = useState<"all" | "deposit" | "withdrawal">("all");

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

    // Load history
    setHistoryLoading(true);
    fetch(`/api/user/history?wallet=${wallet.publicKey.toBase58()}`)
      .then((r) => r.json())
      .then((j) => { if (j.success && !cancelled) setHistory(j.data); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setHistoryLoading(false); });

    const interval = setInterval(load, 30000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [wallet.publicKey]);

  const filteredHistory = history.filter((tx) => {
    if (filterType !== "all" && tx.type !== filterType) return false;
    if (filterVault !== "all" && tx.vaultId !== filterVault) return false;
    return true;
  });

  const copyAddress = async () => {
    if (!wallet.publicKey) return;
    await navigator.clipboard.writeText(wallet.publicKey.toBase58());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const totalUsdc = positions.reduce((s, p) => s + p.depositedUsdc, 0);

  // Not connected
  if (!wallet.connected) {
    return (
      <>
        <div className="fdn-page mx-auto max-w-5xl">
          {/* Hero */}
          <div className="mb-10 text-center">
            <p className="section-label mx-auto mb-6 block w-fit">Managed RWA Yield on Solana</p>
            <h1 className="page-heading mb-4 text-[clamp(2.2rem,5vw,3.5rem)] leading-[1.08]">
              Your <em>Portfolio</em>
            </h1>
            <p className="mx-auto max-w-md text-sm text-[var(--muted)]">
              Connect your Solana wallet to view positions, track yield, and manage your Foundation vault deposits.
            </p>
          </div>

          {/* Connect card */}
          <div className="mx-auto max-w-sm">
            <div className="infra-card p-8 text-center">
              <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full border border-[var(--rule)] bg-[var(--surface-strong)]">
                <Wallet className="h-6 w-6 text-gold-500" />
              </div>
              <h2 className="mb-2 font-serif text-xl font-light text-[var(--fg)]">Connect Wallet</h2>
              <p className="mb-6 text-xs text-[var(--muted)]">
                View your vault positions and earnings
              </p>
              <button onClick={() => setWalletModalOpen(true)} className="btn-primary w-full">
                Connect Wallet
              </button>
            </div>
          </div>
        </div>
        <WalletModal open={walletModalOpen} onClose={() => setWalletModalOpen(false)} />
      </>
    );
  }

  return (
    <div className="fdn-page mx-auto max-w-5xl">
      {/* Portfolio Header Card */}
      <div className="infra-card overflow-hidden p-0 mb-6">
        <div className="flex items-start justify-between border-b border-black/[0.06] px-5 py-5">
          <div className="flex-1">
            <span className="section-label mb-3 block">PORTFOLIO</span>
            <h2 className="page-heading text-2xl">
              Your <em>Portfolio</em>
            </h2>
            <p className="mt-1 text-sm text-[var(--text-accent)]">
              Your balances and deposits
            </p>
          </div>
        </div>

        {/* Account Info */}
        {wallet.publicKey && (
          <div className="border-t border-[var(--rule)] px-5 pt-4 pb-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full overflow-hidden border border-[var(--rule)]">
                  <Avatar
                    size={40}
                    name={wallet.publicKey?.toBase58() ?? "user"}
                    variant="beam"
                    colors={["#0c2340", "#b8960c", "#d4af37", "#1d4e6e", "#f0f4ff"]}
                  />
                </div>
                <div>
                  <div className="mb-0.5 text-xs text-[var(--text-accent)]">
                    Connected Wallet
                  </div>
                  <div className="font-mono text-sm font-medium text-[var(--fg)]">
                    {wallet.publicKey.toBase58().slice(0, 6)}...{wallet.publicKey.toBase58().slice(-4)}
                  </div>
                </div>
              </div>
              <button
                onClick={copyAddress}
                className="rounded-lg p-2 transition-colors hover:bg-light-bg"
              >
                {copied ? (
                  <Check className="h-4 w-4 text-emerald-500" />
                ) : (
                  <Copy className="h-4 w-4 dark:invert" />
                )}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Sub Tabs */}
      <div className="mb-6 flex w-fit flex-wrap items-center gap-1 rounded-xl border border-[var(--rule)] bg-light-bg p-1">
        {([
          { key: "funds",     label: "Funds"     },
          { key: "history",   label: "History"   },
          { key: "risk",      label: "Risk"      },
          { key: "standing",  label: "Standing"  },
          { key: "rebalance", label: "Rebalance" },
        ] as const).map((sub) => (
          <button
            key={sub.key}
            onClick={() => setSelectedSubTab(sub.key)}
            className={`rounded-lg px-5 py-2 text-sm font-semibold transition-all ${
              selectedSubTab === sub.key
                ? "bg-[var(--surface-strong)] text-[var(--fg)] shadow-sm border border-[var(--rule)]"
                : "bg-transparent text-[var(--muted)] hover:text-[var(--fg)] border border-transparent"
            }`}
          >
            {sub.label}
          </button>
        ))}
      </div>

      {/* Funds Tab */}
      {selectedSubTab === "funds" && (
        <div className="flex flex-col gap-6">
          {/* Summary */}
          {totalUsdc > 0 && (
            <div className="border border-[var(--rule)] p-6">
              <p className="font-mono text-[9px] uppercase tracking-[0.15em] text-[var(--text-accent)]">
                Total Deposited
              </p>
              <p className="font-mono text-3xl font-medium text-gradient-gold">
                ${totalUsdc.toFixed(2)}
              </p>
            </div>
          )}

          {/* Active Deposits */}
          <div className="border border-[var(--rule)] p-6">
            <h3 className="mb-4 text-lg font-semibold text-[var(--fg)]">
              Active Deposits
            </h3>
            {loading ? (
              <div className="skeleton h-20" />
            ) : positions.length > 0 ? (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {positions.map((p) => (
                  <Link key={p.vaultId} href="/invest">
                    <div className="cursor-pointer rounded-xl border border-[var(--rule)] bg-light-bg p-4 transition-all hover:bg-white">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-3">
                          {VAULT_ICONS[p.protocol] && (
                            <Image
                              src={VAULT_ICONS[p.protocol]}
                              alt={p.protocol}
                              width={40}
                              height={40}
                              className="h-10 w-10 rounded-full"
                            />
                          )}
                          <div>
                            <h4 className="text-sm font-semibold text-[var(--fg)]">
                              {p.vaultName}
                            </h4>
                            <div className="text-xs text-[var(--gold)] font-medium">
                              {formatAPY(p.apy)} APY
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="border-t border-[var(--rule)] pt-3">
                        <div className="flex items-center justify-between">
                          <div className="text-xs text-[var(--text-accent)]">
                            Balance
                          </div>
                          <div className="text-right">
                            <div className="text-sm font-semibold text-[var(--fg)]">
                              {p.depositedUsdc.toFixed(2)} USDc
                            </div>
                            <div className="text-xs text-[var(--text-accent)]">
                              ~${p.depositedUsdc.toFixed(2)}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="py-6 text-center">
                <p className="mb-2 text-sm text-[var(--text-accent)]">No active positions</p>
                <Link href="/invest" className="font-mono text-xs text-gold-500 hover:text-gold-400">
                  Deposit USDC to get started →
                </Link>
              </div>
            )}
          </div>

          {/* Available Vaults */}
          <div className="border border-[var(--rule)] p-6">
            <h3 className="section-label mb-4">Available Vaults</h3>
            <div className="space-y-3">
              {FOUNDATION_VAULTS.filter((v) => v.status === "live").map((v) => (
                <Link key={v.id} href="/invest">
                  <div className="flex items-center justify-between rounded-md border border-[var(--rule)] p-4 transition-all hover:border-[var(--outline-hover)]">
                    <div>
                      <p className="text-sm font-medium text-[var(--fg)]">{v.name}</p>
                      <p className="font-mono text-[10px] text-[var(--text-accent)]">
                        {v.strategy} · {v.receiptToken}
                      </p>
                    </div>
                    <span className="font-mono text-xs text-gold-500">Deposit →</span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* History Tab */}
      {selectedSubTab === "history" && (
        <div className="infra-card overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--rule)] px-5 py-4">
            <div className="flex items-center gap-3">
              <h3 className="font-mono text-xs uppercase tracking-wider text-[var(--fg)]">Transaction History</h3>
              <span className="font-mono text-[10px] text-[var(--muted)]">
                {historyLoading ? "loading…" : `${filteredHistory.length}/${history.length} records`}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value as "all" | "deposit" | "withdrawal")}
                className="rounded-md border border-[var(--rule)] bg-[var(--surface)] px-2 py-1 font-mono text-[10px] uppercase text-[var(--fg)]"
                aria-label="Filter by type"
              >
                <option value="all">All Types</option>
                <option value="deposit">Deposits</option>
                <option value="withdrawal">Withdrawals</option>
              </select>
              <select
                value={filterVault}
                onChange={(e) => setFilterVault(e.target.value)}
                className="rounded-md border border-[var(--rule)] bg-[var(--surface)] px-2 py-1 font-mono text-[10px] uppercase text-[var(--fg)]"
                aria-label="Filter by vault"
              >
                <option value="all">All Vaults</option>
                {FOUNDATION_VAULTS.map((v) => (
                  <option key={v.id} value={v.id}>{v.receiptToken}</option>
                ))}
              </select>
              <button
                onClick={() => exportHistoryCsv(filteredHistory)}
                disabled={filteredHistory.length === 0}
                className="flex items-center gap-1.5 rounded-md border border-[var(--rule)] px-2.5 py-1 font-mono text-[10px] uppercase text-[var(--fg)] transition-colors hover:bg-[var(--surface-strong)] disabled:opacity-40"
                aria-label="Export to CSV"
              >
                <Download className="h-3 w-3" />
                CSV
              </button>
            </div>
          </div>

          {historyLoading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-[var(--muted)]">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="font-mono text-xs">Loading history…</span>
            </div>
          ) : filteredHistory.length === 0 ? (
            <div className="py-12 text-center">
              <p className="mb-2 font-serif text-base font-light text-[var(--muted)]">
                {history.length === 0 ? "No transactions yet" : "No records match the current filters"}
              </p>
              {history.length === 0 && (
                <Link href="/invest" className="font-mono text-xs text-gold-500 hover:text-gold-400">
                  Make your first deposit →
                </Link>
              )}
            </div>
          ) : (
            <div className="divide-y divide-[var(--rule)]">
              {filteredHistory.map((tx, i) => {
                const vault = FOUNDATION_VAULTS.find((v) => v.id === tx.vaultId);
                const isDeposit = tx.type === "deposit";
                const date = new Date(tx.createdAt);
                return (
                  <div key={`${tx.id}-${i}`} className="group flex items-center justify-between px-5 py-4 transition-colors hover:bg-[var(--surface-strong)]">
                    <div className="flex items-center gap-4 min-w-0">
                      {/* Icon */}
                      <div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg border border-[var(--rule)] ${
                        isDeposit ? "bg-emerald-500/5 text-emerald-600" : "bg-amber-500/5 text-amber-600"
                      }`}>
                        {isDeposit
                          ? <ArrowDownLeft className="h-4 w-4" />
                          : <ArrowUpRight className="h-4 w-4" />
                        }
                      </div>

                      {/* Details */}
                      <div className="flex flex-col min-w-0 pr-4">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-sm font-semibold text-[var(--fg)]">
                            {isDeposit ? "Deposit" : "Withdrawal"}
                          </span>
                          <span className="rounded bg-[var(--surface-strong)] px-1.5 py-0.5 font-mono text-[9px] uppercase text-[var(--text-accent)] border border-[var(--rule)]">
                            {vault?.receiptToken || "USDC"}
                          </span>
                        </div>
                        <span className="font-mono text-[11px] text-[var(--muted)]">
                          {date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                          {" · "}
                          {date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>
                    </div>

                    {/* Right side: Amount & Link */}
                    <div className="flex items-center gap-4 flex-shrink-0 text-right">
                      <div className="flex flex-col items-end">
                        <span className={`font-mono text-[14px] font-medium ${isDeposit ? "text-emerald-500" : "text-[var(--text-page)]"}`}>
                          {isDeposit ? "+" : "-"}{tx.amount ? formatNumber(lamportsToUsdc(tx.amount)) : "—"}
                        </span>
                        <span className="font-mono text-[10px] text-[var(--muted)]">USDC</span>
                      </div>
                      
                      {tx.tx ? (
                        <a
                          href={getTxUrl(tx.tx)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex h-8 w-8 items-center justify-center rounded-md border border-[var(--rule)] text-[var(--muted)] transition-all hover:bg-[var(--surface)] hover:text-[var(--fg)]"
                          title="View on Explorer"
                          aria-label="View transaction on Solana Explorer"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      ) : (
                        <div className="w-8"></div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Risk Tab */}
      {selectedSubTab === "risk" && (
        <RiskDashboard />
      )}

      {/* Standing Tab (rewards / loyalty) */}
      {selectedSubTab === "standing" && (
        <StandingDashboard />
      )}

      {/* Rebalance Tab */}
      {selectedSubTab === "rebalance" && (
        <RebalanceFlow />
      )}

      <WalletModal open={walletModalOpen} onClose={() => setWalletModalOpen(false)} />
    </div>
  );
}

/**
 * Build a CSV from filtered transactions and trigger a download. Naive
 * client-side approach — fine for the volumes we expect (hundreds, not millions).
 */
function exportHistoryCsv(rows: TxRecord[]) {
  if (rows.length === 0) return;
  const header = ["date", "type", "vault", "amount_usdc", "tx_signature"];
  const escape = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const lines = [header.join(",")];
  for (const r of rows) {
    const vault = FOUNDATION_VAULTS.find((v) => v.id === r.vaultId);
    lines.push([
      escape(new Date(r.createdAt).toISOString()),
      r.type,
      escape(vault?.receiptToken || r.vaultId),
      r.amount ? (r.amount / 1e6).toFixed(6) : "0",
      escape(r.tx || ""),
    ].join(","));
  }
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `foundation-history-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
