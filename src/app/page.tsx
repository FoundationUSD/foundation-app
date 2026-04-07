"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { useWallet } from "@solana/wallet-adapter-react";
import {
  ArrowUpRight,
  ArrowRight,
  ArrowLeft,
  Loader2,
  Check,
  ExternalLink,
} from "lucide-react";
import { useStrategies } from "@/hooks/useStrategies";
import { WalletModal } from "@/components/WalletModal";
import { formatAPY } from "@/lib/utils";
import { getTxUrl, PROTOCOL_FEE_SOL, VAULT_AUTHORITY_PUBKEY } from "@/lib/constants";
import type { FoundationVault } from "@/lib/vaults";
import { PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { useConnection } from "@solana/wallet-adapter-react";
import {
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  createTransferInstruction,
  createBurnInstruction,
} from "@solana/spl-token";

const RISK_CONFIG: Record<string, { label: string }> = {
  conservative: { label: "Conservative" },
  moderate: { label: "Moderate" },
  growth: { label: "Growth" },
};

const PROTOCOL_LOGO: Record<string, string> = {
  solomon: "/partners/solomon-circle.png",
  kamino: "/partners/kamino.png",
  drift: "/partners/drift.png",
  oro: "/partners/oro.png",
};

const USDC_MINT_PK = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");

export default function HomePage() {
  const { strategies, loading } = useStrategies();
  const wallet = useWallet();
  const [walletModalOpen, setWalletModalOpen] = useState(false);
  const [selectedVault, setSelectedVault] = useState<FoundationVault | null>(null);
  const [activeFilter, setActiveFilter] = useState<"all" | "foundation" | "partner">("all");

  // All vaults are "partner" vaults; Foundation tab = coming soon
  const availableStrategies =
    activeFilter === "foundation" ? [] : strategies;

  // Not connected — landing
  if (!wallet.connected) {
    const bestApy = strategies.length > 0 ? Math.max(...strategies.map((s) => s.apy)) : 0;

    return (
      <div className="fdn-page">
        {/* Hero */}
        <div className="animate-fade-up mb-16 text-center sm:mb-24">
          <div className="mx-auto mb-6 h-10 w-10 animate-float opacity-50 sm:mb-8 sm:h-12 sm:w-12">
            <Image src="/partners/rounded-nobg.png" alt="Foundation" width={48} height={48} />
          </div>
          <h1 className="page-heading mb-4 text-2xl sm:mb-5 sm:text-[3.2rem]">
            Managed RWA Yield
            <br />
            <em>on Solana</em>
          </h1>
          <p className="mx-auto mb-8 max-w-lg text-sm leading-relaxed text-[var(--text-accent)] sm:mb-10 sm:text-[15px]">
            Deposit USDC. Foundation deploys it into institutional credit strategies.
            All managed via Squads multisig. Withdraw anytime.
          </p>
          <button onClick={() => setWalletModalOpen(true)} className="btn-primary inline-flex items-center gap-2">
            Connect Wallet <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* How It Works */}
        <div className="mb-14 sm:mb-20">
          <h2 className="section-label mb-6 sm:mb-10">How It Works</h2>
          <div className="grid gap-6 sm:gap-10 md:grid-cols-4">
            {[
              { n: "01", title: "Deposit USDC", desc: "Connect wallet and deposit into any Foundation vault." },
              { n: "02", title: "Receive Token", desc: "Get soloUSD, kmnoUSD, or oroUSD. Balance grows with yield." },
              { n: "03", title: "We Manage", desc: "Foundation deploys USDC into the strategy via Squads multisig." },
              { n: "04", title: "Withdraw", desc: "Burn vault tokens anytime to get USDC back with accrued yield." },
            ].map((item) => (
              <div key={item.n}>
                <span className="mb-2 block font-mono text-[10px] tracking-[0.2em] text-gold-500">{item.n}</span>
                <h4 className="mb-1.5 text-[13px] font-medium text-[var(--text-page)]">{item.title}</h4>
                <p className="text-[12px] leading-relaxed text-[var(--text-accent)]">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>

        <footer className="pt-4 text-center">
          <div className="fdn-divider mb-5" />
          <p className="font-mono text-[9px] uppercase tracking-[0.25em] text-[var(--text-accent)]">
            Foundation · Solana · Squads Multisig · Token-2022
          </p>
        </footer>

        <WalletModal open={walletModalOpen} onClose={() => setWalletModalOpen(false)} />
      </div>
    );
  }

  // Connected — vault grid
  return (
    <div className="fdn-page">
      <div className="mb-6 flex items-end justify-between sm:mb-8">
        <div>
          <p className="section-label mb-1 sm:mb-2">
            {selectedVault ? selectedVault.protocol.toUpperCase() : "VAULT INFRASTRUCTURE"}
          </p>
          <h1 className="page-heading text-xl sm:text-2xl">
            {selectedVault ? selectedVault.name : <>Deposit <em>Strategies</em></>}
          </h1>
          {!selectedVault && (
            <p className="mt-1 max-w-xl text-sm text-[var(--text-accent)]">
              Institutional-grade yield vaults. Deposit USDC to access diversified real-world asset strategies on chain.
            </p>
          )}
        </div>
        <div className="flex items-center gap-3">
          {selectedVault && (
            <button onClick={() => setSelectedVault(null)} className="fnd-nav-link">
              <ArrowLeft className="h-3 w-3" /> Back
            </button>
          )}
          <Link href="/portfolio" className="fnd-nav-link">
            Portfolio <ArrowUpRight className="h-3 w-3" />
          </Link>
        </div>
      </div>

      {selectedVault ? (
        <VaultDetail vault={selectedVault} onBack={() => setSelectedVault(null)} />
      ) : (
        <>
          {/* Source Filter — glass pill container */}
          <div className="bg-white/40 dark:bg-white/05 inline-flex items-center gap-0 rounded-xl border border-[var(--rule)] bg-[#f0f4ff] p-0.5">
            {(["all", "foundation", "partner"] as const).map((filter) => (
              <button
                key={filter}
                onClick={() => setActiveFilter(filter)}
                className={`cursor-pointer rounded-lg px-3 py-2 text-xs font-medium transition-colors sm:text-sm ${
                  activeFilter === filter
                    ? "rounded-lg bg-[#ffffff] px-3 py-2 text-xs font-medium text-[#0c2340] shadow-sm"
                    : "cursor-pointer rounded-lg px-3 py-2 text-xs font-medium transition-colors text-[var(--text-accent)] hover:text-[#0f172a] hover:bg-white/50"
                }`}
              >
                {filter === "all" ? "All Vaults" : filter === "foundation" ? "Foundation" : "Partner"}
              </button>
            ))}
          </div>

          {activeFilter === "foundation" ? (
            <div className="infra-card mx-auto max-w-md p-10 text-center">
              <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full border border-[var(--rule)] bg-white shadow-sm">
                <Image
                  src="/partners/rounded-bg.png"
                  alt="Foundation"
                  width={52}
                  height={52}
                  className="h-13 w-13 rounded-full fdn-logo-light"
                />
                <Image
                  src="/partners/rounded-nobg.png"
                  alt="Foundation"
                  width={52}
                  height={52}
                  className="h-13 w-13 rounded-full fdn-logo-dark"
                />
              </div>
              <h3 className="mb-2 font-serif text-2xl font-light text-[var(--fg)]">Foundation Vaults</h3>
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-gold-500 mb-4">Coming Soon</p>
              <p className="text-sm text-[var(--muted)] leading-relaxed">
                Foundation-native vaults are in development. Check back soon for institutional-grade strategies managed entirely on-chain.
              </p>
            </div>
          ) : loading ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="skeleton h-64" />
              ))}
            </div>
          ) : availableStrategies.length === 0 ? (
            <p className="py-12 text-center font-mono text-sm text-[var(--text-accent)]">No vaults found</p>
          ) : (
            <div className="stagger-children grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {availableStrategies.map((v) => (
                <VaultCard key={v.id} vault={v} onSelect={() => setSelectedVault(v)} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ============================================================
   Vault Card — matches AppFrontend strategy card
   ============================================================ */
function VaultCard({ vault, onSelect }: { vault: FoundationVault; onSelect: () => void }) {
  const risk = RISK_CONFIG[vault.riskTier];
  const logo = PROTOCOL_LOGO[vault.protocol];

  return (
    <div
      onClick={onSelect}
      className="strategy-card cursor-pointer transition-all hover:-translate-y-0.5 overflow-hidden"
      data-glow
    >
      {/* Header */}
      <div className="strategy-card__header flex items-center justify-between">
        <div className="min-w-0 flex-1 items-center gap-3 flex">
          {logo && <Image src={logo} alt={vault.protocol} width={32} height={32} className="h-8 w-8 flex-shrink-0" />}
          <span className="truncate font-mono text-base font-bold tracking-[-0.02em] text-[#0f172a]">
            {vault.name}
          </span>
        </div>
        <span className={`risk-badge ${risk.label.toLowerCase()}`}>{risk.label}</span>
      </div>

      {/* Description */}
      <div className="strategy-card__body">
        <p className="line-clamp-2 text-[13px]">{vault.description}</p>
      </div>

      {/* Data Grid */}
      <div className="divide-y divide-[var(--rule)] ">
        {/* Row 1: APY + TVL */}
        <div className="grid grid-cols-2 divide-x divide-[var(--rule)] ">
          <div className="px-5 py-4">
            <span className="section-label mb-1.5 block">TARGET APY</span>
            <span className="font-mono text-2xl font-bold tracking-[-0.03em] text-emerald-600">
              {vault.apy > 0 ? `${vault.apy}%` : "--"}
            </span>
          </div>
          <div className="px-5 py-4">
            <span className="section-label mb-1.5 block">STATUS</span>
            <span className={`font-mono text-sm font-semibold ${vault.status === "live" ? "text-emerald-600" : "text-[var(--text-accent)]"}`}>
              {vault.status === "live" ? "Live" : "Coming Soon"}
            </span>
          </div>
        </div>

        {/* Row 2: Curator + Type */}
        <div className="grid grid-cols-2 divide-x divide-[var(--rule)] ">
          <div className="px-5 py-4">
            <span className="section-label mb-1.5 block">CURATOR</span>
            <span className="font-mono text-sm font-semibold text-[#0f172a]">
              {vault.protocol.charAt(0).toUpperCase() + vault.protocol.slice(1)}
            </span>
          </div>
          <div className="px-5 py-4">
            <span className="section-label mb-1.5 block">TYPE</span>
            <span className="font-mono text-sm font-semibold text-[#0f172a] uppercase">
              {vault.strategy}
            </span>
          </div>
        </div>
      </div>

      {/* CTA */}
      <div className="strategy-card__footer flex items-center justify-between">
        <span className="text-[11px] font-mono tracking-wide text-[var(--text-accent)]">USDC</span>
        <span className="text-[13px] font-medium tracking-wide text-[var(--navy)] transition-colors">
          View Details &rarr;
        </span>
      </div>
    </div>
  );
}

/* ============================================================
   Vault Detail
   ============================================================ */
function VaultDetail({ vault, onBack }: { vault: FoundationVault; onBack: () => void }) {
  const risk = RISK_CONFIG[vault.riskTier];
  const logo = PROTOCOL_LOGO[vault.protocol];

  return (
    <div className="animate-fade-up">
      <div className="mb-6 flex items-center gap-3">
        {logo && <Image src={logo} alt={vault.protocol} width={24} height={24} />}
        <span className={`risk-badge ${risk.label.toLowerCase()}`}>{risk.label}</span>
        <span className={`fdn-status-badge ${vault.status === "live" ? "live" : ""}`}>
          {vault.status === "live" ? "Live" : "Coming Soon"}
        </span>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        {/* Details */}
        <div className="border border-[var(--rule)] p-5 sm:p-6">
          <h3 className="section-label mb-4">Vault Details</h3>
          <div className="space-y-2.5 text-[12px] sm:text-[13px]">
            {[
              ["APY", vault.apy > 0 ? `${vault.apy}%` : "--"],
              ["Strategy", vault.strategy],
              ["Underlying", vault.underlying],
              ["Receipt Token", vault.receiptToken],
              ["Deposit Asset", "USDC"],
              ["Vault Custody", "Squads Multisig"],
              ["Risk", risk.label],
            ].map(([label, val]) => (
              <div key={label} className="flex justify-between">
                <span className="text-[var(--text-accent)]">{label}</span>
                <span className="font-mono text-[var(--text-page)]">{val}</span>
              </div>
            ))}
          </div>
        </div>

        <div>
          <VaultActions vault={vault} />
        </div>
      </div>

      {/* How It Works */}
      <div className="mt-6 border border-[var(--rule)] p-5 sm:p-6">
        <h3 className="section-label mb-4">How It Works</h3>
        <div className="space-y-2.5">
          {vault.howItWorks.map((step, i) => (
            <div key={i} className="flex gap-3 text-[12px] text-[var(--text-accent)]">
              <span className="font-mono text-gold-500">{String(i + 1).padStart(2, "0")}</span>
              <p className="leading-relaxed">{step}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   Deposit / Withdraw Tabs
   ============================================================ */
function VaultActions({ vault }: { vault: FoundationVault }) {
  const [tab, setTab] = useState<"deposit" | "withdraw">("deposit");

  return (
    <div className="infra-card">
      <div className="mb-4 flex items-center justify-between border-b border-[var(--rule)] px-5 py-4">
        <h4 className="font-mono text-xs font-medium uppercase tracking-wider text-[#0c2340]">Vault Actions</h4>
        <div className="flex gap-0 overflow-hidden rounded-xl border border-[var(--rule)] bg-[#f0f4ff] dark:bg-[#0f1729]">
          {(["deposit", "withdraw"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`cursor-pointer px-3 py-2 text-xs font-medium transition-colors ${
                tab === t
                  ? "rounded-lg bg-[#ffffff] px-3 py-2 text-xs font-medium text-[#0c2340] shadow-sm"
                  : "text-[var(--text-accent)] hover:text-[#0c2340] hover:bg-white/50"
              }`}
            >
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
      </div>
      <div className="p-5 sm:p-6">
        {tab === "deposit" ? <DepositForm vault={vault} /> : <WithdrawForm vault={vault} />}
      </div>
    </div>
  );
}

/* ============================================================
   Deposit Form
   ============================================================ */
function DepositForm({ vault }: { vault: FoundationVault }) {
  const { connection } = useConnection();
  const wallet = useWallet();
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [txSig, setTxSig] = useState<string | null>(null);

  const handleDeposit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!wallet.publicKey || !wallet.signTransaction) return;
    const num = parseFloat(amount);
    if (isNaN(num) || num <= 0) { setError("Enter a valid amount"); return; }
    if (!vault.usdcAccount) { setError("Vault not configured"); return; }

    setLoading(true); setError(null); setTxSig(null);

    try {
      const lamports = Math.floor(num * 1e6);
      const userAta = getAssociatedTokenAddressSync(USDC_MINT_PK, wallet.publicKey);
      const vaultAta = new PublicKey(vault.usdcAccount);
      const ix = createTransferInstruction(userAta, vaultAta, wallet.publicKey, lamports, [], TOKEN_PROGRAM_ID);
      const feeIx = SystemProgram.transfer({
        fromPubkey: wallet.publicKey,
        toPubkey: new PublicKey(VAULT_AUTHORITY_PUBKEY),
        lamports: Math.floor(PROTOCOL_FEE_SOL * LAMPORTS_PER_SOL),
      });
      const tx = new Transaction().add(ix, feeIx);
      const { blockhash } = await connection.getLatestBlockhash();
      tx.recentBlockhash = blockhash;
      tx.feePayer = wallet.publicKey;
      const signed = await wallet.signTransaction(tx);
      const sig = await connection.sendRawTransaction(signed.serialize());
      await connection.confirmTransaction(sig, "confirmed");

      const res = await fetch("/api/deposit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vaultId: vault.id, txSignature: sig, userWallet: wallet.publicKey.toBase58() }),
      });
      const json = await res.json();
      if (!json.success) {
        setError(`USDC sent but minting failed: ${json.error}. Save tx: ${sig.slice(0, 12)}...`);
        return;
      }
      setTxSig(sig);
      setAmount("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Deposit failed");
    } finally { setLoading(false); }
  };

  if (txSig) return <TxSuccess sig={txSig} label="Deposit Successful" onReset={() => setTxSig(null)} />;

  return (
    <form onSubmit={handleDeposit}>
      <p className="mb-4 font-mono text-[10px] text-[var(--text-accent)]">
        {vault.name} · {vault.apy > 0 ? `~${vault.apy}%` : "--"} APY
      </p>
      <AmountInput value={amount} onChange={setAmount} token="USDC" />
      {amount && parseFloat(amount) > 0 && (
        <div className="mb-4 space-y-1">
          <Row label="You receive" value={vault.receiptToken} />
          <Row label="Est. yearly" value={vault.apy > 0 ? `~$${(parseFloat(amount) * vault.apy / 100).toFixed(2)}` : "--"} />
          <Row label="Network fee" value={`${PROTOCOL_FEE_SOL} SOL`} />
        </div>
      )}
      {error && <p className="mb-3 font-mono text-[10px] text-red-500">{error}</p>}
      <button type="submit" disabled={loading || !amount || parseFloat(amount) <= 0} className="btn-primary flex w-full items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-50">
        {loading ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Confirming...</> : "Deposit USDC"}
      </button>
    </form>
  );
}

/* ============================================================
   Withdraw Form
   ============================================================ */
function WithdrawForm({ vault }: { vault: FoundationVault }) {
  const { connection } = useConnection();
  const wallet = useWallet();
  const [amount, setAmount] = useState("");
  const [balance, setBalance] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [txSig, setTxSig] = useState<string | null>(null);

  useEffect(() => {
    if (!wallet.publicKey) return;
    (async () => {
      try {
        const res = await fetch(`/api/user/portfolio?wallet=${wallet.publicKey!.toBase58()}`);
        const json = await res.json();
        const pos = json.data?.find((p: { vaultId: string }) => p.vaultId === vault.id);
        setBalance(pos ? pos.depositedUsdc : 0);
      } catch { setBalance(0); }
    })();
  }, [wallet.publicKey, vault.id]);

  const handleWithdraw = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!wallet.publicKey || !wallet.signTransaction || !vault.mint) return;
    const num = parseFloat(amount);
    if (isNaN(num) || num <= 0 || num > balance) { setError(num > balance ? "Exceeds balance" : "Enter valid amount"); return; }

    setLoading(true); setError(null); setTxSig(null);

    try {
      const lamports = Math.floor(num * 1e6);
      const mintPk = new PublicKey(vault.mint);
      const userAta = getAssociatedTokenAddressSync(mintPk, wallet.publicKey, false, TOKEN_2022_PROGRAM_ID);
      const ix = createBurnInstruction(userAta, mintPk, wallet.publicKey, lamports, [], TOKEN_2022_PROGRAM_ID);
      const feeIx = SystemProgram.transfer({
        fromPubkey: wallet.publicKey,
        toPubkey: new PublicKey(VAULT_AUTHORITY_PUBKEY),
        lamports: Math.floor(PROTOCOL_FEE_SOL * LAMPORTS_PER_SOL),
      });
      const tx = new Transaction().add(ix, feeIx);
      const { blockhash } = await connection.getLatestBlockhash();
      tx.recentBlockhash = blockhash;
      tx.feePayer = wallet.publicKey;
      const signed = await wallet.signTransaction(tx);
      const sig = await connection.sendRawTransaction(signed.serialize());
      await connection.confirmTransaction(sig, "confirmed");

      const res = await fetch("/api/withdraw", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vaultId: vault.id, burnTxSignature: sig, userWallet: wallet.publicKey.toBase58() }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      setTxSig(sig);
      setAmount("");
      setBalance((b) => b - num);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Withdrawal failed");
    } finally { setLoading(false); }
  };

  if (txSig) return <TxSuccess sig={txSig} label="Withdrawal Successful" sub={`${vault.receiptToken} burned. USDC sent to your wallet.`} onReset={() => setTxSig(null)} />;

  return (
    <form onSubmit={handleWithdraw}>
      <p className="mb-4 font-mono text-[10px] text-[var(--text-accent)]">
        Burn {vault.receiptToken} · Balance: {balance > 0 ? `$${balance.toFixed(2)}` : "$0.00"}
      </p>
      <AmountInput value={amount} onChange={setAmount} token={vault.receiptToken} onMax={() => setAmount(balance.toString())} />
      {amount && parseFloat(amount) > 0 && (
        <div className="mb-4 space-y-1">
          <Row label="You receive" value={`~${parseFloat(amount).toFixed(2)} USDC`} />
          <Row label="Network fee" value={`${PROTOCOL_FEE_SOL} SOL`} />
        </div>
      )}
      {error && <p className="mb-3 font-mono text-[10px] text-red-500">{error}</p>}
      <button type="submit" disabled={loading || !amount || parseFloat(amount) <= 0 || balance <= 0} className="btn-glass flex w-full items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-50">
        {loading ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Burning...</> : "Withdraw USDC"}
      </button>
    </form>
  );
}

/* ============================================================
   Shared UI
   ============================================================ */
function AmountInput({ value, onChange, token, onMax }: { value: string; onChange: (v: string) => void; token: string; onMax?: () => void }) {
  return (
    <div className="amount-input">
      <input
        type="number"
        placeholder="0.00"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="amount-input-field"
        step="0.01"
        min="0"
      />
      {onMax && <button type="button" onClick={onMax} className="amount-input-max">MAX</button>}
      <span className="amount-input-token">{token}</span>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-[11px] font-mono">
      <span className="text-[var(--text-accent)]">{label}</span>
      <span className="text-[var(--text-page)]">{value}</span>
    </div>
  );
}

function TxSuccess({ sig, label, sub, onReset }: { sig: string; label: string; sub?: string; onReset: () => void }) {
  return (
    <div>
      <div className="mb-3 flex items-center gap-2 text-emerald-500">
        <Check className="h-4 w-4" />
        <span className="font-mono text-[12px]">{label}</span>
      </div>
      {sub && <p className="mb-3 text-[11px] text-[var(--text-accent)]">{sub}</p>}
      <a href={getTxUrl(sig)} target="_blank" rel="noopener noreferrer" className="mb-4 flex items-center gap-1 text-[11px] font-mono text-gold-500">
        View on Solscan <ExternalLink className="h-3 w-3" />
      </a>
      <button onClick={onReset} className="font-mono text-[10px] text-[var(--text-accent)] hover:text-[#0f172a]">

        Continue
      </button>
    </div>
  );
}
