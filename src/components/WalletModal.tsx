"use client";

import { useEffect, useCallback } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import type { Adapter } from "@solana/wallet-adapter-base";
import { X, Loader2 } from "lucide-react";

interface WalletModalProps {
  open: boolean;
  onClose: () => void;
}

const WALLET_ORDER = ["Phantom", "Solflare", "Backpack", "Coinbase Wallet"];

export function WalletModal({ open, onClose }: WalletModalProps) {
  const { wallets, select, connecting, connected } = useWallet();

  // Close when connected
  useEffect(() => {
    if (connected && open) onClose();
  }, [connected, open, onClose]);

  // Close on escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  const handleSelect = useCallback(
    (adapter: Adapter) => {
      select(adapter.name);
      // Wallet adapter auto-connects after select
    },
    [select],
  );

  if (!open) return null;

  // Sort wallets: installed first, then by preferred order
  const sorted = [...wallets].sort((a, b) => {
    const aInstalled = a.readyState === "Installed" ? 0 : 1;
    const bInstalled = b.readyState === "Installed" ? 0 : 1;
    if (aInstalled !== bInstalled) return aInstalled - bInstalled;
    const aOrder = WALLET_ORDER.indexOf(a.adapter.name);
    const bOrder = WALLET_ORDER.indexOf(b.adapter.name);
    return (aOrder === -1 ? 99 : aOrder) - (bOrder === -1 ? 99 : bOrder);
  });

  const installed = sorted.filter((w) => w.readyState === "Installed");
  const notInstalled = sorted.filter((w) => w.readyState !== "Installed");

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="glass-strong relative z-10 w-full max-w-sm overflow-hidden rounded-sm border border-white/[0.08]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/[0.06] px-6 py-4">
          <h2 className="font-serif text-lg font-light text-foreground">Connect Wallet</h2>
          <button
            onClick={onClose}
            className="rounded-sm p-1 text-muted-foreground transition-colors hover:bg-white/[0.04] hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Wallet list */}
        <div className="p-3">
          {connecting && (
            <div className="mb-3 flex items-center gap-3 rounded-sm bg-gold-500/5 px-4 py-3">
              <Loader2 className="h-4 w-4 animate-spin text-gold-400" />
              <span className="font-mono text-xs text-gold-400">Connecting...</span>
            </div>
          )}

          {installed.length > 0 && (
            <>
              <p className="mb-2 px-2 font-mono text-[9px] uppercase tracking-[0.15em] text-muted-foreground">
                Detected
              </p>
              <div className="mb-3 space-y-1">
                {installed.map((w) => (
                  <button
                    key={w.adapter.name}
                    onClick={() => handleSelect(w.adapter)}
                    disabled={connecting}
                    className="flex w-full items-center gap-3 rounded-sm px-4 py-3 transition-all hover:bg-white/[0.04] disabled:opacity-50"
                  >
                    {w.adapter.icon && (
                      <img
                        src={w.adapter.icon}
                        alt={w.adapter.name}
                        className="h-8 w-8 rounded-sm"
                      />
                    )}
                    <div className="text-left">
                      <p className="font-mono text-sm text-foreground">{w.adapter.name}</p>
                      <p className="font-mono text-[10px] text-success">Ready</p>
                    </div>
                  </button>
                ))}
              </div>
            </>
          )}

          {notInstalled.length > 0 && (
            <>
              <p className="mb-2 px-2 font-mono text-[9px] uppercase tracking-[0.15em] text-muted-foreground">
                {installed.length > 0 ? "More wallets" : "Install a wallet"}
              </p>
              <div className="space-y-1">
                {notInstalled.slice(0, 4).map((w) => (
                  <a
                    key={w.adapter.name}
                    href={w.adapter.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex w-full items-center gap-3 rounded-sm px-4 py-3 transition-all hover:bg-white/[0.04]"
                  >
                    {w.adapter.icon && (
                      <img
                        src={w.adapter.icon}
                        alt={w.adapter.name}
                        className="h-8 w-8 rounded-sm opacity-50"
                      />
                    )}
                    <div className="text-left">
                      <p className="font-mono text-sm text-foreground/70">{w.adapter.name}</p>
                      <p className="font-mono text-[10px] text-muted-foreground">Install</p>
                    </div>
                  </a>
                ))}
              </div>
            </>
          )}

          {wallets.length === 0 && (
            <div className="py-8 text-center">
              <p className="mb-2 text-sm text-muted-foreground">No wallets found</p>
              <a
                href="https://phantom.app/"
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-xs text-gold-400 hover:text-gold-300"
              >
                Install Phantom →
              </a>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-white/[0.06] px-6 py-3">
          <p className="text-center font-mono text-[9px] text-muted-foreground">
            By connecting, you agree to sign a message to verify wallet ownership.
          </p>
        </div>
      </div>
    </div>
  );
}
