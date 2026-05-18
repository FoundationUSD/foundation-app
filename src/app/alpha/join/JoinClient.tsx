"use client";

import { useState } from "react";
import { Bell, IdCard, Share2, Wallet } from "lucide-react";
import { SignInWithX } from "@/components/SignInWithX";
import { WaitlistProgress } from "@/components/WaitlistProgress";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletModal } from "@/components/WalletModal";

export function JoinClient() {
  const { connected } = useWallet();
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <div className="fdn-page max-w-[680px] mx-auto px-4 sm:px-0">
      <div className="animate-fade-up overflow-hidden rounded-2xl border border-[var(--rule)] bg-[var(--surface)] shadow-2xl">
        
        {/* Top Progress Tabs — Integrated into Card */}
        <div className="border-b border-[var(--rule)]/30 bg-[var(--surface-strong)]/20">
          <WaitlistProgress currentStep={1} />
        </div>

        {/* Combined Single-Section Content */}
        <div className="p-8 sm:p-10 flex flex-col gap-8 justify-between">
          
          {/* Header & High-Impact Allowlist Pitch */}
          <div className="text-center">
            
            {/* Clear Allowlist Headline */}
            <h1 className="font-serif text-3xl font-light leading-tight text-[var(--fg)] sm:text-[40px] mb-4">
              Join the Genesis Allowlist.
            </h1>

            {/* Standout Description Highlighting 20% Fee Sharing & Passes */}
            <p className="text-[15px] sm:text-[16px] leading-relaxed text-[var(--text-accent)] font-light max-w-xl mx-auto">
              Secure early access to FCYUSD, Solana's premier compute-backed asset. Claim your Genesis Pass and activate perpetual 20% USDC fee sharing.
            </p>
          </div>

          {/* Joiner Perks Horizontal Row Layout — High-Value, Clean Icons */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Perk 1 */}
            <div className="flex flex-col items-center text-center p-4 rounded-xl border border-[var(--rule)]/40 bg-[var(--surface-strong)]/10 shadow-sm transition-all hover:border-[var(--rule)]/70 hover:bg-[var(--surface-strong)]/25">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-[var(--rule)]/60 bg-[var(--surface)] text-gold-500 mb-3 shadow-inner">
                <IdCard className="h-5 w-5" />
              </div>
              <h4 className="font-bold text-[12px] text-[var(--fg)] tracking-wide uppercase font-mono mb-1">
                Genesis Pass
              </h4>
              <p className="text-[11px] text-[var(--text-accent)] font-light">
                Numbered member pass
              </p>
            </div>

            {/* Perk 2 */}
            <div className="flex flex-col items-center text-center p-4 rounded-xl border border-[var(--rule)]/40 bg-[var(--surface-strong)]/10 shadow-sm transition-all hover:border-[var(--rule)]/70 hover:bg-[var(--surface-strong)]/25">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-[var(--rule)]/60 bg-[var(--surface)] text-gold-500 mb-3 shadow-inner">
                <Share2 className="h-5 w-5" />
              </div>
              <h4 className="font-bold text-[12px] text-[var(--fg)] tracking-wide uppercase font-mono mb-1">
                20% USDC Share
              </h4>
              <p className="text-[11px] text-[var(--text-accent)] font-light">
                Perpetual fee sharing
              </p>
            </div>

            {/* Perk 3 */}
            <div className="flex flex-col items-center text-center p-4 rounded-xl border border-[var(--rule)]/40 bg-[var(--surface-strong)]/10 shadow-sm transition-all hover:border-[var(--rule)]/70 hover:bg-[var(--surface-strong)]/25">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-[var(--rule)]/60 bg-[var(--surface)] text-gold-500 mb-3 shadow-inner">
                <Bell className="h-5 w-5" />
              </div>
              <h4 className="font-bold text-[12px] text-[var(--fg)] tracking-wide uppercase font-mono mb-1">
                Early Access
              </h4>
              <p className="text-[11px] text-[var(--text-accent)] font-light">
                First queue allocation
              </p>
            </div>
          </div>

          {/* Wallet / X Connection Action Area */}
          <div className="border-t border-[var(--rule)]/30 pt-6 max-w-md w-full mx-auto">
            {!connected ? (
              <div className="flex flex-col gap-3">
                <button
                  onClick={() => setModalOpen(true)}
                  className="group flex w-full items-center justify-center gap-3 rounded-lg bg-gold-500 px-6 py-4 font-mono text-[13px] font-bold uppercase tracking-[0.2em] text-navy-900 shadow-xl shadow-gold-500/10 transition-all hover:bg-gold-400 hover:scale-[1.01] active:scale-[0.99]"
                >
                  <Wallet className="h-4 w-4" />
                  <span>Join the Allowlist</span>
                </button>
              </div>
            ) : (
              <div className="animate-fade-up flex flex-col gap-3">
                <SignInWithX
                  callbackURL="/alpha/reveal"
                  label="Verify Identity with X"
                  className="w-full"
                  linkClassName="group flex w-full items-center justify-center gap-3 rounded-lg bg-gold-500 px-6 py-4 font-mono text-[13px] font-bold uppercase tracking-[0.2em] text-navy-900 no-underline shadow-xl shadow-gold-500/10 transition-all hover:bg-gold-400 hover:scale-[1.01] active:scale-[0.99]"
                />
                <p className="text-center font-mono text-[10px] uppercase tracking-widest text-[var(--text-accent)] opacity-60">
                  🔒 Read-only permission
                </p>
              </div>
            )}
          </div>

          {/* Bottom Stats Row — Centered horizontal footer block */}
          <div className="grid grid-cols-3 gap-4 border-t border-[var(--rule)]/30 pt-6 text-center">
            <div>
              <p className="font-mono text-[20px] font-bold text-gold-500 sm:text-[24px]">12–18%</p>
              <p className="mt-1 font-sans text-[11px] font-semibold uppercase tracking-wider text-[var(--text-accent)] leading-snug">
                Target Yield
              </p>
            </div>
            <div>
              <p className="font-mono text-[20px] font-bold text-[var(--fg)] sm:text-[24px]">$1T+</p>
              <p className="mt-1 font-sans text-[11px] font-semibold uppercase tracking-wider text-[var(--text-accent)] leading-snug">
                AI Capex Cycle
              </p>
            </div>
            <div>
              <p className="font-mono text-[20px] font-bold text-gold-500 sm:text-[24px]">20%</p>
              <p className="mt-1 font-sans text-[11px] font-semibold uppercase tracking-wider text-[var(--text-accent)] leading-snug">
                USDC Fee Share
              </p>
            </div>
          </div>

        </div>
      </div>
      
      <WalletModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </div>
  );
}
