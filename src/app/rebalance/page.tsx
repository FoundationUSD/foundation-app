"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { ArrowLeftRight, ChevronDown, ArrowRight, Loader2, Check, ExternalLink, AlertTriangle } from "lucide-react";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  createTransferInstruction,
  createBurnInstruction,
} from "@solana/spl-token";
import { WalletModal } from "@/components/WalletModal";
import { FOUNDATION_VAULTS, type FoundationVault } from "@/lib/vaults";
import { getTxUrl, PROTOCOL_FEE_SOL, VAULT_AUTHORITY_PUBKEY } from "@/lib/constants";

const USDC_MINT_PK = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");

const VAULT_ICONS: Record<string, string> = {
  solomon: "/partners/solomon-circle.png",
  kamino: "/partners/kamino.png",
  drift: "/partners/drift.png",
  oro: "/partners/oro.png",
};

const LIVE_VAULTS = FOUNDATION_VAULTS.filter((v) => v.status === "live");

type Step = "idle" | "withdraw" | "deposit" | "done" | "error";

function VaultSelector({
  label,
  selected,
  onChange,
  exclude,
}: {
  label: string;
  selected: FoundationVault | null;
  onChange: (v: FoundationVault) => void;
  exclude?: FoundationVault | null;
}) {
  const [open, setOpen] = useState(false);
  const options = LIVE_VAULTS.filter((v) => v.id !== exclude?.id);

  return (
    <div className="relative">
      <p className="mb-2 font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--muted)]">{label}</p>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 rounded-lg border border-[var(--rule)] bg-[var(--surface)] px-4 py-3.5 text-left transition-all hover:border-[var(--border-hover)] hover:bg-[var(--surface-strong)]"
      >
        {selected ? (
          <div className="flex items-center gap-3">
            <Image src={VAULT_ICONS[selected.protocol]} alt={selected.protocol} width={36} height={36} className="h-9 w-9 rounded-full" />
            <div>
              <p className="text-sm font-medium text-[var(--fg)]">{selected.name}</p>
              <p className="font-mono text-[10px] text-[var(--muted)]">{selected.receiptToken} · {selected.apy}% APY</p>
            </div>
          </div>
        ) : (
          <span className="text-sm text-[var(--muted)]">Select strategy…</span>
        )}
        <ChevronDown className={`h-4 w-4 text-[var(--muted)] transition-transform flex-shrink-0 ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-lg border border-[var(--rule)] bg-[var(--surface-strong)] shadow-xl backdrop-blur-xl">
          {options.map((v) => (
            <button
              key={v.id}
              onClick={() => { onChange(v); setOpen(false); }}
              className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--surface)]"
            >
              <Image src={VAULT_ICONS[v.protocol]} alt={v.protocol} width={32} height={32} className="h-8 w-8 rounded-full" />
              <div>
                <p className="text-sm font-medium text-[var(--fg)]">{v.name}</p>
                <p className="font-mono text-[10px] text-[var(--muted)]">{v.receiptToken} · {v.apy}% APY</p>
              </div>
              <span className="ml-auto font-mono text-[10px] text-[var(--muted)]">{v.riskTier}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function RebalancePage() {
  const wallet = useWallet();
  const { connection } = useConnection();
  const [walletModalOpen, setWalletModalOpen] = useState(false);
  const [from, setFrom] = useState<FoundationVault | null>(LIVE_VAULTS[0] ?? null);
  const [to, setTo] = useState<FoundationVault | null>(LIVE_VAULTS[1] ?? null);
  const [amount, setAmount] = useState("");
  const [step, setStep] = useState<Step>("idle");
  const [error, setError] = useState<string | null>(null);
  const [withdrawTx, setWithdrawTx] = useState<string | null>(null);
  const [depositTx, setDepositTx] = useState<string | null>(null);
  const [positionBalance, setPositionBalance] = useState<number>(0);

  // Load user's balance in the FROM vault
  useEffect(() => {
    if (!wallet.publicKey || !from) { setPositionBalance(0); return; }
    fetch(`/api/user/portfolio?wallet=${wallet.publicKey.toBase58()}`)
      .then((r) => r.json())
      .then((j) => {
        if (j.success) {
          const pos = j.data.find((p: { vaultId: string; depositedUsdc: number }) => p.vaultId === from.id);
          setPositionBalance(pos ? pos.depositedUsdc : 0);
        }
      })
      .catch(() => setPositionBalance(0));
  }, [wallet.publicKey, from]);

  const swap = () => { const tmp = from; setFrom(to); setTo(tmp); };

  const handleRebalance = async () => {
    if (!wallet.connected) { setWalletModalOpen(true); return; }
    if (!from || !to || !wallet.publicKey || !wallet.signTransaction) return;

    const num = parseFloat(amount);
    if (isNaN(num) || num <= 0) { setError("Enter a valid amount"); return; }
    if (num > positionBalance) { setError("Insufficient balance in source vault"); return; }

    setError(null);
    setWithdrawTx(null);
    setDepositTx(null);

    try {
      // ── Step 1: Burn receipt tokens from source vault ──
      setStep("withdraw");
      const amountLamports = Math.floor(num * 1_000_000);
      const mintPk = new PublicKey(from.mint);
      const userAta = getAssociatedTokenAddressSync(mintPk, wallet.publicKey, false, TOKEN_2022_PROGRAM_ID);

      const burnIx = createBurnInstruction(userAta, mintPk, wallet.publicKey, amountLamports, [], TOKEN_2022_PROGRAM_ID);
      const feeIx1 = SystemProgram.transfer({
        fromPubkey: wallet.publicKey,
        toPubkey: new PublicKey(VAULT_AUTHORITY_PUBKEY),
        lamports: Math.floor(PROTOCOL_FEE_SOL * LAMPORTS_PER_SOL),
      });

      const tx1 = new Transaction().add(burnIx, feeIx1);
      const { blockhash: bh1 } = await connection.getLatestBlockhash();
      tx1.recentBlockhash = bh1;
      tx1.feePayer = wallet.publicKey;

      const signed1 = await wallet.signTransaction(tx1);
      const sig1 = await connection.sendRawTransaction(signed1.serialize());
      await connection.confirmTransaction(sig1, "confirmed");
      setWithdrawTx(sig1);

      // Notify backend about withdrawal
      await fetch("/api/withdraw", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vaultId: from.id, txSignature: sig1, userWallet: wallet.publicKey.toBase58() }),
      });

      // ── Step 2: Deposit USDC to destination vault ──
      setStep("deposit");
      const userUsdcAta = getAssociatedTokenAddressSync(USDC_MINT_PK, wallet.publicKey);
      const vaultUsdcAta = new PublicKey(to.usdcAccount);

      const transferIx = createTransferInstruction(userUsdcAta, vaultUsdcAta, wallet.publicKey, amountLamports, [], TOKEN_PROGRAM_ID);
      const feeIx2 = SystemProgram.transfer({
        fromPubkey: wallet.publicKey,
        toPubkey: new PublicKey(VAULT_AUTHORITY_PUBKEY),
        lamports: Math.floor(PROTOCOL_FEE_SOL * LAMPORTS_PER_SOL),
      });

      const tx2 = new Transaction().add(transferIx, feeIx2);
      const { blockhash: bh2 } = await connection.getLatestBlockhash();
      tx2.recentBlockhash = bh2;
      tx2.feePayer = wallet.publicKey;

      const signed2 = await wallet.signTransaction(tx2);
      const sig2 = await connection.sendRawTransaction(signed2.serialize());
      await connection.confirmTransaction(sig2, "confirmed");
      setDepositTx(sig2);

      // Notify backend to mint destination receipt tokens
      await fetch("/api/deposit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vaultId: to.id, txSignature: sig2, userWallet: wallet.publicKey.toBase58() }),
      });

      setStep("done");
      setAmount("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Rebalance failed");
      setStep("error");
    }
  };

  const isLoading = step === "withdraw" || step === "deposit";
  const ready = wallet.connected && from && to && parseFloat(amount) > 0;

  return (
    <div className="fdn-page mx-auto max-w-5xl">
      {/* Hero */}
      <div className="mb-10 text-center">
        <p className="section-label mx-auto mb-6 block w-fit">Yield Allocation</p>
        <h1 className="page-heading mb-4 text-[clamp(2.2rem,5vw,3.5rem)] leading-[1.08]">
          Portfolio <em>Rebalance</em>
        </h1>
        <p className="mx-auto max-w-md text-sm text-[var(--muted)]">
          Move capital between strategies to optimize your yield allocation across Foundation vaults.
        </p>
      </div>

      <div className="mx-auto max-w-xl">
        {/* Done state */}
        {step === "done" ? (
          <div className="infra-card p-8 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/10">
              <Check className="h-7 w-7 text-emerald-500" />
            </div>
            <h3 className="mb-2 font-serif text-xl font-light text-[var(--fg)]">Rebalance Complete</h3>
            <p className="mb-5 text-sm text-[var(--muted)]">
              Capital moved from <span className="text-[var(--fg)]">{from?.receiptToken}</span> to <span className="text-[var(--fg)]">{to?.receiptToken}</span>
            </p>
            <div className="space-y-2 mb-6">
              {withdrawTx && (
                <a href={getTxUrl(withdrawTx)} target="_blank" rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 font-mono text-[10px] text-[var(--muted)] hover:text-[var(--fg)] transition-colors">
                  <ExternalLink className="h-3 w-3" /> Withdraw tx →
                </a>
              )}
              {depositTx && (
                <a href={getTxUrl(depositTx)} target="_blank" rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 font-mono text-[10px] text-[var(--muted)] hover:text-[var(--fg)] transition-colors">
                  <ExternalLink className="h-3 w-3" /> Deposit tx →
                </a>
              )}
            </div>
            <button onClick={() => { setStep("idle"); setWithdrawTx(null); setDepositTx(null); }} className="btn-primary">
              Rebalance Again
            </button>
          </div>
        ) : (
          <div className="infra-card overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-[var(--rule)] px-6 py-4">
              <div className="flex items-center gap-2">
                <ArrowLeftRight className="h-4 w-4 text-gold-500" />
                <span className="font-mono text-xs uppercase tracking-wider text-[var(--fg)]">Rebalance</span>
              </div>
              {positionBalance > 0 && from && (
                <span className="font-mono text-[10px] text-[var(--muted)]">
                  Balance: {positionBalance.toFixed(2)} {from.receiptToken}
                </span>
              )}
            </div>

            <div className="space-y-3 p-6">
              {/* Progress indicator */}
              {isLoading && (
                <div className="flex items-center gap-3 rounded-lg border border-[var(--rule)] bg-[var(--surface)] px-4 py-3">
                  <Loader2 className="h-4 w-4 animate-spin text-gold-500" />
                  <div>
                    <p className="font-mono text-xs text-[var(--fg)]">
                      {step === "withdraw" ? `Step 1/2 — Burning ${from?.receiptToken}…` : `Step 2/2 — Depositing to ${to?.receiptToken}…`}
                    </p>
                    {step === "deposit" && withdrawTx && (
                      <p className="font-mono text-[10px] text-emerald-500">✓ Withdraw confirmed</p>
                    )}
                  </div>
                </div>
              )}

              <VaultSelector label="From" selected={from} onChange={(v) => { setFrom(v); setStep("idle"); setError(null); }} exclude={to} />

              <div className="flex justify-center">
                <button onClick={swap} disabled={isLoading}
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-[var(--rule)] bg-[var(--surface)] transition-all hover:border-gold-500/40 hover:bg-[var(--surface-strong)] disabled:opacity-40">
                  <ArrowLeftRight className="h-3.5 w-3.5 text-[var(--muted)]" />
                </button>
              </div>

              <VaultSelector label="To" selected={to} onChange={(v) => { setTo(v); setStep("idle"); setError(null); }} exclude={from} />

              {/* Amount */}
              <div className="pt-1">
                <p className="mb-2 font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--muted)]">Amount (USDC)</p>
                <div className="fdn-input-wrap">
                  <input
                    type="number"
                    placeholder="0.00"
                    value={amount}
                    onChange={(e) => { setAmount(e.target.value); setError(null); }}
                    className="fdn-input focus:outline-none focus-visible:outline-none"
                    style={{ outline: "none", boxShadow: "none" }}
                    disabled={isLoading}
                    step="0.01"
                    min="0"
                  />
                  {positionBalance > 0 && (
                    <button type="button" onClick={() => setAmount(positionBalance.toString())}
                      className="font-mono text-[10px] font-medium uppercase tracking-wider text-gold-500 hover:text-gold-400 transition-colors flex-shrink-0">
                      MAX
                    </button>
                  )}
                  <span className="fdn-input-label">USDC</span>
                </div>
              </div>

              {/* Route preview */}
              {from && to && (
                <div className="flex items-center gap-2 rounded-lg border border-[var(--rule)] bg-[var(--surface)] px-4 py-3">
                  <span className="font-mono text-[10px] text-[var(--muted)]">{from.receiptToken}</span>
                  <ArrowRight className="h-3 w-3 text-[var(--muted)]" />
                  <span className="font-mono text-[10px] text-[var(--muted)]">USDC</span>
                  <ArrowRight className="h-3 w-3 text-[var(--muted)]" />
                  <span className="font-mono text-[10px] text-[var(--muted)]">{to.receiptToken}</span>
                  <span className="ml-auto font-mono text-[10px] text-gold-500">2 txns</span>
                </div>
              )}

              {error && (
                <div className="flex items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/5 px-4 py-3">
                  <AlertTriangle className="h-3.5 w-3.5 text-red-500 flex-shrink-0 mt-0.5" />
                  <p className="font-mono text-[11px] text-red-500">{error}</p>
                </div>
              )}

              <button
                onClick={handleRebalance}
                disabled={isLoading || (!wallet.connected ? false : !ready)}
                className={`btn-primary mt-2 w-full flex items-center justify-center gap-2 ${
                  !wallet.connected ? "" : !ready && !isLoading ? "opacity-40 cursor-not-allowed" : ""
                }`}
              >
                {isLoading ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> {step === "withdraw" ? "Withdrawing…" : "Depositing…"}</>
                ) : !wallet.connected ? (
                  "Connect Wallet"
                ) : (
                  "Rebalance Now"
                )}
              </button>
              <p className="text-center font-mono text-[9px] text-[var(--muted)]">Requires 2 wallet signatures</p>
            </div>
          </div>
        )}

        {/* Info row */}
        <div className="mt-4 grid grid-cols-3 gap-3">
          {[
            { label: "Flow", value: "Burn → Deposit" },
            { label: "Fee", value: `${PROTOCOL_FEE_SOL * 2} SOL` },
            { label: "Network", value: "Solana" },
          ].map(({ label, value }) => (
            <div key={label} className="infra-card p-3 text-center">
              <p className="mb-1 font-mono text-[9px] uppercase tracking-[0.15em] text-[var(--muted)]">{label}</p>
              <p className="font-mono text-xs text-[var(--fg)]">{value}</p>
            </div>
          ))}
        </div>
      </div>

      <WalletModal open={walletModalOpen} onClose={() => setWalletModalOpen(false)} />
    </div>
  );
}
