"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { useWallet } from "@solana/wallet-adapter-react";
import { useConnection } from "@solana/wallet-adapter-react";
import { PublicKey, Transaction } from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  createTransferInstruction,
  createBurnInstruction,
  getAccount,
} from "@solana/spl-token";
import { ArrowLeft, Loader2, Check, ExternalLink, Wallet, Shield } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { WalletModal } from "@/components/WalletModal";

const PROTOCOL_LOGO: Record<string, string> = {
  solomon: "/partners/solomon-circle.png",
  kamino: "/partners/kamino.png",
  drift: "/partners/drift.png",
  oro: "/partners/oro.png",
};
import { formatAPY } from "@/lib/utils";
import { getTxUrl } from "@/lib/constants";
import type { FoundationVault } from "@/lib/vaults";

const USDC_MINT_PK = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");

const RISK_CONFIG = {
  conservative: { color: "text-emerald-400", bg: "bg-emerald-500/10", label: "Conservative" },
  moderate: { color: "text-blue-400", bg: "bg-blue-500/10", label: "Moderate" },
  growth: { color: "text-amber-400", bg: "bg-amber-500/10", label: "Growth" },
};


export default function StrategyPage() {
  const params = useParams();
  const strategyId = params.id as string;
  const wallet = useWallet();
  const [walletModalOpen, setWalletModalOpen] = useState(false);
  const [vault, setVault] = useState<FoundationVault | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/strategies");
        const json = await res.json();
        if (json.success) {
          setVault(json.data.find((s: FoundationVault) => s.id === strategyId) || null);
        }
      } catch {
        // silently fail
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [strategyId]);

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl px-6 py-12">
        <div className="skeleton mb-8 h-8 w-32 rounded-sm" />
        <div className="skeleton h-64 rounded-sm" />
      </div>
    );
  }

  if (!vault) {
    return (
      <div className="mx-auto max-w-4xl px-6 py-24 text-center">
        <p className="text-muted-foreground">Vault not found</p>
        <Link href="/" className="mt-4 inline-block font-mono text-xs text-gold-400">
          ← Back
        </Link>
      </div>
    );
  }

  const risk = RISK_CONFIG[vault.riskTier];

  return (
    <div className="mx-auto max-w-4xl px-6 py-12">
      <Link
        href="/"
        className="mb-8 inline-flex items-center gap-2 font-mono text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to Vaults
      </Link>

      {/* Header */}
      <div className="mb-8">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {PROTOCOL_LOGO[vault.protocol] && (
            <Image
              src={PROTOCOL_LOGO[vault.protocol]}
              alt={vault.protocol}
              width={24}
              height={24}
              className="rounded-sm"
            />
          )}
          <span className={`${risk.bg} ${risk.color} rounded-sm px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.1em]`}>
            {risk.label}
          </span>
          {vault.status === "live" ? (
            <span className="rounded-sm bg-success/10 px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.1em] text-success">
              Live
            </span>
          ) : (
            <span className="rounded-sm bg-white/[0.04] px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground">
              Coming Soon
            </span>
          )}
        </div>
        <h1 className="mb-1 font-serif text-3xl font-light text-foreground">{vault.name}</h1>
        <p className="mb-1 font-mono text-xs text-muted-foreground">{vault.receiptToken}</p>
        <p className="text-sm text-muted-foreground">{vault.description}</p>
      </div>

      <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
        {/* Left */}
        <div className="space-y-6">
          {/* Stats */}
          <div className="border border-white/[0.06] p-6">
            <h3 className="section-label mb-4">Vault Details</h3>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Current APY</span>
                <span className="text-gradient-gold font-mono text-sm font-medium">
                  {vault.apy > 0 ? formatAPY(vault.apy) : "--"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Strategy</span>
                <span className="font-mono text-sm text-foreground">{vault.strategy}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Underlying</span>
                <span className="font-mono text-sm text-foreground">{vault.underlying}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Deposit Asset</span>
                <span className="font-mono text-sm text-foreground">USDC</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Receipt Token</span>
                <span className="font-mono text-sm text-foreground">{vault.receiptToken} (Token-2022)</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Vault Custody</span>
                <span className="font-mono text-sm text-foreground">Squads Multisig</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Risk Tier</span>
                <span className={`font-mono text-sm ${risk.color}`}>{risk.label}</span>
              </div>
            </div>
          </div>

          {/* Features */}
          <div className="border border-white/[0.06] p-6">
            <h3 className="section-label mb-4">Features</h3>
            <div className="flex flex-wrap gap-2">
              {vault.features.map((f) => (
                <span
                  key={f}
                  className="flex items-center gap-1.5 border border-white/[0.06] px-3 py-1 font-mono text-[10px] text-foreground"
                >
                  <Shield className="h-3 w-3 text-gold-400" />
                  {f}
                </span>
              ))}
            </div>
          </div>

          {/* How it works */}
          <div className="border border-white/[0.06] p-6">
            <h3 className="section-label mb-4">How It Works</h3>
            <div className="space-y-3 text-sm text-muted-foreground">
              {vault.howItWorks.map((step, i) => (
                <div key={i} className="flex gap-3">
                  <span className="font-mono text-gold-400">{i + 1}.</span>
                  <p>{step}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right: Deposit */}
        <div>
          {vault.status === "coming_soon" ? (
            <div className="border border-white/[0.06] p-6 text-center">
              <p className="mb-2 font-serif text-lg text-foreground">Coming Soon</p>
              <p className="text-xs text-muted-foreground">
                This vault is deployed on-chain and ready. Deposits will be enabled shortly.
              </p>
            </div>
          ) : !wallet.connected ? (
            <div className="border border-white/[0.06] p-6 text-center">
              <Wallet className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
              <p className="mb-4 text-sm text-muted">Connect wallet to deposit</p>
              <button onClick={() => setWalletModalOpen(true)} className="btn-primary w-full">
                Connect Wallet
              </button>
            </div>
          ) : (
            <VaultActions vault={vault} />
          )}
        </div>
      </div>

      <WalletModal open={walletModalOpen} onClose={() => setWalletModalOpen(false)} />
    </div>
  );
}

function DepositForm({ vault }: { vault: FoundationVault }) {
  const { connection } = useConnection();
  const wallet = useWallet();
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
      const amountLamports = Math.floor(num * 1_000_000); // USDC 6 decimals

      // User's USDC ATA → This vault's USDC ATA
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

      const tx = new Transaction().add(transferIx);
      const { blockhash } = await connection.getLatestBlockhash();
      tx.recentBlockhash = blockhash;
      tx.feePayer = wallet.publicKey;

      const signed = await wallet.signTransaction(tx);
      const sig = await connection.sendRawTransaction(signed.serialize());
      await connection.confirmTransaction(sig, "confirmed");

      // Notify backend to mint receipt token (server reads exact amount from tx)
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
        // USDC was sent but mint failed — show error with tx link so user can contact support
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
      <div className="border border-white/[0.06] p-6">
        <div className="mb-4 flex items-center gap-2 text-success">
          <Check className="h-5 w-5" />
          <span className="font-mono text-sm">Deposit Successful</span>
        </div>
        <p className="mb-3 text-xs text-muted-foreground">
          Your USDC has been deposited. {vault.receiptToken} tokens will be minted to your wallet.
        </p>
        <a
          href={getTxUrl(txSignature)}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-gold-400 hover:text-gold-300"
        >
          <span className="font-mono text-xs">View on Solscan</span>
          <ExternalLink className="h-3 w-3" />
        </a>
        <button
          onClick={() => setTxSignature(null)}
          className="mt-4 w-full font-mono text-xs text-muted-foreground hover:text-foreground"
        >
          Deposit again
        </button>
      </div>
    );
  }

  return (
    <div className="border border-white/[0.06] p-6">
      <h4 className="mb-1 font-mono text-xs font-medium uppercase tracking-wider text-foreground">
        Deposit USDC
      </h4>
      <p className="mb-4 font-mono text-[10px] text-muted-foreground">
        {vault.name} · {vault.apy > 0 ? formatAPY(vault.apy) : "--"} APY
      </p>

      <form onSubmit={handleDeposit}>
        <div className="mb-4">
          <div className="flex items-center gap-2 overflow-hidden border border-white/[0.08] bg-white/[0.03] px-4 py-3 focus-within:border-gold-500/30">
            <input
              type="number"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="min-w-0 flex-1 bg-transparent font-mono text-lg text-foreground outline-none placeholder:text-muted-foreground/50"
              step="0.01"
              min="0"
            />
            <span className="shrink-0 font-mono text-[9px] text-muted-foreground/60">USDC</span>
          </div>
        </div>

        {amount && parseFloat(amount) > 0 && (
          <div className="mb-4 space-y-1.5">
            <div className="flex justify-between font-mono text-xs">
              <span className="text-muted-foreground">You receive</span>
              <span className="text-foreground">{vault.receiptToken}</span>
            </div>
            <div className="flex justify-between font-mono text-xs">
              <span className="text-muted-foreground">Est. yearly yield</span>
              <span className="text-gold-400">
                {vault.apy > 0
                  ? `~$${(parseFloat(amount) * vault.apy / 100).toFixed(2)}`
                  : "--"}
              </span>
            </div>
            <div className="flex justify-between font-mono text-xs">
              <span className="text-muted-foreground">Vault custody</span>
              <span className="text-foreground">Squads Multisig</span>
            </div>
          </div>
        )}

        {error && <p className="mb-3 font-mono text-xs text-error">{error}</p>}

        <button
          type="submit"
          disabled={loading || !amount || parseFloat(amount) <= 0}
          className="btn-primary flex w-full items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Confirming...
            </>
          ) : (
            "Deposit USDC"
          )}
        </button>
      </form>
    </div>
  );
}

