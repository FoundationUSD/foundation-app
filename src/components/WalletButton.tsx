"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
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

  // Render modal via portal so it's not trapped inside navbar
  const renderModal = () => {
    if (!mounted || !modalOpen) return null;
    return createPortal(
      <WalletModal open={modalOpen} onClose={() => setModalOpen(false)} />,
      document.body,
    );
  };

  // Signing
  if (connected && signing) {
    return (
      <div className="flex items-center gap-2 border border-gold-500/20 bg-gold-500/5 px-3 py-1.5">
        <div className="h-3 w-3 animate-spin rounded-full border-2 border-gold-400 border-t-transparent" />
        <span className="font-mono text-[10px] text-gold-400">Signing...</span>
      </div>
    );
  }

  // Not connected
  if (!connected || !publicKey || !signedIn) {
    return (
      <>
        <button onClick={() => setModalOpen(true)} className="btn-primary flex items-center gap-2 px-4 py-2 text-[10px]">
          <Wallet className="h-3 w-3" />
          Connect
        </button>
        {renderModal()}
      </>
    );
  }

  // Connected
  return (
    <div ref={dropdownRef} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 border border-white/[0.06] bg-white/[0.02] px-3 py-1.5 transition-all hover:border-white/[0.12] hover:bg-white/[0.04]"
      >
        {wallet?.adapter.icon && (
          <Image unoptimized src={wallet.adapter.icon} alt="" width={14} height={14} className="h-3.5 w-3.5" />
        )}
        <span className="font-mono text-[10px] text-foreground">
          {shortenAddress(publicKey.toBase58(), 4)}
        </span>
        <ChevronDown className={`h-2.5 w-2.5 text-muted-foreground/60 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute right-0 z-[200] mt-1 w-72 animate-fade-in border border-white/[0.08] bg-[#0c1220] shadow-2xl">
          {/* Address + copy */}
          <div className="border-b border-white/[0.06] p-4">
            <div className="mb-2 flex items-center gap-2">
              {wallet?.adapter.icon && (
                <Image unoptimized src={wallet.adapter.icon} alt="" width={16} height={16} className="h-4 w-4" />
              )}
              <span className="font-mono text-[11px] text-foreground">{wallet?.adapter.name}</span>
              <ShieldCheck className="h-3 w-3 text-success" />
            </div>
            <div className="flex items-center gap-2">
              <p className="min-w-0 flex-1 truncate font-mono text-[10px] text-muted-foreground">
                {publicKey.toBase58()}
              </p>
              <button
                onClick={copyAddress}
                className="shrink-0 p-1 text-muted-foreground/50 transition-colors hover:text-foreground"
                title="Copy address"
              >
                {copied ? <Check className="h-3 w-3 text-success" /> : <Copy className="h-3 w-3" />}
              </button>
            </div>
          </div>

          {/* Balance */}
          <div className="border-b border-white/[0.06] px-4 py-3">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground/50">Balance</span>
              <span className="font-mono text-[12px] text-foreground">
                {solBalance !== null ? `${solBalance.toFixed(4)} SOL` : "..."}
              </span>
            </div>
          </div>

          {/* Actions */}
          <div className="p-1.5">
            <a
              href={`${EXPLORER_URL}/account/${publicKey.toBase58()}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex w-full items-center gap-2.5 px-3 py-2 text-left font-mono text-[10px] text-muted-foreground transition-colors hover:bg-white/[0.03] hover:text-foreground"
            >
              <ExternalLink className="h-3 w-3" />
              View on Explorer
            </a>
            <button
              onClick={() => { disconnect(); setOpen(false); }}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-left font-mono text-[10px] text-error/70 transition-colors hover:bg-error/5 hover:text-error"
            >
              <LogOut className="h-3 w-3" />
              Disconnect
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
