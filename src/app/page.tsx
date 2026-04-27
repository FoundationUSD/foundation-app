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
import { formatAPY, formatUsdCompact } from "@/lib/utils";
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
  oro: "/partners/oro.png",
  awy: "/assets/awy.png",
};

/**
 * Classical art piece paired with each vault. The art lives behind the card
 * header as a heavily-treated atmospheric layer (see .art-thumb in globals.css).
 *   Solomon → Hermes (god of trade)
 *   Kamino  → Athenian pediment fragment (institutional credit / civic)
 *   Oro     → Plutus / coin hoard (gold)
 *   AWY     → Demeter (harvest, the four-leg basket)
 */
const PROTOCOL_ART: Record<string, string> = {
  solomon: "/assets/art/HermesForSolomon.png",
  kamino: "/assets/art/athenian_pediment_fragment.png",
  oro: "/assets/art/coinhoardForOro.png",
  awy: "/assets/art/GoddessDemeterforAWY.png",
};

const USDC_MINT_PK = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");

export default function HomePage() {
  const { strategies, loading } = useStrategies();
  const wallet = useWallet();
  const [walletModalOpen, setWalletModalOpen] = useState(false);
  const [selectedVault, setSelectedVault] = useState<FoundationVault | null>(null);
  const [activeFilter, setActiveFilter] = useState<"all" | "foundation" | "partner">("all");

  // Filter by category. Foundation = AWY (Foundation-composed basket); Partner =
  // pass-through partner integrations (Solomon, Kamino, Oro). "All" shows everything.
  const visibleStrategies =
    activeFilter === "all" ? strategies : strategies.filter((v) => v.category === activeFilter);
  const activeStrategies = visibleStrategies.filter((v) => v.status === "live");
  const comingSoonStrategies = visibleStrategies.filter((v) => v.status === "coming_soon");

  // Not connected — landing
  if (!wallet.connected) {
    const bestApy = strategies.length > 0 ? Math.max(...strategies.map((s) => s.apy)) : 0;

    return (
      <div className="fdn-page">
        {/* Hero — caryatid colonnade backdrop, gold hairline frame */}
        <div className="art-frame relative animate-fade-up mb-16 overflow-hidden rounded-2xl sm:mb-24">
          <div
            className="art-layer art-hero"
            style={{ backgroundImage: "url('/assets/art/caryatid_colonnade.png')" }}
          />
          <div className="art-noise" />
          <div className="art-content relative px-6 py-20 text-center sm:py-28">
            <div className="mx-auto mb-6 h-10 w-10 animate-float opacity-60 sm:mb-8 sm:h-12 sm:w-12">
              <Image src="/partners/rounded-nobg.png" alt="Foundation" width={48} height={48} />
            </div>
            <h1 className="page-heading mb-4 text-2xl sm:mb-5 sm:text-[3.2rem]">
              Managed RWA Yield
              <br />
              <em>on Solana</em>
            </h1>
            <p className="mx-auto mb-8 max-w-lg text-sm leading-relaxed text-[var(--text-accent)] sm:mb-10 sm:text-[15px]">
              Deposit USDC and Foundation routes it into curated real-world asset
              strategies on Solana. Custody runs through Squads multisig. Withdrawals
              are open at any time.
            </p>
            <button onClick={() => setWalletModalOpen(true)} className="btn-primary inline-flex items-center gap-2">
              Connect Wallet <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Flagship — All-Weather Yield */}
        <div className="mb-14 sm:mb-20">
          <div className="mb-4 flex items-baseline justify-between">
            <h2 className="section-label">Flagship Strategy</h2>
            <span className="font-mono text-[9px] uppercase tracking-[0.25em] text-emerald-500">Live</span>
          </div>
          <AwyHighlight onSelect={() => setWalletModalOpen(true)} />
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
      {/* Page header with frieze meander strip */}
      <div className="relative mb-6 overflow-hidden rounded-xl sm:mb-8">
        <div
          className="art-layer art-strip"
          style={{ backgroundImage: "url('/assets/art/strips/Friezemeanderpattern.png')" }}
        />
        <div className="art-content relative flex items-end justify-between gap-4 px-1 py-4 sm:px-2 sm:py-5">
          <div>
            <p className="section-label mb-1 sm:mb-2">
              {selectedVault ? selectedVault.protocol.toUpperCase() : "VAULT INFRASTRUCTURE"}
            </p>
            <h1 className="page-heading text-xl sm:text-2xl">
              {selectedVault ? selectedVault.name : <>Deposit <em>Strategies</em></>}
            </h1>
            {!selectedVault && (
              <p className="mt-1 max-w-xl text-sm text-[var(--text-accent)]">
                Institutional-grade yield vaults. Deposit USDC to access curated
                real-world asset strategies, custodied on chain through Squads
                multisig.
              </p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-3">
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
      </div>

      {selectedVault ? (
        <VaultDetail vault={selectedVault} onBack={() => setSelectedVault(null)} />
      ) : (
        <>
          {/* Flagship — All-Weather Yield */}
          {(() => {
            const awyVault = strategies.find((s) => s.protocol === "awy");
            if (!awyVault) return null;
            return (
              <section className="mb-10">
                <div className="mb-4 flex items-baseline justify-between">
                  <h2 className="section-label">Flagship Strategy</h2>
                  <span className="font-mono text-[9px] uppercase tracking-[0.25em] text-emerald-500">Live</span>
                </div>
                <AwyHighlight onSelect={() => setSelectedVault(awyVault)} />
              </section>
            );
          })()}

          {/* Source Filter — glass pill container */}
          <div className="mb-8 inline-flex items-center gap-1 rounded-xl border border-[var(--rule)] bg-[var(--surface-strong)] p-1 shadow-[inset_0_1px_3px_rgba(0,0,0,0.02)]">
            {(["all", "foundation", "partner"] as const).map((filter) => (
              <button
                key={filter}
                onClick={() => setActiveFilter(filter)}
                className={`cursor-pointer rounded-lg px-4 py-2 text-xs font-semibold transition-all sm:text-sm ${
                  activeFilter === filter
                    ? "bg-[var(--surface)] text-[var(--fg)] shadow-sm ring-1 ring-[var(--rule)]"
                    : "text-[var(--muted)] hover:text-[var(--fg)] hover:bg-[var(--surface)]/50"
                }`}
              >
                {filter === "all" ? "All Vaults" : filter === "foundation" ? "Foundation" : "Partner"}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="skeleton h-64" />
              ))}
            </div>
          ) : activeStrategies.length === 0 && comingSoonStrategies.length === 0 ? (
            <p className="py-12 text-center font-mono text-sm text-[var(--text-accent)]">No vaults found</p>
          ) : (
            <>
              {activeStrategies.length > 0 && (
                <section className="mb-10">
                  <div className="mb-4 flex items-baseline justify-between">
                    <h2 className="section-label">Active Vaults</h2>
                    <span className="font-mono text-[10px] text-[var(--text-accent)]">
                      {activeStrategies.length} live
                    </span>
                  </div>
                  <div className="stagger-children grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {activeStrategies.map((v) => (
                      <VaultCard key={v.id} vault={v} onSelect={() => setSelectedVault(v)} />
                    ))}
                  </div>
                </section>
              )}

              {comingSoonStrategies.length > 0 && (
                <section>
                  <div className="mb-4 flex items-baseline justify-between">
                    <h2 className="section-label">Coming Soon</h2>
                    <span className="font-mono text-[10px] text-[var(--text-accent)]">
                      {comingSoonStrategies.length} queued
                    </span>
                  </div>
                  <div className="stagger-children grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {comingSoonStrategies.map((v) => (
                      <VaultCard key={v.id} vault={v} onSelect={() => setSelectedVault(v)} />
                    ))}
                  </div>
                </section>
              )}
            </>
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
  const isLive = vault.status === "live";

  return (
    <div
      onClick={isLive ? onSelect : undefined}
      className={`strategy-card overflow-hidden border border-[var(--rule)] bg-[var(--surface-strong)] rounded-xl divide-y divide-[var(--rule)] transition-all ${
        isLive ? "cursor-pointer hover:-translate-y-0.5" : "cursor-not-allowed opacity-70"
      }`}
      data-glow
    >
      {/* Header — classical art behind the protocol logo + vault name */}
      <div className="relative overflow-hidden">
        {PROTOCOL_ART[vault.protocol] && (
          <>
            <div
              className="art-layer art-thumb"
              style={{ backgroundImage: `url('${PROTOCOL_ART[vault.protocol]}')` }}
            />
            <div className="art-noise" />
          </>
        )}
        <div className="art-content relative flex items-center gap-3 px-5 py-4">
          {logo ? (
            <Image src={logo} alt={vault.protocol} width={36} height={36} className="h-9 w-9 flex-shrink-0 object-contain" />
          ) : (
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-600 text-[9px] font-bold text-white">
              {vault.receiptToken.slice(0,4).toUpperCase()}
            </div>
          )}
          <span className="truncate font-mono text-xl font-bold tracking-[-0.02em] text-[var(--fg)]">
            {vault.name}
          </span>
          {!isLive && (
            <span className="ml-auto rounded-full border border-[var(--rule)] bg-[var(--surface)] px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider text-gold-500">
              Soon
            </span>
          )}
        </div>
      </div>

      {/* Description */}
      <div className="px-5 py-4">
        <p className="line-clamp-2 text-sm text-[var(--muted)] leading-relaxed">
          {vault.description}
        </p>
      </div>

      {/* Data Grid */}
      <div className="divide-y divide-[var(--rule)]">
        {/* Row 1: APY + TVL */}
        <div className="grid grid-cols-2 divide-x divide-[var(--rule)]">
          <div className="flex flex-col items-start px-5 py-4">
            <span className="section-label mb-1.5 font-mono text-[10px] font-semibold tracking-[0.15em] text-[var(--gold)]">TARGET APY</span>
            <span className="font-mono text-3xl font-bold tracking-[-0.03em] text-emerald-500">
              {formatAPY(vault.apy)}
            </span>
          </div>
          <div className="flex flex-col items-start px-5 py-4">
            <span className="section-label mb-1.5 font-mono text-[10px] font-semibold tracking-[0.15em] text-[var(--gold)]">TVL</span>
            <span className="font-mono text-[1.4rem] font-bold tracking-wide text-[#334155] dark:text-[var(--fg)]">
              {formatUsdCompact(vault.tvlUsd)}
            </span>
          </div>
        </div>

        {/* Row 2: Curator + Type */}
        <div className="grid grid-cols-2 divide-x divide-[var(--rule)]">
          <div className="flex flex-col items-start px-5 py-4">
            <span className="section-label mb-1.5 font-mono text-[10px] font-semibold tracking-[0.15em] text-[var(--gold)]">CURATOR</span>
            <span className="font-mono text-sm font-bold text-[#334155] dark:text-[var(--fg)]">
              {vault.protocol === "solomon" ? "Solomon" : vault.protocol.charAt(0).toUpperCase() + vault.protocol.slice(1)}
            </span>
          </div>
          <div className="flex flex-col items-start px-5 py-4">
            <span className="section-label mb-1.5 font-mono text-[10px] font-semibold tracking-[0.15em] text-[var(--gold)]">TYPE</span>
            <span className="font-mono text-xs font-bold leading-snug tracking-wide text-[#334155] dark:text-[var(--fg)] uppercase line-clamp-2">
              {vault.strategy}
            </span>
          </div>
        </div>
      </div>

      {/* CTA */}
      <div className="flex items-center justify-between px-5 py-4">
        <span className="text-xs font-mono tracking-wide text-[var(--muted)]">USDC</span>
        <span className={`text-xs font-mono font-bold tracking-[0.1em] uppercase transition-colors ${
          isLive ? "text-[#0f172a] dark:text-[var(--fg)]" : "text-[var(--muted)]"
        }`}>
          {isLive ? "View Details →" : "Coming Soon"}
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
              ["APY", formatAPY(vault.apy)],
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
        <h4 className="font-mono text-xs font-medium uppercase tracking-wider text-[var(--primary)]">Vault Actions</h4>
        <div className="aw-toggle">
          {(["deposit", "withdraw"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`aw-tab${tab === t ? " aw-tab-active" : ""}`}
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
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
      tx.recentBlockhash = blockhash;
      tx.feePayer = wallet.publicKey;
      const signed = await wallet.signTransaction(tx);
      const sig = await connection.sendRawTransaction(signed.serialize());
      await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed");

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
        {vault.name} · {formatAPY(vault.apy)} APY
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
      <button type="submit" disabled={loading || !amount || parseFloat(amount) <= 0} className="aw-submit">
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
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
      tx.recentBlockhash = blockhash;
      tx.feePayer = wallet.publicKey;
      const signed = await wallet.signTransaction(tx);
      const sig = await connection.sendRawTransaction(signed.serialize());
      await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed");

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
      <div className="mb-3 flex items-center justify-between">
        <span className="font-mono text-[10px] text-[var(--text-accent)]">
          Burn {vault.receiptToken} · receive USDC
        </span>
        {balance > 0 && (
          <span className="font-mono text-[10px] font-medium text-[var(--fg)] bg-[var(--surface-strong)] border border-[var(--rule)] rounded px-2 py-0.5">
            Bal: {balance.toFixed(2)}
          </span>
        )}
      </div>
      <AmountInput value={amount} onChange={setAmount} token={vault.receiptToken} onMax={() => setAmount(balance.toFixed(2))} />
      {amount && parseFloat(amount) > 0 && (
        <div className="mb-4 space-y-1">
          <Row label="You receive" value={`~${parseFloat(amount).toFixed(2)} USDC`} />
          <Row label="Network fee" value={`${PROTOCOL_FEE_SOL} SOL`} />
        </div>
      )}
      {error && <p className="mb-3 font-mono text-[10px] text-red-500">{error}</p>}
      <button type="submit" disabled={loading || !amount || parseFloat(amount) <= 0 || balance <= 0} className="aw-submit">
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

/* ============================================================
   All-Weather Yield — flagship highlight (live)
   ============================================================ */

interface AwyLegMeta {
  id: string;
  asset: string;
  weightBps: number;
  specApy: number;
  liveApy: number;
  riskDriver: string;
  source: string;
}

interface AwyMeta {
  composition: AwyLegMeta[];
  blendedBaseApy: number;
  specBlendedApy: number;
  fetchedAt: number;
}

const AWY_LEGS_FALLBACK: Array<{ pct: string; asset: string; source: string; apy: string }> = [
  { pct: "35%", asset: "ONyc",       source: "Reinsurance premiums",        apy: "11.0%" },
  { pct: "30%", asset: "PRIME",      source: "Tokenized HELOCs",            apy: "7.5%"  },
  { pct: "25%", asset: "syrupUSDC",  source: "Overcollateralized lending",  apy: "6.5%"  },
  { pct: "10%", asset: "USDY",       source: "Short-term US Treasuries",    apy: "3.7%"  },
];

const AWY_LEG_DESCRIPTIONS: Record<string, string> = {
  onyc: "Reinsurance premiums",
  prime: "Tokenized HELOCs",
  "syrup-usdc": "Overcollateralized lending",
  usdy: "Short-term US Treasuries",
};

function AwyHighlight({ onSelect }: { onSelect?: () => void }) {
  const { strategies } = useStrategies();
  const awy = strategies.find((s) => s.protocol === "awy");
  const meta = awy?.meta as AwyMeta | undefined;

  const legs = meta?.composition?.length
    ? meta.composition.map((leg) => ({
        pct: `${leg.weightBps / 100}%`,
        asset: leg.asset,
        source: AWY_LEG_DESCRIPTIONS[leg.id] ?? leg.riskDriver,
        apy: `${leg.liveApy.toFixed(1)}%`,
      }))
    : AWY_LEGS_FALLBACK;

  // Prefer live blended APY → spec blended (still from API) → strategies-row apy.
  // No hardcoded fallback — if all are missing we render an em-dash instead.
  const blendedApy = meta?.blendedBaseApy ?? meta?.specBlendedApy ?? awy?.apy;

  return (
    <div
      onClick={onSelect}
      className="art-frame infra-card group relative block cursor-pointer overflow-hidden p-6 transition-all hover:border-[var(--navy)]/40 hover:shadow-md sm:p-8"
    >
      {/* Background art: Storm of the Four Winds — matches AWY thesis */}
      <div
        className="art-layer art-thumb"
        style={{ backgroundImage: "url('/assets/art/StormoftheFourWinds.png')" }}
      />
      <div className="art-noise" />

      <div className="art-content">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-5 border-b border-[var(--rule)] pb-6 sm:flex-row sm:items-start sm:justify-between sm:gap-8">
        <div className="max-w-xl">
          <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-gold-500">
            All-Weather Yield · AWY
          </p>
          <h3 className="page-heading mb-3 text-xl sm:text-[1.75rem]">
            Four yield engines. <em>One deposit.</em>
          </h3>
          <p className="text-[13px] leading-relaxed text-[var(--text-accent)] sm:text-sm">
            A blended real-world asset basket built so that no single macro regime
            compresses every leg at once. Rate cycles, crypto drawdowns, credit
            events, and catastrophe seasons each pressure a different driver.
          </p>
        </div>
        <div className="flex shrink-0 flex-row gap-8 sm:flex-col sm:items-end sm:gap-1 sm:text-right">
          <div>
            <p className="mb-1 font-mono text-[9px] uppercase tracking-[0.2em] text-gold-500">
              Blended Base APY
            </p>
            <span className="font-mono text-3xl font-bold tracking-[-0.03em] text-emerald-500 sm:text-[2.5rem]">
              {blendedApy != null ? `~${blendedApy.toFixed(2)}%` : "…"}
            </span>
          </div>
          <div className="sm:mt-2">
            <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.2em] text-emerald-600">
              Live
            </span>
          </div>
        </div>
      </div>

      {/* Composition */}
      <div className="grid grid-cols-1 divide-y divide-[var(--rule)] sm:grid-cols-2 sm:divide-y-0 md:grid-cols-4 md:divide-x">
        {legs.map((leg, i) => (
          <div
            key={leg.asset}
            className={`px-0 py-4 sm:px-5 ${i === 1 ? "sm:border-l sm:border-[var(--rule)] md:border-0" : ""} ${
              i >= 2 ? "sm:border-t sm:border-[var(--rule)] md:border-0" : ""
            }`}
          >
            <div className="mb-2 flex items-baseline justify-between">
              <span className="font-mono text-sm font-bold tracking-tight text-[var(--fg)]">
                {leg.asset}
              </span>
              <span className="font-mono text-[10px] tracking-wider text-gold-500">
                {leg.pct}
              </span>
            </div>
            <p className="mb-2 text-[11px] leading-snug text-[var(--text-accent)]">
              {leg.source}
            </p>
            <span className="font-mono text-[11px] font-medium text-emerald-500">
              {leg.apy} base
            </span>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="mt-6 flex flex-col gap-3 border-t border-[var(--rule)] pt-5 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[11px] leading-relaxed text-[var(--text-accent)]">
          Four independent risk drivers: actuarial events, US rate cycle, crypto borrowing demand, and Fed funds.
        </p>
        <span className="inline-flex items-center gap-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--navy)] transition-colors group-hover:text-emerald-600">
          Deposit <ArrowUpRight className="h-3 w-3" />
        </span>
      </div>
      </div>
    </div>
  );
}
