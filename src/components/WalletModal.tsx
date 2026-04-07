"use client";

import { useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { useWallet } from "@solana/wallet-adapter-react";
import Image from "next/image";
import type { Adapter } from "@solana/wallet-adapter-base";
import { X, Loader2, Zap } from "lucide-react";

interface WalletModalProps {
  open: boolean;
  onClose: () => void;
}

const WALLET_ORDER = ["Phantom", "Solflare", "Backpack", "Coinbase Wallet"];

export function WalletModal({ open, onClose }: WalletModalProps) {
  const { wallets, select, connecting, connected } = useWallet();

  useEffect(() => {
    if (connected && open) onClose();
  }, [connected, open, onClose]);

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
    },
    [select],
  );

  if (!open) return null;

  const seen = new Set<string>();
  const deduped = wallets.filter((w) => {
    if (seen.has(w.adapter.name)) return false;
    seen.add(w.adapter.name);
    return true;
  });

  const sorted = [...deduped].sort((a, b) => {
    const aInstalled = a.readyState === "Installed" ? 0 : 1;
    const bInstalled = b.readyState === "Installed" ? 0 : 1;
    if (aInstalled !== bInstalled) return aInstalled - bInstalled;
    const aOrder = WALLET_ORDER.indexOf(a.adapter.name);
    const bOrder = WALLET_ORDER.indexOf(b.adapter.name);
    return (aOrder === -1 ? 99 : aOrder) - (bOrder === -1 ? 99 : bOrder);
  });

  const installed = sorted.filter((w) => w.readyState === "Installed");
  const notInstalled = sorted.filter((w) => w.readyState !== "Installed");

  // Portal to body so it escapes navbar stacking context
  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-md"
        onClick={onClose}
        style={{ animation: "fadeIn 0.2s ease" }}
      />

      {/* Modal */}
      <div
        className="fdn-wallet-modal relative z-10"
        style={{ animation: "modalIn 0.2s ease" }}
      >
        {/* Header */}
        <div className="fdn-wallet-modal__header">
          <div>
            <h2 className="font-serif text-lg font-light text-[var(--fg)]">Connect Wallet</h2>
            <p className="mt-0.5 font-mono text-[10px] text-[var(--muted)]">Choose your Solana wallet</p>
          </div>
          <button
            onClick={onClose}
            className="fdn-wallet-modal__close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Connecting state */}
        {connecting && (
          <div className="fdn-wallet-modal__connecting">
            <Loader2 className="h-4 w-4 animate-spin text-amber-500" />
            <span>Connecting to wallet…</span>
          </div>
        )}

        {/* Wallet list */}
        <div className="fdn-wallet-modal__list">
          {installed.length > 0 && (
            <div className="fdn-wallet-modal__group">
              <p className="fdn-wallet-modal__group-label">
                <Zap className="h-2.5 w-2.5" />
                Detected
              </p>
              {installed.map((w) => (
                <button
                  key={w.adapter.name}
                  onClick={() => handleSelect(w.adapter)}
                  disabled={connecting}
                  className="fdn-wallet-modal__item fdn-wallet-modal__item--installed"
                >
                  {w.adapter.icon && (
                    <Image
                      unoptimized
                      src={w.adapter.icon}
                      alt={w.adapter.name}
                      className="h-9 w-9 rounded-xl"
                      width={36}
                      height={36}
                    />
                  )}
                  <div className="flex-1 text-left">
                    <p className="font-mono text-sm font-medium text-[var(--fg)]">{w.adapter.name}</p>
                    <p className="font-mono text-[10px] text-emerald-500">Ready to connect</p>
                  </div>
                  <span className="fdn-wallet-modal__arrow">→</span>
                </button>
              ))}
            </div>
          )}

          {notInstalled.length > 0 && (
            <div className="fdn-wallet-modal__group">
              <p className="fdn-wallet-modal__group-label">
                {installed.length > 0 ? "More options" : "Install a wallet"}
              </p>
              {notInstalled.slice(0, 4).map((w) => (
                <a
                  key={w.adapter.name}
                  href={w.adapter.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="fdn-wallet-modal__item"
                >
                  {w.adapter.icon && (
                    <Image
                      unoptimized
                      src={w.adapter.icon}
                      alt={w.adapter.name}
                      className="h-9 w-9 rounded-xl opacity-50"
                      width={36}
                      height={36}
                    />
                  )}
                  <div className="flex-1 text-left">
                    <p className="font-mono text-sm text-[var(--fg)]/60">{w.adapter.name}</p>
                    <p className="font-mono text-[10px] text-[var(--muted)]">Click to install</p>
                  </div>
                  <span className="fdn-wallet-modal__arrow opacity-40">↗</span>
                </a>
              ))}
            </div>
          )}

          {deduped.length === 0 && (
            <div className="py-10 text-center">
              <p className="mb-3 font-serif text-base text-[var(--muted)]">No wallets detected</p>
              <a
                href="https://phantom.app/"
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-xs text-amber-600 hover:text-amber-500"
              >
                Install Phantom →
              </a>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="fdn-wallet-modal__footer">
          By connecting, you agree to verify wallet ownership via message signing.
        </div>
      </div>

      <style>{`
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes modalIn { from { opacity: 0; transform: scale(0.97) translateY(8px); } to { opacity: 1; transform: scale(1) translateY(0); } }
      `}</style>
    </div>,
    document.body,
  );
}
