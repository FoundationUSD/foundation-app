"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useWallet } from "@solana/wallet-adapter-react";
import { useConnection } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  getAccount,
} from "@solana/spl-token";
import { Wallet, Coins } from "lucide-react";
import { WalletModal } from "@/components/WalletModal";

export default function PortfolioPage() {
  const wallet = useWallet();
  const { connection } = useConnection();
  const [walletModalOpen, setWalletModalOpen] = useState(false);
  const [fdnBalance, setFdnBalance] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  const fdnMint = process.env.NEXT_PUBLIC_FDN_ALPHA_MINT;

  useEffect(() => {
    if (!wallet.publicKey || !fdnMint) {
      setFdnBalance(0);
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function load() {
      try {
        const mintPk = new PublicKey(fdnMint!);
        const ata = getAssociatedTokenAddressSync(
          mintPk,
          wallet.publicKey!,
          false,
          TOKEN_2022_PROGRAM_ID,
        );
        const account = await getAccount(connection, ata, "confirmed", TOKEN_2022_PROGRAM_ID);
        if (!cancelled) setFdnBalance(Number(account.amount) / 1e6);
      } catch {
        if (!cancelled) setFdnBalance(0);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    const interval = setInterval(load, 15000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [wallet.publicKey, fdnMint, connection]);

  if (!wallet.connected) {
    return (
      <>
        <div className="mx-auto flex max-w-5xl flex-col items-center justify-center px-6 py-24">
          <div className="glass-card max-w-md p-10 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-sm bg-gold-500/10">
              <Wallet className="h-8 w-8 text-gold-400" />
            </div>
            <h1 className="mb-2 font-serif text-2xl font-light text-foreground">
              Connect Your Wallet
            </h1>
            <p className="mb-6 text-sm text-muted-foreground">
              Connect your Solana wallet to view your Foundation vault positions.
            </p>
            <button onClick={() => setWalletModalOpen(true)} className="btn-primary w-full">
              Connect Wallet
            </button>
          </div>
        </div>
        <WalletModal open={walletModalOpen} onClose={() => setWalletModalOpen(false)} />
      </>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-12">
      <h1 className="mb-8 font-serif text-3xl font-light text-foreground">Portfolio</h1>

      {/* fdnALPHA Position */}
      <div className="mb-10 border border-white/[0.06] p-6">
        <h3 className="section-label mb-4">Your Position</h3>
        {loading ? (
          <div className="skeleton h-20 rounded-sm" />
        ) : fdnBalance > 0 ? (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-sm bg-gold-500/10">
                <Coins className="h-6 w-6 text-gold-400" />
              </div>
              <div>
                <h4 className="font-serif text-xl font-light text-foreground">fdnALPHA</h4>
                <p className="font-mono text-[10px] text-muted-foreground">
                  Token-2022 · Interest-bearing
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-gradient-gold font-mono text-2xl font-medium">
                {fdnBalance.toFixed(2)}
              </p>
              <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
                fdnALPHA
              </p>
            </div>
          </div>
        ) : (
          <div className="py-6 text-center">
            <p className="mb-2 text-sm text-muted-foreground">No fdnALPHA tokens found</p>
            <Link href="/" className="font-mono text-xs text-gold-400 hover:text-gold-300">
              Deposit USDC to get started →
            </Link>
          </div>
        )}
      </div>

      {/* Vault breakdown */}
      <div className="mb-10 border border-white/[0.06] p-6">
        <h3 className="section-label mb-4">Available Vaults</h3>
        <div className="space-y-3">
          {[
            { name: "Foundation × Solomon", strategy: "sUSDV Basis Yield", id: "fdn-solomon" },
            { name: "Foundation × Kamino", strategy: "PRIME Credit Yield", id: "fdn-kamino" },
            { name: "Foundation × Drift", strategy: "Levered RWA Yield", id: "fdn-drift" },
          ].map((v) => (
            <Link key={v.id} href={`/strategy/${v.id}`}>
              <div className="flex items-center justify-between border border-white/[0.04] p-4 transition-all hover:border-white/[0.1]">
                <div>
                  <p className="text-sm font-medium text-foreground">{v.name}</p>
                  <p className="font-mono text-[10px] text-muted-foreground">{v.strategy}</p>
                </div>
                <span className="font-mono text-xs text-gold-400">Deposit →</span>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* Info */}
      <div className="border border-white/[0.06] p-6">
        <h3 className="section-label mb-4">How fdnALPHA Works</h3>
        <div className="space-y-3 text-sm text-muted-foreground">
          <p>
            fdnALPHA is a Token-2022 receipt token with an interest-bearing extension. Your balance
            grows automatically as yield accrues — no claiming or compounding needed.
          </p>
          <p>
            To withdraw, burn your fdnALPHA tokens and Foundation returns your USDC plus accrued yield
            from the vault&apos;s Squads multisig.
          </p>
        </div>
      </div>
    </div>
  );
}
