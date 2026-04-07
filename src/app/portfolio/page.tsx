"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { useWallet } from "@solana/wallet-adapter-react";
import { Wallet, Copy, Check, ArrowDownLeft, ArrowUpRight, ExternalLink, Loader2 } from "lucide-react";
import Avatar from "boring-avatars";
import { WalletModal } from "@/components/WalletModal";
import { FOUNDATION_VAULTS } from "@/lib/vaults";
import { getTxUrl } from "@/lib/constants";

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
  kamino: "/partners/kamino.png",
  drift: "/partners/drift.png",
  oro: "/partners/oro.png",
};

export default function PortfolioPage() {
  const wallet = useWallet();
  const [walletModalOpen, setWalletModalOpen] = useState(false);
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(true);
  const [history, setHistory] = useState<TxRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [selectedSubTab, setSelectedSubTab] = useState<"funds" | "history">("funds");
  const [copied, setCopied] = useState(false);

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
                  <div className="font-mono text-sm font-medium text-[#0f172a]">
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
      <div className="mb-6 flex w-fit items-center gap-1 rounded-xl border border-[var(--rule)] bg-light-bg p-1">
        {(["funds", "history"] as const).map((sub) => (
          <button
            key={sub}
            onClick={() => setSelectedSubTab(sub)}
            className={`rounded-lg px-6 py-2.5 text-sm font-semibold transition-all ${
              selectedSubTab === sub
                ? "bg-white text-[#0f172a] shadow-sm"
                : "bg-transparent text-[var(--text-accent)] hover:text-[#0f172a]"
            }`}
          >
            {sub === "funds" ? "Funds" : "Transaction History"}
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
            <h3 className="mb-4 text-lg font-semibold text-[#0f172a]">
              Active Deposits
            </h3>
            {loading ? (
              <div className="skeleton h-20" />
            ) : positions.length > 0 ? (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {positions.map((p) => (
                  <Link key={p.vaultId} href={`/strategy/${p.vaultId}`}>
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
                            <h4 className="text-sm font-semibold text-[#0f172a]">
                              {p.vaultName}
                            </h4>
                            <div className="text-xs text-emerald-600 font-medium">
                              {p.apy}% APY
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
                            <div className="text-sm font-semibold text-[#0f172a]">
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
                <Link href="/" className="font-mono text-xs text-gold-500 hover:text-gold-400">
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
                <Link key={v.id} href={`/strategy/${v.id}`}>
                  <div className="flex items-center justify-between rounded-md border border-[var(--rule)] p-4 transition-all hover:border-[var(--outline-hover)]">
                    <div>
                      <p className="text-sm font-medium text-[#0f172a]">{v.name}</p>
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
          <div className="flex items-center justify-between border-b border-[var(--rule)] px-5 py-4">
            <h3 className="font-mono text-xs uppercase tracking-wider text-[var(--fg)]">Transaction History</h3>
            <span className="font-mono text-[10px] text-[var(--muted)]">{history.length} records</span>
          </div>

          {historyLoading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-[var(--muted)]">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="font-mono text-xs">Loading history…</span>
            </div>
          ) : history.length === 0 ? (
            <div className="py-12 text-center">
              <p className="mb-2 font-serif text-base font-light text-[var(--muted)]">No transactions yet</p>
              <Link href="/" className="font-mono text-xs text-gold-500 hover:text-gold-400">
                Make your first deposit →
              </Link>
            </div>
          ) : (
            <div className="divide-y divide-[var(--rule)]">
              {history.map((tx) => {
                const vault = FOUNDATION_VAULTS.find((v) => v.id === tx.vaultId);
                const isDeposit = tx.type === "deposit";
                const date = new Date(tx.createdAt);
                return (
                  <div key={tx.id} className="flex items-center gap-4 px-5 py-4">
                    {/* Icon */}
                    <div className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full ${
                      isDeposit ? "bg-emerald-500/10" : "bg-amber-500/10"
                    }`}>
                      {isDeposit
                        ? <ArrowDownLeft className="h-4 w-4 text-emerald-500" />
                        : <ArrowUpRight className="h-4 w-4 text-amber-500" />
                      }
                    </div>

                    {/* Details */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-[var(--fg)]">
                        {isDeposit ? "Deposit" : "Withdrawal"}
                        {vault && <span className="ml-1.5 text-[var(--muted)] font-normal">· {vault.receiptToken}</span>}
                      </p>
                      <p className="font-mono text-[10px] text-[var(--muted)]">
                        {date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                        {" · "}
                        {date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>

                    {/* Amount */}
                    <div className="text-right flex-shrink-0">
                      <p className={`font-mono text-sm font-medium ${isDeposit ? "text-emerald-500" : "text-amber-500"}`}>
                        {isDeposit ? "+" : "-"}{tx.amount?.toFixed(2) ?? "—"} USDC
                      </p>
                    </div>

                    {/* Explorer link */}
                    {tx.tx && (
                      <a
                        href={getTxUrl(tx.tx)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-shrink-0 rounded p-1.5 text-[var(--muted)] transition-colors hover:text-[var(--fg)] hover:bg-[var(--surface-strong)]"
                        title="View on orbmarkets.io"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      <WalletModal open={walletModalOpen} onClose={() => setWalletModalOpen(false)} />
    </div>
  );
}
