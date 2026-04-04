"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { useWallet } from "@solana/wallet-adapter-react";
import { useConnection } from "@solana/wallet-adapter-react";
import { PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  createTransferInstruction,
  createBurnInstruction,
} from "@solana/spl-token";
import {
  Shield,
  TrendingUp,
  Lock,
  ArrowRight,
  ArrowUpRight,
  ArrowLeft,
  X,
  Loader2,
  Check,
  ExternalLink,
} from "lucide-react";
import { useStrategies } from "@/hooks/useStrategies";
import { WalletModal } from "@/components/WalletModal";
import { formatAPY } from "@/lib/utils";
import { getTxUrl, PROTOCOL_FEE_SOL, VAULT_AUTHORITY_PUBKEY } from "@/lib/constants";
import type { FoundationVault } from "@/lib/vaults";

const RISK_CONFIG = {
  conservative: { color: "text-emerald-400", bg: "bg-emerald-500/10", label: "Conservative" },
  moderate: { color: "text-blue-400", bg: "bg-blue-500/10", label: "Moderate" },
  growth: { color: "text-amber-400", bg: "bg-amber-500/10", label: "Growth" },
};

const PROTOCOL_LOGO: Record<string, string> = {
  solomon: "/partners/solomon-circle.png",
  kamino: "/partners/kamino.png",
  drift: "/partners/drift.png",
  oro: "/partners/oro.png",
};

const ACCENT_COLOR: Record<string, string> = {
  solomon: "bg-emerald-500",
  kamino: "bg-blue-500",
  oro: "bg-yellow-500",
  drift: "bg-purple-500",
};

const USDC_MINT_PK = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");

