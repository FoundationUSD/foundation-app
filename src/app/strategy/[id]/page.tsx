"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  createTransferInstruction,
  createBurnInstruction,
} from "@solana/spl-token";
import { ArrowLeft, Loader2, Check, ExternalLink, Shield, TrendingUp, BarChart3, Users, Lock, AlertTriangle, Wallet } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { WalletModal } from "@/components/WalletModal";
import { formatAPY } from "@/lib/utils";
import { getTxUrl, PROTOCOL_FEE_SOL, VAULT_AUTHORITY_PUBKEY } from "@/lib/constants";
import type { FoundationVault } from "@/lib/vaults";
// aw-* styles live in globals.css

const USDC_MINT_PK = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");

const PROTOCOL_LOGO: Record<string, string> = {
  solomon: "/partners/solomon-circle.png",
  kamino: "/partners/kamino.png",
  drift: "/partners/drift.png",
  oro: "/partners/oro.png",
};

const RISK_LABELS: Record<string, string> = {
  conservative: "Conservative",
  moderate: "Moderate",
  growth: "Growth",
};

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "performance", label: "Performance" },
  { key: "strategy", label: "Strategy" },
  { key: "transparency", label: "Transparency" },
  { key: "risks", label: "Risks" },
] as const;

export default function StrategyPage() {
  const params = useParams();
  const strategyId = params.id as string;
  const wallet = useWallet();
  const [walletModalOpen, setWalletModalOpen] = useState(false);
  const [vault, setVault] = useState<FoundationVault | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<string>("overview");
  const [activeAction, setActiveAction] = useState<"deposit" | "withdraw">("deposit");
  const [positionBalance, setPositionBalance] = useState(0);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/strategies");
        const json = await res.json();
        if (json.success) {
          const found = json.data.find((s: FoundationVault) => s.id === strategyId) || null;
          setVault(found);
        }
      } catch {
        // silently fail
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [strategyId]);

  useEffect(() => {
    if (!wallet.publicKey || !vault) return;
    (async () => {
      try {
        const res = await fetch(`/api/user/portfolio?wallet=${wallet.publicKey!.toBase58()}`);
        const json = await res.json();
        if (json.success) {
          const pos = json.data.find((p: { vaultId: string }) => p.vaultId === vault.id);
          setPositionBalance(pos ? pos.depositedUsdc : 0);
        }
      } catch {
        setPositionBalance(0);
      }
    })();
  }, [wallet.publicKey, vault]);

  if (loading) {
    return (
      <div className="fdn-page mx-auto flex min-h-[500px] flex-col rounded-xl border border-[var(--rule)] bg-[var(--surface)] p-4 shadow-sm md:px-6 lg:p-6">
        <div className="skeleton mb-8 h-8 w-32 rounded-lg" />
        <div className="skeleton h-64 rounded-lg" />
      </div>
    );
  }

  if (!vault) {
    return (
      <div className="fdn-page mx-auto max-w-7xl px-6 py-24 text-center">
        <div className="infra-card overflow-hidden p-8 text-center">
          <p className="mb-2 text-lg text-[var(--fg)]">Vault not found</p>
          <p className="mb-4 text-sm text-[var(--text-accent)]">The requested strategy does not exist.</p>
          <Link href="/" className="btn-primary inline-block px-6 py-2.5 font-mono text-xs">
            Back to Vaults
          </Link>
        </div>
      </div>
    );
  }

  const isLive = vault.status === "live";

  return (
    <div className="fdn-page mx-auto flex min-h-[500px] max-w-7xl flex-col rounded-xl border border-[var(--rule)] bg-[var(--surface)] p-4 shadow-sm md:px-6 lg:p-6">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 md:flex-row">
        {/* Left: Strategy Details */}
        <div className="order-2 min-w-0 flex-1 md:order-1">
          <div className="flex w-full flex-col gap-3">
            {/* Back Button */}
            <div className="flex items-center gap-3">
              <Link
                href="/"
                className="flex h-10 w-10 items-center justify-center rounded-lg border border-[var(--rule)] bg-[var(--surface-strong)] transition-colors hover:bg-[var(--surface-strong)]/80"
              >
                <ArrowLeft className="h-5 w-5 text-[var(--fg)]" />
              </Link>
              <div className="flex-1">
                <h1 className="text-2xl font-semibold text-[var(--fg)]">
                  Strategy Details
                </h1>
              </div>
            </div>

            {/* Strategy Header Card */}
            <div className="rounded-xl border border-[var(--rule)] bg-[var(--surface)] p-4">
              <div className="flex items-start gap-3 mb-3">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-[var(--rule)] bg-[var(--surface-strong)]">
                  {PROTOCOL_LOGO[vault.protocol] && (
                    <Image
                      src={PROTOCOL_LOGO[vault.protocol]}
                      alt={vault.protocol}
                      width={32}
                      height={32}
                      className="h-8 w-8 object-contain rounded-md"
                    />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="mb-1.5 flex items-center gap-2">
                    <h2 className="text-lg font-semibold text-[var(--fg)]">
                      {vault.name}
                    </h2>
                    <span
                      className={`rounded px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider
                        ${isLive ? "bg-emerald-500/10 text-emerald-600" : "bg-black/[0.04] text-[var(--text-accent)]"}
                      `}
                    >
                      {isLive ? "Live" : "Coming Soon"}
                    </span>
                    <span className={`rounded px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider
                      ${vault.riskTier === "conservative" ? "bg-emerald-500/10 text-emerald-600" :
                        vault.riskTier === "moderate" ? "bg-blue-500/10 text-blue-600" :
                        "bg-amber-500/10 text-amber-600"}
                    `}>
                      {RISK_LABELS[vault.riskTier] || vault.riskTier}
                    </span>
                  </div>
                  <p className="text-xs leading-relaxed text-[var(--text-accent)]">
                    {vault.description}
                  </p>
                </div>
              </div>

              {/* Key Metrics */}
              <div className="grid grid-cols-2 gap-3 border-t border-[var(--rule)] pt-3">
                <div>
                  <div className="mb-1 text-xs text-[var(--text-accent)]">TVL (USD)</div>
                  <div className="text-xl font-semibold text-[var(--fg)]">
                    --
                  </div>
                </div>
                <div>
                  <div className="mb-1 text-xs text-[var(--text-accent)]">APY</div>
                  <div className="text-xl font-semibold text-[var(--fg)]">
                    {vault.apy > 0 ? formatAPY(vault.apy) : "--"}
                  </div>
                </div>
              </div>
            </div>

            {/* Tabs Navigation */}
            <div className="flex w-full items-center gap-0 overflow-hidden rounded-xl border border-[var(--rule)] bg-[var(--surface-strong)]">
              {TABS.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`flex-1 cursor-pointer px-2 py-2.5 text-center font-mono text-[11px] font-medium transition-all whitespace-nowrap tracking-wide
                    ${activeTab === tab.key
                      ? "bg-[var(--navy)] text-white shadow-sm"
                      : "text-[var(--muted)] hover:text-[var(--fg)]"
                    }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Tab Content */}
            <div className="min-h-[400px] w-full">
              {/* Overview Tab */}
              {activeTab === "overview" && (
                <div className="relative w-full space-y-3">
                  {/* Key Highlights */}
                  <div className="rounded-xl border border-[var(--rule)] bg-[var(--surface)] p-4 min-w-full">
                    <h3 className="mb-2 text-sm font-semibold text-[var(--fg)]">Highlights</h3>
                    <div className="space-y-2">
                      {vault.features.slice(0, 4).map((feature, i) => (
                        <div key={i} className="flex items-start gap-2">
                          <div className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500">
                            <svg viewBox="0 0 20 20" fill="currentColor">
                              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                            </svg>
                          </div>
                          <span className="text-xs text-[var(--text-accent)]">{feature}</span>
                        </div>
                      ))}
                    </div>

                    {/* Curator / Manager */}
                    <div className="pt-3 mt-3 border-t border-[var(--rule)]">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          {PROTOCOL_LOGO[vault.protocol] && (
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[var(--rule)] bg-[var(--surface-strong)] overflow-hidden">
                              <Image
                                src={PROTOCOL_LOGO[vault.protocol]}
                                alt={vault.protocol}
                                width={40}
                                height={40}
                                className="h-full w-full object-cover"
                              />
                            </div>
                          )}
                          <div>
                            <div className="mb-0.5 flex items-center gap-1.5">
                              <span className="text-xs font-semibold text-[var(--fg)]">
                                Managed by {vault.protocol === "solomon" ? "Solomon" : vault.protocol === "kamino" ? "Kamino" : vault.protocol === "drift" ? "Drift" : vault.protocol === "oro" ? "Oro" : "Foundation"}
                              </span>
                            </div>
                            <div className="text-[9px] text-[var(--text-accent)]">Vault Manager / Curator</div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-mono text-xs text-[var(--fg)]">{vault.strategy}</div>
                          <div className="text-[9px] text-[var(--text-accent)] uppercase tracking-wider">
                            {vault.underlying}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* How It Works */}
                  {vault.howItWorks && vault.howItWorks.length > 0 && (
                    <div className="rounded-xl border border-[var(--rule)] bg-[var(--surface)] p-4">
                      <h3 className="mb-3 text-sm font-semibold text-[var(--fg)]">How It Works</h3>
                      <div className="space-y-2 text-sm text-[var(--text-accent)]">
                        {vault.howItWorks.map((step, i) => (
                          <div key={i} className="flex gap-3 leading-relaxed">
                            <span className="font-mono text-[var(--fg)]">{i + 1}.</span>
                            <p>{step}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Performance Tab */}
              {activeTab === "performance" && (
                <div className="relative w-full space-y-3">
                  <div className="rounded-xl border border-[var(--rule)] bg-[var(--surface)] p-4">
                    <h3 className="mb-3 text-sm font-semibold text-[var(--fg)]">Yield Breakdown</h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <div className="mb-1 text-xs text-[var(--text-accent)]">Current APY</div>
                        <div className="text-lg font-semibold text-[var(--fg)]">
                          {vault.apy > 0 ? formatAPY(vault.apy) : "--"}
                        </div>
                      </div>
                      <div>
                        <div className="mb-1 text-xs text-[var(--text-accent)]">Strategy Type</div>
                        <div className="text-lg font-semibold text-[var(--fg)]">{vault.strategy}</div>
                      </div>
                      <div>
                        <div className="mb-1 text-xs text-[var(--text-accent)]">Underlying</div>
                        <div className="text-lg font-semibold text-[var(--fg)]">{vault.underlying}</div>
                        <div className="mt-0.5 text-[9px] text-[var(--text-accent)]">
                          {vault.receiptToken} (Token-2022)
                        </div>
                      </div>
                      <div>
                        <div className="mb-1 text-xs text-[var(--text-accent)]">Vault Custody</div>
                        <div className="text-lg font-semibold text-[var(--fg)]">Squads Multisig</div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Strategy Tab */}
              {activeTab === "strategy" && (
                <div className="relative w-full space-y-3">
                  <div className="rounded-xl border border-[var(--rule)] bg-[var(--surface)] p-4">
                    <h3 className="mb-3 text-sm font-semibold text-[var(--fg)]">Strategy Allocation</h3>
                    <div className="rounded-lg border border-[var(--rule)] bg-[var(--surface-strong)] p-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {PROTOCOL_LOGO[vault.protocol] && (
                            <Image src={PROTOCOL_LOGO[vault.protocol]} alt={vault.protocol} width={20} height={20} className="h-5 w-5 rounded-md" />
                          )}
                          <span className="text-xs font-medium text-[var(--fg)]">{vault.protocol}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-[var(--text-accent)]">100%</span>
                          <span className="text-xs font-medium text-emerald-600">
                            {vault.apy > 0 ? `${formatAPY(vault.apy)} APY` : "--"}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="mt-4">
                      <h4 className="mb-2 text-xs font-medium text-[var(--text-accent)]">Features</h4>
                      <div className="flex flex-wrap gap-2">
                        {vault.features.map((f, i) => (
                          <span key={i} className="flex items-center gap-1.5 rounded-md border border-[var(--rule)] px-3 py-1.5 font-mono text-[10px] text-[var(--fg)]">
                            <Shield className="h-3 w-3 text-gold-500" />
                            {f}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Transparency Tab */}
              {activeTab === "transparency" && (
                <div className="relative w-full space-y-3">
                  <div className="rounded-xl border border-[var(--rule)] bg-[var(--surface)] p-4">
                    <h3 className="mb-3 text-sm font-semibold text-[var(--fg)]">Transparency & Security</h3>
                    <div className="space-y-3">
                      <div className="flex items-start gap-3">
                        <Lock className="h-4 w-4 shrink-0 text-emerald-500 mt-0.5" />
                        <div>
                          <div className="text-xs font-medium text-[var(--fg)]">Multisig Custody</div>
                          <div className="text-xs text-[var(--text-accent)]">All vaults are secured by Squads Protocol multisig</div>
                        </div>
                      </div>
                      <div className="flex items-start gap-3">
                        <BarChart3 className="h-4 w-4 shrink-0 text-emerald-500 mt-0.5" />
                        <div>
                          <div className="text-xs font-medium text-[var(--fg)]">On-Chain Verification</div>
                          <div className="text-xs text-[var(--text-accent)]">All transactions are verifiable on Solana explorer</div>
                        </div>
                      </div>
                      <div className="flex items-start gap-3">
                        <TrendingUp className="h-4 w-4 shrink-0 text-emerald-500 mt-0.5" />
                        <div>
                          <div className="text-xs font-medium text-[var(--fg)]">Token-2022 Receipt Tokens</div>
                          <div className="text-xs text-[var(--text-accent)]">Deposits receive {vault.receiptToken} — a transfer-restricted SPL token</div>
                        </div>
                      </div>
                      <div className="flex items-start gap-3">
                        <Users className="h-4 w-4 shrink-0 text-emerald-500 mt-0.5" />
                        <div>
                          <div className="text-xs font-medium text-[var(--fg)]">Foundation Managed</div>
                          <div className="text-xs text-[var(--text-accent)]">Active management by the Foundation team with real-time monitoring</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Risks Tab */}
              {activeTab === "risks" && (
                <div className="relative w-full space-y-3">
                  <div className="rounded-xl border border-[var(--rule)] bg-[var(--surface)] p-4">
                    <h3 className="mb-3 text-sm font-semibold text-[var(--fg)]">Risk Analysis</h3>
                    <div className="mb-4 flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-amber-500" />
                      <span className="text-xs font-medium text-[var(--fg)]">Risk Tier: {RISK_LABELS[vault.riskTier]}</span>
                    </div>
                    <div className="space-y-3 text-sm text-[var(--text-accent)]">
                      <div className="rounded-lg border border-[var(--rule)] bg-[var(--surface-strong)] p-3">
                        <div className="mb-1 text-xs font-medium text-[var(--fg)]">Smart Contract Risk</div>
                        <div className="text-xs">All protocols used are audited and battle-tested on Solana mainnet</div>
                      </div>
                      <div className="rounded-lg border border-[var(--rule)] bg-[var(--surface-strong)] p-3">
                        <div className="mb-1 text-xs font-medium text-[var(--fg)]">Market Risk</div>
                        <div className="text-xs">Strategy is designed to be market-neutral, minimizing exposure to asset price fluctuations</div>
                      </div>
                      <div className="rounded-lg border border-[var(--rule)] bg-[var(--surface-strong)] p-3">
                        <div className="mb-1 text-xs font-medium text-[var(--fg)]">Liquidity Risk</div>
                        <div className="text-xs">Withdrawals are processed on-demand but may be delayed during high volatility or low liquidity periods</div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right: Action Widget */}
        <div className="order-1 w-full flex-shrink-0 md:order-2 md:w-[420px]">
          {isLive ? (
            <ActionWidget
              vault={vault}
              activeAction={activeAction}
              onActionChange={setActiveAction}
              wallet={wallet}
              positionBalance={positionBalance}
            />
          ) : (
            <div className="rounded-xl border border-[var(--rule)] bg-[var(--surface)] p-6 text-center shadow-sm">
              <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-xl border border-[var(--rule)] bg-[var(--surface-strong)]">
                <Lock className="h-7 w-7 text-[var(--text-accent)]" />
              </div>
              <p className="mb-2 text-lg font-medium text-[var(--fg)]">Coming Soon</p>
              <p className="text-xs text-[var(--text-accent)]">This vault is deployed on-chain and ready. Deposits will be enabled shortly.</p>
            </div>
          )}
        </div>
      </div>

      <WalletModal open={walletModalOpen} onClose={() => setWalletModalOpen(false)} />
    </div>
  );
}

/* ─── Action Widget (right side) ─── */

function ActionWidget({
  vault,
  activeAction,
  onActionChange,
  wallet,
  positionBalance,
}: {
  vault: FoundationVault;
  activeAction: "deposit" | "withdraw";
  onActionChange: (a: "deposit" | "withdraw") => void;
  wallet: ReturnType<typeof useWallet>;
  positionBalance: number;
}) {
  if (!wallet.connected) {
    return (
      <div className="aw-connect">
        <div className="aw-connect-icon">
          <Wallet style={{ width: 20, height: 20, color: "#b8960c" }} />
        </div>
        <p style={{ fontFamily: "var(--font-serif)", fontSize: 18, fontWeight: 300, color: "#0f172a", marginBottom: 4 }}>Connect Wallet</p>
        <p style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "#94a3b8" }}>Connect to deposit into this vault</p>
      </div>
    );
  }

  return (
    <div className="aw-widget">
        <div className="aw-header">
          <span className="aw-label">Vault Actions</span>
          <div className="aw-toggle">
            {(["deposit", "withdraw"] as const).map((a) => (
              <button
                key={a}
                onClick={() => onActionChange(a)}
                className={`aw-tab${activeAction === a ? " aw-tab-active" : ""}`}
              >
                {a.charAt(0).toUpperCase() + a.slice(1)}
              </button>
            ))}
          </div>
        </div>
        <div className="aw-body">
          {activeAction === "deposit" ? (
            <DepositForm vault={vault} wallet={wallet} />
          ) : (
            <WithdrawForm vault={vault} wallet={wallet} positionBalance={positionBalance} />
          )}
        </div>
      </div>
  );
}

/* ─── Deposit Form ─── */

function DepositForm({
  vault,
  wallet,
}: {
  vault: FoundationVault;
  wallet: ReturnType<typeof useWallet>;
}) {
  const { connection } = useConnection();
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [txSignature, setTxSignature] = useState<string | null>(null);

  const handleDeposit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!wallet.publicKey || !wallet.signTransaction) return;

    const num = parseFloat(amount);
    if (isNaN(num) || num <= 0) {
      setError("Enter a valid amount");
      return;
    }

    if (!vault.usdcAccount) {
      setError("Vault not configured yet");
      return;
    }

    setLoading(true);
    setError(null);
    setTxSignature(null);

    try {
      const amountLamports = Math.floor(num * 1_000_000);

      const userUsdcAta = getAssociatedTokenAddressSync(USDC_MINT_PK, wallet.publicKey);
      const vaultUsdcAta = new PublicKey(vault.usdcAccount);

      const transferIx = createTransferInstruction(
        userUsdcAta,
        vaultUsdcAta,
        wallet.publicKey,
        amountLamports,
        [],
        TOKEN_PROGRAM_ID,
      );

      const feeIx = SystemProgram.transfer({
        fromPubkey: wallet.publicKey,
        toPubkey: new PublicKey(VAULT_AUTHORITY_PUBKEY),
        lamports: Math.floor(PROTOCOL_FEE_SOL * LAMPORTS_PER_SOL),
      });

      const tx = new Transaction().add(transferIx, feeIx);
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
      tx.recentBlockhash = blockhash;
      tx.feePayer = wallet.publicKey;

      const signed = await wallet.signTransaction(tx);
      const sig = await connection.sendRawTransaction(signed.serialize());
      await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed");

      const mintRes = await fetch("/api/deposit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vaultId: vault.id,
          txSignature: sig,
          userWallet: wallet.publicKey.toBase58(),
        }),
      });

      const mintJson = await mintRes.json();
      if (!mintJson.success) {
        setError(
          `USDC deposited (${sig.slice(0, 8)}...) but ${vault.receiptToken} minting failed: ${mintJson.error || "Unknown error"}. Contact support with your tx signature.`
        );
        return;
      }

      setTxSignature(sig);
      setAmount("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Deposit failed");
    } finally {
      setLoading(false);
    }
  };

  if (txSignature) {
    return (
      <div className="aw-success">
        <div className="aw-success-title"><Check style={{ width: 18, height: 18 }} />Deposit Successful</div>
        <p className="aw-success-text">Your USDC has been deposited. {vault.receiptToken} tokens will be minted to your wallet.</p>
        <a href={getTxUrl(txSignature)} target="_blank" rel="noopener noreferrer" className="aw-explorer">
          View on Explorer <ExternalLink style={{ width: 11, height: 11 }} />
        </a>
        <button onClick={() => setTxSignature(null)} className="aw-reset">Deposit again</button>
      </div>
    );
  }

  const num = parseFloat(amount);
  const hasAmount = !isNaN(num) && num > 0;

  return (
    <form onSubmit={handleDeposit}>
      <div className="aw-info-row">
        <span className="aw-info-text">{vault.name} · ~{vault.apy > 0 ? formatAPY(vault.apy) : "--"}% APY</span>
        {hasAmount && <span className="aw-badge-green">+~${(num * vault.apy / 100).toFixed(0)}/yr</span>}
      </div>
      <div className="aw-input-wrap">
        <input type="number" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} step="0.01" min="0" className="aw-amount" />
        <span className="aw-token">USDC</span>
      </div>
      {hasAmount && (
        <div className="aw-summary">
          {[
            { label: "You receive", value: vault.receiptToken },
            { label: "Est. yearly", value: `~$${(num * vault.apy / 100).toFixed(2)}` },
            { label: "Network fee", value: `${PROTOCOL_FEE_SOL} SOL` },
          ].map(({ label, value }) => (
            <div key={label} className="aw-summary-row">
              <span className="aw-summary-label">{label}</span>
              <span className="aw-summary-value">{value}</span>
            </div>
          ))}
        </div>
      )}
      {error && <p className="aw-error">{error}</p>}
      <button type="submit" disabled={loading || !hasAmount} className="aw-submit">
        {loading ? <><Loader2 className="animate-spin" style={{ width: 14, height: 14 }} /> Confirming…</> : "Deposit USDC"}
      </button>
    </form>
  );
}

/* ─── Withdraw Form ─── */

function WithdrawForm({
  vault,
  wallet,
  positionBalance,
}: {
  vault: FoundationVault;
  wallet: ReturnType<typeof useWallet>;
  positionBalance: number;
}) {
  const { connection } = useConnection();
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [txSignature, setTxSignature] = useState<string | null>(null);

  const handleWithdraw = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!wallet.publicKey || !wallet.signTransaction) return;

    const num = parseFloat(amount);
    if (isNaN(num) || num <= 0 || num > positionBalance) {
      setError(num > positionBalance ? "Insufficient balance" : "Enter a valid amount");
      return;
    }

    if (!vault.mint) {
      setError("Vault not configured");
      return;
    }

    setLoading(true);
    setError(null);
    setTxSignature(null);

    try {
      const amountLamports = Math.floor(num * 1_000_000);
      const mintPk = new PublicKey(vault.mint);
      const userAta = getAssociatedTokenAddressSync(mintPk, wallet.publicKey, false, TOKEN_2022_PROGRAM_ID);

      const burnIx = createBurnInstruction(
        userAta,
        mintPk,
        wallet.publicKey,
        amountLamports,
        [],
        TOKEN_2022_PROGRAM_ID,
      );

      const feeIx = SystemProgram.transfer({
        fromPubkey: wallet.publicKey,
        toPubkey: new PublicKey(VAULT_AUTHORITY_PUBKEY),
        lamports: Math.floor(PROTOCOL_FEE_SOL * LAMPORTS_PER_SOL),
      });

      const tx = new Transaction().add(burnIx, feeIx);
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
      tx.recentBlockhash = blockhash;
      tx.feePayer = wallet.publicKey;

      const signed = await wallet.signTransaction(tx);
      const sig = await connection.sendRawTransaction(signed.serialize());
      await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed");

      const res = await fetch("/api/withdraw", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vaultId: vault.id,
          burnTxSignature: sig,
          userWallet: wallet.publicKey.toBase58(),
          sharesBurned: amountLamports,
        }),
      });

      const json = await res.json();
      if (!json.success) {
        throw new Error(json.error || "Withdrawal failed");
      }

      setTxSignature(sig);
      setAmount("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Withdrawal failed");
    } finally {
      setLoading(false);
    }
  };

  if (txSignature) {
    return (
      <div className="aw-success">
        <div className="aw-success-title"><Check style={{ width: 18, height: 18 }} />Withdrawal Successful</div>
        <p className="aw-success-text">Your {vault.receiptToken} tokens were burned. USDC will be sent to your wallet.</p>
        <a href={getTxUrl(txSignature)} target="_blank" rel="noopener noreferrer" className="aw-explorer">
          View on Explorer <ExternalLink style={{ width: 11, height: 11 }} />
        </a>
        <button onClick={() => setTxSignature(null)} className="aw-reset">Withdraw again</button>
      </div>
    );
  }

  const num = parseFloat(amount);
  const hasAmount = !isNaN(num) && num > 0;
  const isDisabled = loading || !hasAmount || positionBalance <= 0;

  return (
    <form onSubmit={handleWithdraw}>
      <div className="aw-info-row">
        <span className="aw-info-text">Burn {vault.receiptToken} · receive USDC</span>
        {positionBalance > 0 && <span className="aw-badge-navy">Bal: {positionBalance.toFixed(2)}</span>}
      </div>
      <div className="aw-input-wrap">
        <input type="number" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} step="0.01" min="0" max={positionBalance} className="aw-amount" />
        <button type="button" onClick={() => setAmount(positionBalance.toFixed(2))} className="aw-max">MAX</button>
        <span className="aw-token">{vault.receiptToken}</span>
      </div>
      {hasAmount && (
        <div className="aw-summary">
          {[
            { label: "You receive", value: `~${num.toFixed(2)} USDC` },
            { label: "Network fee", value: `${PROTOCOL_FEE_SOL} SOL` },
          ].map(({ label, value }) => (
            <div key={label} className="aw-summary-row">
              <span className="aw-summary-label">{label}</span>
              <span className="aw-summary-value">{value}</span>
            </div>
          ))}
        </div>
      )}
      {error && <p className="aw-error">{error}</p>}
      <button type="submit" disabled={isDisabled} className="aw-submit">
        {loading ? <><Loader2 className="animate-spin" style={{ width: 14, height: 14 }} /> Burning…</> : "Withdraw USDC"}
      </button>
    </form>
  );
}
