"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Image from "next/image";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import {
  Wallet,
  LogOut,
  Copy,
  Check,
  ExternalLink,
  ChevronDown,
  ShieldCheck,
} from "lucide-react";
import Avatar from "boring-avatars";
import { shortenAddress } from "@/lib/utils";
import { EXPLORER_URL } from "@/lib/constants";
import { WalletModal } from "@/components/WalletModal";

const LAMPORTS_PER_SOL = 1_000_000_000;

export function WalletButton() {
  const { publicKey, wallet, disconnect, connected, signMessage } = useWallet();
  const { connection } = useConnection();
  const [modalOpen, setModalOpen] = useState(false);
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [solBalance, setSolBalance] = useState<number | null>(null);
  const [signedIn, setSignedIn] = useState(false);
  const [signing, setSigning] = useState(false);
  const [mounted, setMounted] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => setMounted(true), []);

  const handleSignIn = useCallback(async () => {
    if (!publicKey || !signMessage || signedIn || signing) return;
    setSigning(true);
    try {
      const message = new TextEncoder().encode(
        `Sign in to Foundation\n\nWallet: ${publicKey.toBase58()}\nTimestamp: ${new Date().toISOString()}`,
      );
      await signMessage(message);
      setSignedIn(true);
    } catch {
      disconnect();
    } finally {
      setSigning(false);
    }
  }, [publicKey, signMessage, signedIn, signing, disconnect]);

  useEffect(() => {
    if (connected && publicKey && !signedIn && !signing) handleSignIn();
  }, [connected, publicKey, signedIn, signing, handleSignIn]);

  useEffect(() => {
    if (!connected) setSignedIn(false);
  }, [connected]);

  useEffect(() => {
    if (!publicKey || !signedIn) { setSolBalance(null); return; }
    const fetch_ = async () => {
      try { setSolBalance((await connection.getBalance(publicKey)) / LAMPORTS_PER_SOL); }
      catch { setSolBalance(null); }
    };
    fetch_();
    const i = setInterval(fetch_, 15000);
    return () => clearInterval(i);
  }, [publicKey, signedIn, connection]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const copyAddress = async () => {
    if (!publicKey) return;
    await navigator.clipboard.writeText(publicKey.toBase58());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Signing
  if (connected && signing) {
    return (
      <button className="fdn-wallet-btn fdn-wallet-btn--loading">
        <span className="h-3 w-3 animate-spin rounded-full border-2 border-gold-400 border-t-transparent" />
        <span>Signing…</span>
      </button>
    );
  }

  // Not connected
  if (!connected || !publicKey || !signedIn) {
    return (
      <>
        <button onClick={() => setModalOpen(true)} className="fdn-header__connect-btn flex items-center gap-2">
          <Wallet className="h-3.5 w-3.5" />
          <span>Connect</span>
        </button>
        {mounted && <WalletModal open={modalOpen} onClose={() => setModalOpen(false)} />}
      </>
    );
  }

  // Connected
  return (
    <div ref={dropdownRef} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="fdn-wallet-connected flex items-center gap-2"
      >
        <div className="h-5 w-5 rounded-full overflow-hidden flex-shrink-0">
          <Avatar size={20} name={publicKey.toBase58()} variant="beam" colors={["#0c2340","#b8960c","#d4af37","#1d4e6e","#f0f4ff"]} />
        </div>
        <span>{shortenAddress(publicKey.toBase58(), 4)}</span>
        <ChevronDown className={`h-3 w-3 opacity-60 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="fdn-wallet-dropdown">
          {/* Wallet info */}
          <div className="fdn-wallet-dropdown__header">
            <div className="flex items-center gap-2.5 mb-3">
              <div className="h-9 w-9 rounded-full overflow-hidden flex-shrink-0 border border-[var(--rule)]">
                <Avatar size={36} name={publicKey.toBase58()} variant="beam" colors={["#0c2340","#b8960c","#d4af37","#1d4e6e","#f0f4ff"]} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  {wallet?.adapter.icon && (
                    <Image unoptimized src={wallet.adapter.icon} alt="" width={12} height={12} className="h-3 w-3 rounded-full" />
                  )}
                  <span className="font-mono text-[11px] font-medium text-[var(--fg)]">{wallet?.adapter.name}</span>
                  <ShieldCheck className="h-3 w-3 text-emerald-400 ml-auto" />
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <p className="min-w-0 flex-1 truncate font-mono text-[10px] text-[var(--muted)]">
                {publicKey.toBase58()}
              </p>
              <button onClick={copyAddress} className="shrink-0 rounded p-1 transition-colors hover:bg-[var(--surface-strong)]">
                {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3 text-[var(--muted)]" />}
              </button>
            </div>
          </div>

          {/* Balance */}
          <div className="fdn-wallet-dropdown__balance">
            <span className="font-mono text-[9px] uppercase tracking-[0.15em] text-[var(--muted)]">SOL Balance</span>
            <span className="font-mono text-sm font-medium text-[var(--fg)]">
              {solBalance !== null ? `${solBalance.toFixed(4)} SOL` : "—"}
            </span>
          </div>

          {/* Actions */}
          <div className="fdn-wallet-dropdown__actions">
            <a
              href={`${EXPLORER_URL}/account/${publicKey.toBase58()}`}
              target="_blank"
              rel="noopener noreferrer"
              className="fdn-wallet-dropdown__action"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              View on Explorer
            </a>
            <button
              onClick={() => { disconnect(); setOpen(false); }}
              className="fdn-wallet-dropdown__action fdn-wallet-dropdown__action--danger"
            >
              <LogOut className="h-3.5 w-3.5" />
              Disconnect
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
