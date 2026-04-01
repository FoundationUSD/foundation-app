"use client";

import { useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { ArrowLeft, Loader2, Check, ExternalLink, Wallet, ChevronDown } from "lucide-react";
import { WalletModal } from "@/components/WalletModal";
import Link from "next/link";
import { useKaminoMarkets, useKaminoReserves, useKaminoDeposit, useKaminoWithdraw } from "@/hooks/useKamino";
import { KAMINO_MARKETS, type KaminoMarketConfig, type KaminoReserveData } from "@/lib/integrations/kamino";
import { getTxUrl } from "@/lib/constants";
import { formatAPY } from "@/lib/utils";

export default function KaminoPage() {
  const wallet = useWallet();
  const [walletModalOpen, setWalletModalOpen] = useState(false);
  const { markets, loading: marketsLoading } = useKaminoMarkets();
  const [selectedMarket, setSelectedMarket] = useState<KaminoMarketConfig>(KAMINO_MARKETS[0]);

  return (
    <div className="mx-auto max-w-5xl px-6 py-12">
      {/* Back nav */}
      <Link
        href="/"
        className="mb-8 inline-flex items-center gap-2 font-mono text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to Vaults
      </Link>

      {/* Header */}
      <div className="mb-8">
        <span className="mb-2 inline-block rounded bg-blue-500/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.15em] text-blue-400">
          Kamino Finance
        </span>
        <h1 className="mb-2 font-serif text-3xl font-light text-foreground">
          Kamino RWA Lending
        </h1>
        <p className="text-sm text-muted-foreground">
          Supply stablecoins to Kamino&apos;s institutional RWA markets. Earn yield backed by real-world
          credit — PRIME (Figure HELOCs), Apollo ACRED, and more.
        </p>
      </div>

      {/* Market summary cards */}
      {marketsLoading ? (
        <div className="mb-8 grid gap-4 md:grid-cols-2">
          {[1, 2].map((i) => (
            <div key={i} className="skeleton h-28 rounded-sm" />
          ))}
        </div>
      ) : markets.length > 0 ? (
        <div className="mb-8 grid gap-4 md:grid-cols-2">
          {markets.map((m) => (
            <button
              key={m.market.id}
              onClick={() => setSelectedMarket(m.market)}
              className={`glass-card p-5 text-left transition-all hover:border-white/[0.15] ${
                selectedMarket.id === m.market.id ? "border-gold-500/30 bg-gold-500/5" : ""
              }`}
            >
              <div className="mb-2 flex items-center justify-between">
                <h3 className="font-mono text-sm font-medium text-foreground">{m.market.name}</h3>
                <span className="rounded bg-blue-500/10 px-2 py-0.5 font-mono text-[9px] uppercase text-blue-400">
                  RWA
                </span>
              </div>
              <p className="mb-3 text-xs text-muted-foreground">{m.market.description}</p>
              <div className="flex items-center gap-6">
                <div>
                  <p className="text-gradient-gold font-mono text-lg font-medium">
                    {m.topSupplyApy > 0 ? formatAPY(m.topSupplyApy) : "--"}
                  </p>
                  <p className="font-mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground">
                    Best Supply APY
                  </p>
                </div>
                <div>
                  <p className="font-mono text-sm text-foreground">
                    ${(m.tvl / 1_000_000).toFixed(0)}M
                  </p>
                  <p className="font-mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground">
                    TVL
                  </p>
                </div>
              </div>
            </button>
          ))}
        </div>
      ) : null}

      {/* Selected market reserves + deposit form */}
      <MarketDetail
        market={selectedMarket}
        walletConnected={wallet.connected}
        onConnect={() => setWalletModalOpen(true)}
      />

      <WalletModal open={walletModalOpen} onClose={() => setWalletModalOpen(false)} />
    </div>
  );
}

function MarketDetail({
  market,
  walletConnected,
  onConnect,
}: {
  market: KaminoMarketConfig;
  walletConnected: boolean;
  onConnect: () => void;
}) {
  const { reserves, loading } = useKaminoReserves(market.address);
  const [selectedReserve, setSelectedReserve] = useState<KaminoReserveData | null>(null);
  const [tab, setTab] = useState<"deposit" | "withdraw">("deposit");

  // Auto-select USDC when reserves load
  const sortedReserves = reserves
    .filter((r) => r.totalSupplyUsd > 10_000)
    .sort((a, b) => b.totalSupplyUsd - a.totalSupplyUsd);

  if (!selectedReserve && sortedReserves.length > 0) {
    const usdc = sortedReserves.find((r) => r.symbol.toUpperCase() === "USDC");
    if (usdc) setSelectedReserve(usdc);
    else setSelectedReserve(sortedReserves[0]);
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
      {/* Left: Reserve list */}
      <div>
        <h3 className="section-label mb-4">{market.name} — Reserves</h3>
        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="skeleton h-16 rounded-sm" />
            ))}
          </div>
        ) : sortedReserves.length === 0 ? (
          <div className="glass rounded-sm p-6 text-center">
            <p className="font-mono text-xs text-muted-foreground">No reserves found for this market</p>
          </div>
        ) : (
          <div className="space-y-2">
            {sortedReserves.map((reserve) => (
              <button
                key={reserve.reserve}
                onClick={() => setSelectedReserve(reserve)}
                className={`glass w-full rounded-sm p-4 text-left transition-all hover:border-white/[0.15] ${
                  selectedReserve?.reserve === reserve.reserve
                    ? "border-gold-500/30 bg-gold-500/5"
                    : ""
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-mono text-sm font-medium text-foreground">
                      {reserve.symbol}
                    </p>
                    <p className="font-mono text-[10px] text-muted-foreground">
                      TVL: ${(reserve.totalSupplyUsd / 1_000_000).toFixed(1)}M
                      {reserve.maxLtv > 0 && ` · LTV: ${(reserve.maxLtv * 100).toFixed(0)}%`}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-gradient-gold font-mono text-sm font-medium">
                      {formatAPY(reserve.supplyApy * 100)}
                    </p>
                    <p className="font-mono text-[10px] text-muted-foreground">Supply APY</p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Right: Deposit/Withdraw form */}
      <div>
        {!walletConnected ? (
          <div className="glass rounded-sm p-6 text-center">
            <Wallet className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
            <p className="mb-4 text-sm text-muted">Connect your wallet to deposit</p>
            <button onClick={onConnect} className="btn-primary">
              Connect Wallet
            </button>
          </div>
        ) : selectedReserve ? (
          <div className="glass rounded-sm p-6">
            {/* Tabs */}
            <div className="mb-4 flex gap-2">
              <button
                onClick={() => setTab("deposit")}
                className={`rounded-sm px-4 py-2 font-mono text-xs transition-colors ${
                  tab === "deposit"
                    ? "bg-gold-500/10 text-gold-400"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Deposit
              </button>
              <button
                onClick={() => setTab("withdraw")}
                className={`rounded-sm px-4 py-2 font-mono text-xs transition-colors ${
                  tab === "withdraw"
                    ? "bg-gold-500/10 text-gold-400"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Withdraw
              </button>
            </div>

            {tab === "deposit" ? (
              <KaminoDepositForm reserve={selectedReserve} market={market} />
            ) : (
              <KaminoWithdrawForm reserve={selectedReserve} market={market} />
            )}
          </div>
        ) : (
          <div className="glass rounded-sm p-6 text-center">
            <p className="font-mono text-xs text-muted-foreground">Select a reserve</p>
          </div>
        )}
      </div>
    </div>
  );
}

function KaminoDepositForm({
  reserve,
  market,
}: {
  reserve: KaminoReserveData;
  market: KaminoMarketConfig;
}) {
  const { deposit, loading, error, txSignature } = useKaminoDeposit();
  const [amount, setAmount] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const num = parseFloat(amount);
    if (isNaN(num) || num <= 0) return;
    await deposit(reserve.mintAddress, amount, market.address);
  };

  if (txSignature) {
    return (
      <div>
        <div className="mb-4 flex items-center gap-2 text-success">
          <Check className="h-5 w-5" />
          <span className="font-mono text-sm">Deposit Successful</span>
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
      <p className="mb-1 font-mono text-xs text-foreground">
        Supply {reserve.symbol} to {market.name}
      </p>
      <p className="mb-3 font-mono text-[10px] text-muted-foreground">
        {formatAPY(reserve.supplyApy * 100)} APY · ${(reserve.totalSupplyUsd / 1_000_000).toFixed(1)}M TVL
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
          <span className="font-mono text-xs text-muted-foreground">{reserve.symbol}</span>
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
          "Deposit"
        )}
      </button>
    </form>
  );
}

function KaminoWithdrawForm({
  reserve,
  market,
}: {
  reserve: KaminoReserveData;
  market: KaminoMarketConfig;
}) {
  const { withdraw, loading, error, txSignature } = useKaminoWithdraw();
  const [amount, setAmount] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const num = parseFloat(amount);
    if (isNaN(num) || num <= 0) return;
    await withdraw(reserve.mintAddress, amount, market.address);
  };

  if (txSignature) {
    return (
      <div>
        <div className="mb-4 flex items-center gap-2 text-success">
          <Check className="h-5 w-5" />
          <span className="font-mono text-sm">Withdrawal Successful</span>
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
        Withdraw {reserve.symbol} from {market.name}
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
          <span className="font-mono text-xs text-muted-foreground">{reserve.symbol}</span>
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
          "Withdraw"
        )}
      </button>
    </form>
  );
}
