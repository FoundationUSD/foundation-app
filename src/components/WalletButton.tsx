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
  Coins,
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
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Sign message on connect to verify ownership
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
      // User rejected — disconnect
      disconnect();
    } finally {
      setSigning(false);
    }
  }, [publicKey, signMessage, signedIn, signing, disconnect]);

  // Trigger sign-in when wallet connects
  useEffect(() => {
    if (connected && publicKey && !signedIn && !signing) {
      handleSignIn();
    }
  }, [connected, publicKey, signedIn, signing, handleSignIn]);

  // Reset sign-in state on disconnect
  useEffect(() => {
    if (!connected) setSignedIn(false);
  }, [connected]);

  // Fetch SOL balance
  useEffect(() => {
    if (!publicKey || !signedIn) {
      setSolBalance(null);
      return;
    }

    const fetchBalance = async () => {
      try {
        const balance = await connection.getBalance(publicKey);
        setSolBalance(balance / LAMPORTS_PER_SOL);
      } catch {
        setSolBalance(null);
      }
    };

    fetchBalance();
    const interval = setInterval(fetchBalance, 15000);
    return () => clearInterval(interval);
  }, [publicKey, signedIn, connection]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const copyAddress = async () => {
    if (!publicKey) return;
    await navigator.clipboard.writeText(publicKey.toBase58());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Signing in progress
  if (connected && signing) {
    return (
      <div className="flex items-center gap-2 rounded-sm border border-gold-500/20 bg-gold-500/5 px-4 py-2">
        <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-gold-400 border-t-transparent" />
        <span className="font-mono text-[11px] text-gold-400">Sign message...</span>
      </div>
    );
  }

  // Not connected or not signed in — show connect button
  if (!connected || !publicKey || !signedIn) {
    return (
      <>
        <button
          onClick={() => setModalOpen(true)}
          className="btn-primary flex items-center gap-2"
        >
          <Wallet className="h-3.5 w-3.5" />
          Connect
        </button>
        <WalletModal open={modalOpen} onClose={() => setModalOpen(false)} />
      </>
    );
  }

  // Connected + signed in — show user dropdown
  return (
    <div ref={dropdownRef} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="glass flex items-center gap-2 rounded-none border-white/[0.08] px-4 py-2 transition-all hover:border-white/[0.15]"
      >
        {wallet?.adapter.icon && (
          <Image unoptimized
            src={wallet.adapter.icon}
            alt={wallet.adapter.name}
            className="h-4 w-4 rounded-sm" width={16} height={16}
          />
        )}

        <span className="font-mono text-[11px] tracking-wide text-foreground">
          {shortenAddress(publicKey.toBase58(), 4)}
        </span>

        {solBalance !== null && (
          <span className="font-mono text-[10px] text-muted-foreground">
            {solBalance.toFixed(2)} SOL
          </span>
        )}

        <ChevronDown
          className={`h-3 w-3 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="glass-strong absolute right-0 z-50 mt-2 w-64 animate-fade-in overflow-hidden rounded-sm border border-white/[0.08] p-0">
          {/* Header */}
          <div className="border-b border-white/[0.06] p-4">
            <div className="mb-1 flex items-center gap-2">
              {wallet?.adapter.icon && (
                <Image unoptimized
                  src={wallet.adapter.icon}
                  alt={wallet.adapter.name}
                  className="h-5 w-5 rounded-sm" width={20} height={20}
                />
              )}
              <span className="font-mono text-xs text-foreground">
                {wallet?.adapter.name}
              </span>
              <ShieldCheck className="h-3.5 w-3.5 text-success" />
            </div>
            <p className="font-mono text-[11px] text-muted-foreground">
              {publicKey.toBase58()}
            </p>
          </div>

          {/* Balance */}
          <div className="border-b border-white/[0.06] p-4">
            <div className="flex items-center gap-2">
              <Coins className="h-4 w-4 text-gold-400" />
              <div>
                <p className="font-mono text-sm text-foreground">
                  {solBalance !== null ? `${solBalance.toFixed(4)} SOL` : "Loading..."}
                </p>
                <p className="font-mono text-[9px] uppercase tracking-[0.15em] text-muted-foreground">
                  Balance
                </p>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="p-2">
            <button
              onClick={copyAddress}
              className="flex w-full items-center gap-3 rounded-sm px-3 py-2.5 text-left transition-colors hover:bg-white/[0.04]"
            >
              {copied ? (
                <Check className="h-4 w-4 text-success" />
              ) : (
                <Copy className="h-4 w-4 text-muted-foreground" />
              )}
              <span className="font-mono text-xs text-foreground">
                {copied ? "Copied!" : "Copy Address"}
              </span>
            </button>

            <a
              href={`${EXPLORER_URL}/account/${publicKey.toBase58()}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex w-full items-center gap-3 rounded-sm px-3 py-2.5 text-left transition-colors hover:bg-white/[0.04]"
            >
              <ExternalLink className="h-4 w-4 text-muted-foreground" />
              <span className="font-mono text-xs text-foreground">View on Explorer</span>
            </a>

            <button
              onClick={() => {
                disconnect();
                setOpen(false);
              }}
              className="flex w-full items-center gap-3 rounded-sm px-3 py-2.5 text-left transition-colors hover:bg-error/10"
            >
              <LogOut className="h-4 w-4 text-error" />
              <span className="font-mono text-xs text-error">Disconnect</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
