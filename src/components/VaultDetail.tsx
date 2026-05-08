"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { Loader2, Check, ExternalLink } from "lucide-react";
import {
  PublicKey,
  Transaction,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  createTransferInstruction,
  createBurnInstruction,
} from "@solana/spl-token";
import { VaultHistoryChart } from "@/components/VaultHistoryChart";
import { formatAPY } from "@/lib/utils";
import { getTxUrl, PROTOCOL_FEE_SOL, VAULT_AUTHORITY_PUBKEY } from "@/lib/constants";
import type { FoundationVault } from "@/lib/vaults";
import { useGeoGate } from "@/hooks/useGeoGate";

const RISK_CONFIG: Record<string, { label: string }> = {
  conservative: { label: "Conservative" },
  moderate: { label: "Moderate" },
  growth: { label: "Growth" },
};

const PROTOCOL_LOGO: Record<string, string> = {
  solomon: "/partners/solomon-circle.png",
  kamino: "/partners/prime.png",
  oro: "/partners/oro.png",
  awy: "/assets/awy.png",
};

const USDC_MINT_PK = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");

export function VaultDetail({ vault }: { vault: FoundationVault }) {
  const risk = RISK_CONFIG[vault.riskTier];
  const logo = PROTOCOL_LOGO[vault.protocol];
  const [tab, setTab] = useState<"details" | "historical">("details");

  return (
    <div className="animate-fade-up">
      <div className="mb-6 flex items-center gap-3">
        {logo && <Image src={logo} alt={vault.protocol} width={24} height={24} />}
        <span className={`risk-badge ${risk.label.toLowerCase()}`}>{risk.label}</span>
        <span className={`fdn-status-badge ${vault.status === "live" ? "live" : ""}`}>
          {vault.status === "live" ? "Live" : "Coming Soon"}
        </span>
      </div>

      <div className="mb-5 flex w-fit items-center gap-1 rounded-xl border border-[var(--rule)] bg-[var(--surface-strong)] p-1">
        {([
          { key: "details",    label: "Vault Details" },
          { key: "historical", label: "Historical" },
        ] as const).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`rounded-lg px-5 py-2 font-mono text-[11px] uppercase tracking-wider transition-all ${
              tab === t.key
                ? "bg-[var(--navy)] text-white"
                : "text-[var(--text-accent)] hover:text-[var(--fg)]"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          {tab === "details" && (
            <>
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

              <div className="border border-[var(--rule)] p-5 sm:p-6">
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

              <div className="border border-[var(--rule)] p-5 sm:p-6">
                <h3 className="section-label mb-4">Features</h3>
                <div className="flex flex-wrap gap-2">
                  {vault.features.map((f, i) => (
                    <span
                      key={i}
                      className="rounded-md border border-[var(--rule)] bg-[var(--surface-strong)] px-3 py-1.5 font-mono text-[10px] text-[var(--text-page)]"
                    >
                      {f}
                    </span>
                  ))}
                </div>
              </div>
            </>
          )}

          {tab === "historical" && (
            <VaultHistoryChart vaultId={vault.id} currentApy={vault.apy} />
          )}
        </div>

        <div>
          {vault.status === "live" ? (
            <VaultActions vault={vault} />
          ) : (
            <div className="rounded-xl border border-[var(--rule)] bg-[var(--surface)] p-6 text-center">
              <p className="mb-2 font-serif text-base font-light text-[var(--fg)]">Coming Soon</p>
              <p className="text-xs text-[var(--text-accent)]">
                This vault is deployed on-chain and ready. Deposits will be enabled shortly.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function VaultActions({ vault }: { vault: FoundationVault }) {
  const [actionTab, setActionTab] = useState<"deposit" | "withdraw">("deposit");
  return (
    <div className="infra-card overflow-hidden">
      <div className="flex items-center justify-between border-b border-[var(--rule)] px-5 py-4">
        <h4 className="font-mono text-xs font-medium uppercase tracking-wider text-[var(--fg)]">Vault Actions</h4>
        <div className="aw-toggle">
          {(["deposit", "withdraw"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setActionTab(t)}
              className={`aw-tab${actionTab === t ? " aw-tab-active" : ""}`}
            >
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
      </div>
      <div className="p-5 sm:p-6">
        {actionTab === "deposit" ? <DepositForm vault={vault} /> : <WithdrawForm vault={vault} />}
      </div>
    </div>
  );
}

function DepositForm({ vault }: { vault: FoundationVault }) {
  const { connection } = useConnection();
  const wallet = useWallet();
  const geo = useGeoGate();
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [txSig, setTxSig] = useState<string | null>(null);

  // AWY routes a 35% slice through OnRe's permissionless ONyc mint, which is
  // geofenced from US persons per OnRe's Global Access terms. Block the deposit
  // path entirely for restricted jurisdictions; fail-open if the geo lookup
  // returns nothing.
  const geoBlocksAwy = vault.protocol === "awy" && geo.restricted;

  const handleDeposit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!wallet.publicKey || !wallet.signTransaction) return;
    if (geoBlocksAwy) {
      setError("AWY deposits are not available in your jurisdiction (ONyc compliance).");
      return;
    }
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
        {vault.provider} · {vault.assetName} · {formatAPY(vault.apy)} APY
      </p>
      {geoBlocksAwy && (
        <div className="mb-4 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2.5 text-[11px] leading-relaxed text-amber-700 dark:text-amber-400">
          <span className="font-mono uppercase tracking-wider">Restricted</span> — AWY deposits
          are not available in your jurisdiction
          {geo.country ? ` (${geo.country})` : ""}. The basket includes ONyc, whose
          permissionless mint is geofenced from US persons per OnRe&apos;s Global Access terms.
        </div>
      )}
      <AmountInput value={amount} onChange={setAmount} token="USDC" />
      {amount && parseFloat(amount) > 0 && (
        <div className="mb-4 space-y-1">
          <Row label="You receive" value={vault.receiptToken} />
          <Row label="Est. yearly" value={vault.apy > 0 ? `~$${(parseFloat(amount) * vault.apy / 100).toFixed(2)}` : "--"} />
          <Row label="Network fee" value={`${PROTOCOL_FEE_SOL} SOL`} />
        </div>
      )}
      {error && <p className="mb-3 font-mono text-[10px] text-red-500">{error}</p>}
      <button
        type="submit"
        disabled={loading || !amount || parseFloat(amount) <= 0 || geoBlocksAwy}
        className="aw-submit"
      >
        {loading ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Confirming...</> : "Deposit USDC"}
      </button>
    </form>
  );
}

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
      <a href={getTxUrl(sig)} target="_blank" rel="noopener noreferrer" className="mb-4 flex items-center gap-1 font-mono text-[11px] text-gold-500">
        View on Solscan <ExternalLink className="h-3 w-3" />
      </a>
      <button onClick={onReset} className="font-mono text-[10px] text-[var(--text-accent)] hover:text-[var(--fg)]">
        Continue
      </button>
    </div>
  );
}