function VaultActions({ vault }: { vault: FoundationVault }) {
  const [tab, setTab] = useState<"deposit" | "withdraw">("deposit");

  return (
    <div className="space-y-4">
      <div className="flex gap-2 border-b border-white/[0.06] pb-2">
        <button
          onClick={() => setTab("deposit")}
          className={`px-4 py-2 font-mono text-xs transition-colors ${
            tab === "deposit" ? "text-gold-400 border-b-2 border-gold-400" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Deposit
        </button>
        <button
          onClick={() => setTab("withdraw")}
          className={`px-4 py-2 font-mono text-xs transition-colors ${
            tab === "withdraw" ? "text-gold-400 border-b-2 border-gold-400" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Withdraw
        </button>
      </div>

      {tab === "deposit" ? (
        <DepositForm vault={vault} />
      ) : (
        <WithdrawForm vault={vault} />
      )}
    </div>
  );
}

function WithdrawForm({ vault }: { vault: FoundationVault }) {
  const { connection } = useConnection();
  const wallet = useWallet();
  const [amount, setAmount] = useState("");
  const [balance, setBalance] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [txSignature, setTxSignature] = useState<string | null>(null);

  // Fetch actual withdrawable amount from Supabase (net deposits - withdrawals)
  useEffect(() => {
    if (!wallet.publicKey) return;
    (async () => {
      try {
        const res = await fetch(`/api/user/portfolio?wallet=${wallet.publicKey!.toBase58()}`);
        const json = await res.json();
        if (json.success) {
          const pos = json.data.find((p: { vaultId: string }) => p.vaultId === vault.id);
          setBalance(pos ? pos.depositedUsdc : 0);
        }
      } catch {
        setBalance(0);
      }
    })();
  }, [wallet.publicKey, vault.id]);

  const handleWithdraw = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!wallet.publicKey || !wallet.signTransaction) return;

    const num = parseFloat(amount);
    if (isNaN(num) || num <= 0 || num > balance) {
      setError(num > balance ? "Insufficient balance" : "Enter a valid amount");
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

      // User burns their receipt tokens
      const burnIx = createBurnInstruction(
        userAta,
        mintPk,
        wallet.publicKey,
        amountLamports,
        [],
        TOKEN_2022_PROGRAM_ID,
      );

      const tx = new Transaction().add(burnIx);
      const { blockhash } = await connection.getLatestBlockhash();
      tx.recentBlockhash = blockhash;
      tx.feePayer = wallet.publicKey;

      const signed = await wallet.signTransaction(tx);
      const sig = await connection.sendRawTransaction(signed.serialize());
      await connection.confirmTransaction(sig, "confirmed");

      // Notify backend to send USDC back
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
      setBalance((prev) => prev - num);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Withdrawal failed");
    } finally {
      setLoading(false);
    }
  };

  if (txSignature) {
    return (
      <div className="border border-white/[0.06] p-6">
        <div className="mb-4 flex items-center gap-2 text-success">
          <Check className="h-5 w-5" />
          <span className="font-mono text-sm">Withdrawal Successful</span>
        </div>
        <p className="mb-3 text-xs text-muted-foreground">
          Your {vault.receiptToken} tokens were burned. USDC will be sent to your wallet.
        </p>
        <a
          href={getTxUrl(txSignature)}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-gold-400 hover:text-gold-300"
        >
          <span className="font-mono text-xs">View on Solscan</span>
          <ExternalLink className="h-3 w-3" />
        </a>
        <button
          onClick={() => setTxSignature(null)}
          className="mt-4 w-full font-mono text-xs text-muted-foreground hover:text-foreground"
        >
          Withdraw again
        </button>
      </div>
    );
  }

  return (
    <div className="border border-white/[0.06] p-6">
      <h4 className="mb-1 font-mono text-xs font-medium uppercase tracking-wider text-foreground">
        Withdraw USDC
      </h4>
      <p className="mb-4 font-mono text-[10px] text-muted-foreground">
        Burn {vault.receiptToken} to receive USDC back
        {balance > 0 && (
          <span className="ml-2 text-foreground">
            Balance: {balance.toFixed(2)} {vault.receiptToken}
          </span>
        )}
      </p>

      <form onSubmit={handleWithdraw}>
        <div className="mb-4">
          <div className="flex items-center gap-2 overflow-hidden border border-white/[0.08] bg-white/[0.03] px-4 py-3 focus-within:border-gold-500/30">
            <input
              type="number"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="min-w-0 flex-1 bg-transparent font-mono text-lg text-foreground outline-none placeholder:text-muted-foreground/50"
              step="0.01"
              min="0"
            />
            <button
              type="button"
              onClick={() => setAmount(balance.toString())}
              className="shrink-0 font-mono text-[9px] uppercase text-gold-400 hover:text-gold-300"
            >
              MAX
            </button>
            <span className="shrink-0 font-mono text-[9px] text-muted-foreground/60">{vault.receiptToken}</span>
          </div>
        </div>

        {amount && parseFloat(amount) > 0 && (
          <div className="mb-4 flex justify-between font-mono text-xs">
            <span className="text-muted-foreground">You receive</span>
            <span className="text-foreground">~{parseFloat(amount).toFixed(2)} USDC</span>
          </div>
        )}

        {error && <p className="mb-3 font-mono text-xs text-error">{error}</p>}

        <button
          type="submit"
          disabled={loading || !amount || parseFloat(amount) <= 0 || balance <= 0}
          className="btn-glass flex w-full items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Burning...
            </>
          ) : (
            "Withdraw USDC"
          )}
        </button>
      </form>
    </div>
  );
}
