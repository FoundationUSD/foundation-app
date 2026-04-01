"use client";

import { useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { ArrowLeft, Wallet, Info, Loader2, Check, ExternalLink, AlertTriangle } from "lucide-react";
import { WalletModal } from "@/components/WalletModal";
import Link from "next/link";
import { useSolomonData, useSolomonBalances, useSolomonStake, useSolomonUnstake } from "@/hooks/useSolomon";
import { getTxUrl } from "@/lib/constants";

export default function SolomonPage() {
  const wallet = useWallet();
  const [walletModalOpen, setWalletModalOpen] = useState(false);
  const { data: protocolData, loading } = useSolomonData();
  const { susdvBalance, usdvBalance, refresh } = useSolomonBalances();
  const [tab, setTab] = useState<"stake" | "unstake">("stake");

  return (
    <div className="mx-auto max-w-4xl px-6 py-12">
      <Link
        href="/"
        className="mb-8 inline-flex items-center gap-2 font-mono text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to Vaults
      </Link>

      <div className="mb-8">
        <span className="mb-2 inline-block rounded bg-emerald-500/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.15em] text-emerald-400">
          Solomon Labs
        </span>
        <h1 className="mb-2 font-serif text-3xl font-light text-foreground">sUSDV Staking</h1>
        <p className="text-sm text-muted-foreground">
          Stake USDv to receive sUSDV — a yield-bearing stablecoin earning ~12.5% APY from basis
          trading on BTC, ETH, and SOL. Direct on-chain staking via Solomon&apos;s program.
        </p>
      </div>

      <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
        {/* Left: Stats + position */}
        <div className="space-y-6">
          {/* Protocol stats */}
          <div className="glass rounded-sm p-6">
            <h3 className="section-label mb-4">Protocol Stats</h3>
            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="skeleton h-6 w-32 rounded" />
                ))}
              </div>
            ) : protocolData ? (
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Estimated APY</span>
                  <span className="text-gradient-gold font-mono text-sm font-medium">
                    {protocolData.estimatedApy}%
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">USDv Supply</span>
                  <span className="font-mono text-sm text-foreground">
                    {protocolData.usdvSupply > 0
                      ? `$${(protocolData.usdvSupply / 1_000_000).toFixed(2)}M`
                      : "--"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">sUSDV Supply</span>
                  <span className="font-mono text-sm text-foreground">
                    {protocolData.susdvSupply > 0
                      ? `$${(protocolData.susdvSupply / 1_000_000).toFixed(2)}M`
                      : "--"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Exchange Rate</span>
                  <span className="font-mono text-sm text-foreground">
                    1 sUSDV = {protocolData.exchangeRate.toFixed(6)} USDv
                  </span>
                </div>
              </div>
            ) : null}
          </div>

          {/* User position */}
          {wallet.connected && (
            <div className="glass rounded-sm p-6">
              <h3 className="section-label mb-4">Your Position</h3>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">sUSDV Balance</span>
                  <span className="font-mono text-sm text-foreground">
                    {susdvBalance > 0 ? susdvBalance.toFixed(4) : "0.00"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">USDv Balance</span>
                  <span className="font-mono text-sm text-foreground">
                    {usdvBalance > 0 ? usdvBalance.toFixed(4) : "0.00"}
                  </span>
                </div>
                {susdvBalance > 0 && protocolData && (
                  <div className="flex justify-between border-t border-white/[0.06] pt-3">
                    <span className="text-sm text-muted-foreground">Est. Value</span>
                    <span className="text-gradient-gold font-mono text-sm font-medium">
                      ${(susdvBalance * protocolData.exchangeRate).toFixed(2)}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* How it works */}
          <div className="glass rounded-sm p-6">
            <h3 className="section-label mb-4">How It Works</h3>
            <div className="space-y-4 text-sm text-muted-foreground">
              <div className="flex gap-3">
                <span className="font-mono text-gold-400">1.</span>
                <p>Get USDv by swapping USDC on Jupiter</p>
              </div>
              <div className="flex gap-3">
                <span className="font-mono text-gold-400">2.</span>
                <p>Stake USDv directly from this page — transaction signs in your wallet</p>
              </div>
              <div className="flex gap-3">
                <span className="font-mono text-gold-400">3.</span>
                <p>sUSDV exchange rate increases over time as yield accrues from basis trading</p>
              </div>
              <div className="flex gap-3">
                <span className="font-mono text-gold-400">4.</span>
                <p>Request unstake to start 7-day cooldown, then claim your USDv</p>
              </div>
            </div>
          </div>
        </div>

        {/* Right: Action panel */}
        <div>
          {!wallet.connected ? (
            <div className="glass rounded-sm p-6 text-center">
              <Wallet className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
              <p className="mb-4 text-sm text-muted">Connect your wallet to stake</p>
              <button onClick={() => setWalletModalOpen(true)} className="btn-primary">
                Connect Wallet
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Get USDv via Jupiter */}
              <div className="glass rounded-sm p-4">
                <p className="mb-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  Need USDv?
                </p>
                <a
                  href="https://jup.ag/swap/USDC-Ex5DaKYMCN6QWFA4n67TmMwsH8MJV68RX6YXTmVM532C"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-glass flex w-full items-center justify-center gap-2 text-center text-xs"
                >
                  Swap USDC → USDv on Jupiter <ExternalLink className="h-3 w-3" />
                </a>
              </div>

              {/* Stake/Unstake */}
              <div className="glass rounded-sm p-6">
                <div className="mb-4 flex gap-2">
                  <button
                    onClick={() => setTab("stake")}
                    className={`rounded-sm px-4 py-2 font-mono text-xs transition-colors ${
                      tab === "stake"
                        ? "bg-gold-500/10 text-gold-400"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Stake
                  </button>
                  <button
                    onClick={() => setTab("unstake")}
                    className={`rounded-sm px-4 py-2 font-mono text-xs transition-colors ${
                      tab === "unstake"
                        ? "bg-gold-500/10 text-gold-400"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Unstake
                  </button>
                </div>

                {tab === "stake" ? (
                  <StakeForm usdvBalance={usdvBalance} onSuccess={refresh} />
                ) : (
                  <UnstakeForm susdvBalance={susdvBalance} onSuccess={refresh} />
                )}
              </div>

              <div className="flex items-start gap-2 rounded-sm bg-amber-500/5 p-3">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
                <p className="font-mono text-[10px] leading-relaxed text-amber-300/80">
                  Unstaking has a 7-day cooldown. USDv uses 9 decimals. This is a direct on-chain
                  transaction with Solomon&apos;s staking program.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      <WalletModal open={walletModalOpen} onClose={() => setWalletModalOpen(false)} />
    </div>
  );
}

function StakeForm({ usdvBalance, onSuccess }: { usdvBalance: number; onSuccess: () => void }) {
  const { stake, loading, error, txSignature } = useSolomonStake();
  const [amount, setAmount] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const num = parseFloat(amount);
    if (isNaN(num) || num <= 0) return;
    const sig = await stake(num);
    if (sig) {
      setAmount("");
      onSuccess();
    }
  };

  if (txSignature) {
    return (
      <div>
        <div className="mb-4 flex items-center gap-2 text-success">
          <Check className="h-5 w-5" />
          <span className="font-mono text-sm">Staked Successfully</span>
        </div>
        <a
          href={getTxUrl(txSignature)}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-gold-400 hover:text-gold-300"
        >
          <span className="font-mono text-xs">View on Solscan</span>
          <ExternalLink className="h-3 w-3" />
        </a>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit}>
      <p className="mb-3 font-mono text-xs text-muted-foreground">
        Stake USDv → receive sUSDV
        {usdvBalance > 0 && (
          <span className="ml-2 text-foreground">
            Balance: {usdvBalance.toFixed(2)} USDv
          </span>
        )}
      </p>

      <div className="mb-4">
        <div className="flex items-center gap-2 rounded-sm border border-white/[0.08] bg-white/[0.03] px-4 py-3 focus-within:border-gold-500/30">
          <input
            type="number"
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="flex-1 bg-transparent font-mono text-lg text-foreground outline-none placeholder:text-muted-foreground/50"
            step="0.01"
            min="0"
          />
          <button
            type="button"
            onClick={() => setAmount(usdvBalance.toString())}
            className="font-mono text-[10px] uppercase text-gold-400 hover:text-gold-300"
          >
            MAX
          </button>
          <span className="font-mono text-xs text-muted-foreground">USDv</span>
        </div>
      </div>

      {error && <p className="mb-3 font-mono text-xs text-error">{error}</p>}

      <button
        type="submit"
        disabled={loading || !amount || parseFloat(amount) <= 0}
        className="btn-primary flex w-full items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Signing...
          </>
        ) : (
          "Stake USDv"
        )}
      </button>
    </form>
  );
}

function UnstakeForm({ susdvBalance, onSuccess }: { susdvBalance: number; onSuccess: () => void }) {
  const { startUnstake, loading, error, txSignature } = useSolomonUnstake();
  const [amount, setAmount] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const num = parseFloat(amount);
    if (isNaN(num) || num <= 0) return;
    const sig = await startUnstake(num);
    if (sig) {
      setAmount("");
      onSuccess();
    }
  };

  if (txSignature) {
    return (
      <div>
        <div className="mb-4 flex items-center gap-2 text-success">
          <Check className="h-5 w-5" />
          <span className="font-mono text-sm">Unstake Requested — 7-day cooldown started</span>
        </div>
        <a
          href={getTxUrl(txSignature)}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-gold-400 hover:text-gold-300"
        >
          <span className="font-mono text-xs">View on Solscan</span>
          <ExternalLink className="h-3 w-3" />
        </a>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit}>
      <p className="mb-3 font-mono text-xs text-muted-foreground">
        Request unstake — 7-day cooldown
        {susdvBalance > 0 && (
          <span className="ml-2 text-foreground">
            Balance: {susdvBalance.toFixed(2)} sUSDV
          </span>
        )}
      </p>

      <div className="mb-4">
        <div className="flex items-center gap-2 rounded-sm border border-white/[0.08] bg-white/[0.03] px-4 py-3 focus-within:border-gold-500/30">
          <input
            type="number"
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="flex-1 bg-transparent font-mono text-lg text-foreground outline-none placeholder:text-muted-foreground/50"
            step="0.01"
            min="0"
          />
          <button
            type="button"
            onClick={() => setAmount(susdvBalance.toString())}
            className="font-mono text-[10px] uppercase text-gold-400 hover:text-gold-300"
          >
            MAX
          </button>
          <span className="font-mono text-xs text-muted-foreground">sUSDV</span>
        </div>
      </div>

      {error && <p className="mb-3 font-mono text-xs text-error">{error}</p>}

      <button
        type="submit"
        disabled={loading || !amount || parseFloat(amount) <= 0}
        className="btn-glass flex w-full items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Signing...
          </>
        ) : (
          "Request Unstake"
        )}
      </button>
    </form>
  );
}