export default function HomePage() {
  const { strategies, loading } = useStrategies();
  const wallet = useWallet();
  const [walletModalOpen, setWalletModalOpen] = useState(false);
  const [selectedVault, setSelectedVault] = useState<FoundationVault | null>(null);

  const bestApy = strategies.length > 0 ? Math.max(...strategies.map((s) => s.apy)) : 0;
  const liveVaults = strategies.filter((s) => s.status === "live");
  const comingSoon = strategies.filter((s) => s.status === "coming_soon");

  // Not connected — landing
  if (!wallet.connected) {
    return (
      <div className="mx-auto max-w-[1080px] px-4 py-10 sm:px-6 sm:py-16">
        <div className="animate-fade-up mb-16 text-center sm:mb-24">
          <div className="mx-auto mb-6 h-10 w-10 animate-float opacity-50 sm:mb-8 sm:h-12 sm:w-12">
            <Image src="/partners/rounded-nobg.png" alt="Foundation" width={48} height={48} />
          </div>
          <h1 className="mb-4 font-serif text-3xl font-light leading-[1.1] tracking-tight text-foreground sm:mb-5 sm:text-[3.2rem]">
            Managed RWA Yield
            <br />
            <span className="text-gradient-gold">on Solana</span>
          </h1>
          <p className="mx-auto mb-8 max-w-lg text-sm leading-relaxed text-muted sm:mb-10 sm:text-[15px]">
            Deposit USDC. Foundation deploys it into institutional credit strategies.
            All managed via Squads multisig. Withdraw anytime.
          </p>
          <button onClick={() => setWalletModalOpen(true)} className="btn-primary inline-flex items-center gap-2">
            Connect Wallet <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Partners */}
        <div className="animate-fade-up mb-14 sm:mb-20" style={{ animationDelay: "0.05s" }}>
          <div className="divider mb-5" />
          <div className="flex items-center justify-center gap-6 sm:gap-10">
            {[
              { src: "/partners/solomon-circle.png", alt: "Solomon" },
              { src: "/partners/kamino.png", alt: "Kamino" },
              { src: "/partners/drift.png", alt: "Drift" },
              { src: "/partners/securitize.svg", alt: "Securitize" },
              { src: "/partners/oro.png", alt: "Oro" },
            ].map((p) => (
              <div key={p.alt} className="flex h-6 w-6 items-center justify-center opacity-30 sm:h-7 sm:w-7">
                <Image src={p.src} alt={p.alt} width={28} height={28} className="h-full w-full object-contain" />
              </div>
            ))}
          </div>
          <div className="divider mt-5" />
        </div>

        {/* Value props */}
        <div className="animate-fade-up mb-14 grid gap-[1px] overflow-hidden border border-white/[0.04] sm:mb-20 md:grid-cols-3" style={{ animationDelay: "0.1s" }}>
          {[
            { icon: Shield, title: "Squads Multisig", desc: "Every vault is a Squads multisig. No single key controls funds." },
            { icon: TrendingUp, title: `Up to ${bestApy > 0 ? formatAPY(bestApy) : "12%+"} APY`, desc: "Yield from institutional credit, basis trades, and gold leasing." },
            { icon: Lock, title: "Token-2022 Receipt", desc: "Vault tokens accrue yield automatically. No claiming needed." },
          ].map((item) => (
            <div key={item.title} className="bg-white/[0.015] p-5 transition-colors hover:bg-white/[0.03] sm:p-7">
              <item.icon className="mb-3 h-4 w-4 text-gold-500" />
              <h3 className="mb-1.5 text-[13px] font-medium text-foreground">{item.title}</h3>
              <p className="text-[12px] leading-relaxed text-muted-foreground">{item.desc}</p>
            </div>
          ))}
        </div>

        {/* Vaults */}
        <div className="mb-14 sm:mb-20">
          <h2 className="section-label mb-6 sm:mb-10">Vaults</h2>
          {loading ? (
            <div className="space-y-4">{[1, 2, 3].map((i) => <div key={i} className="skeleton h-[80px]" />)}</div>
          ) : (
            <div className="stagger-children space-y-3 sm:space-y-4">
              {strategies.map((v) => <VaultRow key={v.id} vault={v} onClick={() => setWalletModalOpen(true)} />)}
            </div>
          )}
        </div>

        {/* How it works */}
        <div className="mb-14 border border-white/[0.04] p-6 sm:mb-20 sm:p-10">
          <h2 className="section-label mb-6 sm:mb-8">How It Works</h2>
          <div className="grid gap-6 sm:gap-10 md:grid-cols-4">
            {[
              { n: "01", title: "Deposit USDC", desc: "Connect wallet and deposit into any Foundation vault." },
              { n: "02", title: "Receive Token", desc: "Get ArbUSD, fdnKAMINO, or fdnGOLD. Balance grows with yield." },
              { n: "03", title: "We Manage", desc: "Foundation deploys USDC into the strategy via Squads multisig." },
              { n: "04", title: "Withdraw", desc: "Burn vault tokens anytime to get USDC back with accrued yield." },
            ].map((item) => (
              <div key={item.n}>
                <span className="mb-2 block font-mono text-[10px] tracking-[0.2em] text-gold-500/60">{item.n}</span>
                <h4 className="mb-1.5 text-[13px] font-medium text-foreground">{item.title}</h4>
                <p className="text-[12px] leading-relaxed text-muted-foreground">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>

        <footer className="pt-4 text-center">
          <div className="divider mb-5" />
          <p className="font-mono text-[9px] uppercase tracking-[0.25em] text-muted-foreground">
            Foundation · Solana · Squads Multisig · Token-2022
          </p>
        </footer>

        <WalletModal open={walletModalOpen} onClose={() => setWalletModalOpen(false)} />
      </div>
    );
  }

  // Connected — SPA dashboard
  return (
    <div className="mx-auto max-w-[1080px] px-4 py-6 sm:px-6 sm:py-8">
      {/* Header */}
      <div className="mb-6 flex items-end justify-between sm:mb-8">
        <div>
          <p className="section-label mb-1 sm:mb-2">Dashboard</p>
          <h1 className="font-serif text-xl font-light text-foreground sm:text-2xl">
            {selectedVault ? selectedVault.name : "Your Vaults"}
          </h1>
        </div>
        <div className="flex items-center gap-3">
          {selectedVault && (
            <button
              onClick={() => setSelectedVault(null)}
              className="flex items-center gap-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeft className="h-3 w-3" /> Back
            </button>
          )}
          <Link
            href="/portfolio"
            className="flex items-center gap-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground"
          >
            Portfolio <ArrowUpRight className="h-3 w-3" />
          </Link>
        </div>
      </div>

      {selectedVault ? (
        // Vault detail inline
        <VaultDetail vault={selectedVault} onBack={() => setSelectedVault(null)} />
      ) : (
        // Vault list
        <>
          {loading ? (
            <div className="space-y-4">{[1, 2, 3].map((i) => <div key={i} className="skeleton h-[100px]" />)}</div>
          ) : (
            <>
              <div className="stagger-children space-y-4">
                {liveVaults.map((v) => (
                  <VaultCard key={v.id} vault={v} onSelect={() => setSelectedVault(v)} />
                ))}
              </div>
              {comingSoon.length > 0 && (
                <div className="mt-8 sm:mt-10">
                  <p className="mb-3 font-mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground sm:mb-4">Coming Soon</p>
                  <div className="space-y-3">
                    {comingSoon.map((v) => <VaultRow key={v.id} vault={v} />)}
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

// ============================================================
// Vault Card — dashboard list item
// ============================================================
function VaultCard({ vault, onSelect }: { vault: FoundationVault; onSelect: () => void }) {
  const risk = RISK_CONFIG[vault.riskTier];
  const logo = PROTOCOL_LOGO[vault.protocol];
  const accent = ACCENT_COLOR[vault.protocol] || "bg-white/20";

  return (
    <div onClick={onSelect} className="glass-card group cursor-pointer overflow-hidden">
      <div className="flex items-stretch">
        <div className={`w-[3px] ${accent}`} />
        <div className="flex flex-1 flex-col gap-4 p-5 sm:flex-row sm:items-start sm:justify-between sm:gap-8 sm:p-6">
          {/* Info */}
          <div className="min-w-0 flex-1">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              {logo && <Image src={logo} alt={vault.protocol} width={20} height={20} />}
              <h3 className="text-sm font-medium text-foreground sm:text-[15px]">{vault.name}</h3>
              <span className={`${risk.bg} ${risk.color} px-1.5 py-0.5 font-mono text-[7px] uppercase tracking-[0.12em] sm:text-[8px]`}>
                {risk.label}
              </span>
            </div>
            <p className="mb-1 font-mono text-[9px] tracking-wide text-muted-foreground sm:text-[10px]">
              {vault.strategy} · {vault.receiptToken}
            </p>
            <p className="hidden text-[13px] leading-relaxed text-muted-foreground sm:block">
              {vault.description}
            </p>
          </div>

          {/* APY + CTA */}
          <div className="flex items-center justify-between sm:block sm:shrink-0 sm:text-right">
            <div>
              <p className="text-gradient-gold font-mono text-2xl font-medium leading-none sm:text-[1.8rem]">
                {vault.apy > 0 ? formatAPY(vault.apy) : "--"}
              </p>
              <p className="mt-0.5 font-mono text-[8px] uppercase tracking-[0.2em] text-muted-foreground sm:text-[9px]">APY</p>
            </div>
            <span className="btn-primary inline-flex items-center gap-1.5 px-3 py-1.5 text-[9px] sm:mt-4 sm:px-4 sm:py-2 sm:text-[10px]">
              Deposit <ArrowRight className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Vault Row — compact, for landing + coming soon
// ============================================================
function VaultRow({ vault, onClick }: { vault: FoundationVault; onClick?: () => void }) {
  const logo = PROTOCOL_LOGO[vault.protocol];
  const accent = ACCENT_COLOR[vault.protocol] || "bg-white/20";
  const risk = RISK_CONFIG[vault.riskTier];

  return (
    <div onClick={onClick} className="group flex cursor-pointer items-center gap-3 border border-white/[0.04] p-3 transition-all hover:border-white/[0.08] hover:bg-white/[0.015] sm:gap-4 sm:p-4">
      <div className={`h-6 w-[3px] sm:h-8 ${accent}`} />
      {logo && <Image src={logo} alt={vault.protocol} width={18} height={18} className="opacity-60 sm:h-5 sm:w-5" />}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 sm:gap-2">
          <p className="text-xs font-medium text-foreground sm:text-[13px]">{vault.name}</p>
          <span className={`hidden sm:inline ${risk.bg} ${risk.color} px-1.5 py-0.5 font-mono text-[7px] uppercase tracking-[0.12em]`}>
            {risk.label}
          </span>
          {vault.status === "coming_soon" && (
            <span className="bg-white/[0.03] px-1.5 py-0.5 font-mono text-[7px] uppercase tracking-[0.12em] text-muted-foreground">Soon</span>
          )}
        </div>
        <p className="font-mono text-[9px] text-muted-foreground sm:text-[10px]">{vault.strategy}</p>
      </div>
      <p className="text-gradient-gold font-mono text-sm font-medium sm:text-[15px]">{vault.apy > 0 ? formatAPY(vault.apy) : "--"}</p>
      <ArrowRight className="h-3 w-3 text-muted-foreground sm:h-3.5 sm:w-3.5" />
    </div>
  );
}

// ============================================================
// Vault Detail — inline panel with deposit/withdraw
// ============================================================
function VaultDetail({ vault, onBack }: { vault: FoundationVault; onBack: () => void }) {
  const risk = RISK_CONFIG[vault.riskTier];
  const logo = PROTOCOL_LOGO[vault.protocol];

  return (
    <div className="animate-fade-up">
      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        {logo && <Image src={logo} alt={vault.protocol} width={24} height={24} />}
        <span className={`${risk.bg} ${risk.color} px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-[0.12em]`}>
          {risk.label}
        </span>
        <span className="bg-success/10 px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-[0.12em] text-success">Live</span>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        {/* Left — details */}
        <div>
          <div className="border border-white/[0.04] p-5 sm:p-6">
            <h3 className="section-label mb-4">Details</h3>
            <div className="space-y-2.5 text-[12px] sm:text-[13px]">
              {[
                ["APY", vault.apy > 0 ? formatAPY(vault.apy) : "--"],
                ["Strategy", vault.strategy],
                ["Underlying", vault.underlying],
                ["Receipt Token", vault.receiptToken],
                ["Deposit Asset", "USDC"],
                ["Vault Custody", "Squads Multisig"],
                ["Risk", risk.label],
              ].map(([label, val]) => (
                <div key={label} className="flex justify-between">
                  <span className="text-muted-foreground">{label}</span>
                  <span className={`font-mono ${label === "APY" ? "text-gradient-gold font-medium" : label === "Risk" ? risk.color : "text-foreground"}`}>
                    {val}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right — deposit/withdraw */}
        <div>
          <VaultActions vault={vault} />
        </div>
      </div>

      {/* How It Works — below deposit/withdraw on mobile, below grid on all */}
      <div className="mt-6 border border-white/[0.04] p-5 sm:p-6">
        <h3 className="section-label mb-4">How It Works</h3>
        <div className="space-y-2.5">
          {vault.howItWorks.map((step, i) => (
            <div key={i} className="flex gap-3 text-[12px] text-muted-foreground">
              <span className="font-mono text-gold-500/60">{String(i + 1).padStart(2, "0")}</span>
              <p className="leading-relaxed">{step}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Deposit / Withdraw tabs
// ============================================================
function VaultActions({ vault }: { vault: FoundationVault }) {
  const [tab, setTab] = useState<"deposit" | "withdraw">("deposit");

  return (
    <div className="border border-white/[0.04]">
      <div className="flex border-b border-white/[0.04]">
        {(["deposit", "withdraw"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-3 font-mono text-[10px] uppercase tracking-[0.15em] transition-colors ${
              tab === t ? "bg-white/[0.03] text-foreground" : "text-muted-foreground hover:text-muted-foreground"
            }`}
          >
            {t}
          </button>
        ))}
      </div>
      <div className="p-5 sm:p-6">
        {tab === "deposit" ? <DepositForm vault={vault} /> : <WithdrawForm vault={vault} />}
      </div>
    </div>
  );
}

// ============================================================
// Deposit Form
// ============================================================
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
      // Protocol fee — covers Squads multisig tx costs
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
      <p className="mb-4 font-mono text-[10px] text-muted-foreground">
        {vault.name} · {vault.apy > 0 ? formatAPY(vault.apy) : "--"} APY
      </p>
      <AmountInput value={amount} onChange={setAmount} token="USDC" />
      {amount && parseFloat(amount) > 0 && (
        <div className="mb-4 space-y-1">
          <Row label="You receive" value={vault.receiptToken} />
          <Row label="Est. yearly" value={vault.apy > 0 ? `~$${(parseFloat(amount) * vault.apy / 100).toFixed(2)}` : "--"} gold />
          <Row label="Network fee" value={`${PROTOCOL_FEE_SOL} SOL`} />
        </div>
      )}
      {error && <p className="mb-3 font-mono text-[10px] text-error">{error}</p>}
      <button type="submit" disabled={loading || !amount || parseFloat(amount) <= 0} className="btn-primary flex w-full items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-50">
        {loading ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Confirming...</> : "Deposit USDC"}
      </button>
    </form>
  );
}

// ============================================================
// Withdraw Form
// ============================================================
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
      // Protocol fee — covers Squads multisig tx costs
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
      <p className="mb-4 font-mono text-[10px] text-muted-foreground">
        Burn {vault.receiptToken} · Balance: {balance > 0 ? `$${balance.toFixed(2)}` : "$0.00"}
      </p>
      <AmountInput value={amount} onChange={setAmount} token={vault.receiptToken} onMax={() => setAmount(balance.toString())} />
      {amount && parseFloat(amount) > 0 && (
        <div className="mb-4 space-y-1">
          <Row label="You receive" value={`~${parseFloat(amount).toFixed(2)} USDC`} />
          <Row label="Network fee" value={`${PROTOCOL_FEE_SOL} SOL`} />
        </div>
      )}
      {error && <p className="mb-3 font-mono text-[10px] text-error">{error}</p>}
      <button type="submit" disabled={loading || !amount || parseFloat(amount) <= 0 || balance <= 0} className="btn-glass flex w-full items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-50">
        {loading ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Burning...</> : "Withdraw USDC"}
      </button>
    </form>
  );
}

// ============================================================
// Shared UI atoms
// ============================================================
function AmountInput({ value, onChange, token, onMax }: { value: string; onChange: (v: string) => void; token: string; onMax?: () => void }) {
  return (
    <div className="mb-4 flex items-center gap-2 overflow-hidden border border-white/[0.06] bg-white/[0.02] px-3 py-2.5 focus-within:border-gold-500/20 sm:px-4 sm:py-3">
      <input
        type="number"
        placeholder="0.00"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="min-w-0 flex-1 bg-transparent font-mono text-base text-foreground outline-none placeholder:text-muted-foreground/70 sm:text-lg"
        step="0.01"
        min="0"
      />
      {onMax && (
        <button type="button" onClick={onMax} className="shrink-0 font-mono text-[8px] uppercase text-gold-400 hover:text-gold-300">MAX</button>
      )}
      <span className="shrink-0 font-mono text-[9px] text-muted-foreground">{token}</span>
    </div>
  );
}

function Row({ label, value, gold }: { label: string; value: string; gold?: boolean }) {
  return (
    <div className="flex justify-between font-mono text-[11px]">
      <span className="text-muted-foreground">{label}</span>
      <span className={gold ? "text-gold-400" : "text-foreground"}>{value}</span>
    </div>
  );
}

function TxSuccess({ sig, label, sub, onReset }: { sig: string; label: string; sub?: string; onReset: () => void }) {
  return (
    <div>
      <div className="mb-3 flex items-center gap-2 text-success">
        <Check className="h-4 w-4" />
        <span className="font-mono text-[12px]">{label}</span>
      </div>
      {sub && <p className="mb-3 text-[11px] text-muted-foreground">{sub}</p>}
      <a href={getTxUrl(sig)} target="_blank" rel="noopener noreferrer" className="mb-4 flex items-center gap-1 text-[11px] text-gold-400 hover:text-gold-300">
        View on Solscan <ExternalLink className="h-3 w-3" />
      </a>
      <button onClick={onReset} className="font-mono text-[10px] text-muted-foreground hover:text-muted-foreground">
        Continue
      </button>
    </div>
  );
}
