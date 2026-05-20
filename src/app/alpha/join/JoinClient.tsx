"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Bell, IdCard, Share2, Wallet } from "lucide-react";
import { SignInWithX } from "@/components/SignInWithX";
import { WaitlistProgress } from "@/components/WaitlistProgress";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletModal } from "@/components/WalletModal";

export function JoinClient() {
  const { connected } = useWallet();
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <div className="fdn-page max-w-[1000px]">
      <div className="animate-fade-up overflow-hidden rounded-2xl border border-[var(--rule)] bg-[var(--surface)] shadow-2xl">
        {/* Top Progress Tabs — Integrated into Card */}
        <div className="border-b border-[var(--rule)]/30 bg-[var(--surface-strong)]/20">
          <WaitlistProgress currentStep={1} />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2">
          {/* Left Side — Branding & Stats */}
          <div className="relative flex flex-col justify-between p-8 sm:p-10">
            {/* Logo/Back link — Fixed height header */}
            <div className="h-8 flex items-center">
              <div className="flex items-center gap-2">
                <span className="font-mono text-[13px] font-bold tracking-[0.2em] text-[var(--fg)]">
                  FOUNDATION<span className="text-gold-500">.</span>
                </span>
              </div>
            </div>

            {/* Main Headline — Align with right side top */}
            <div className="mt-8 sm:mt-10">
              <p className="mb-4 font-mono text-[11px] font-bold uppercase tracking-[0.1em] text-gold-500">
                Foundation · Waitlist Access
              </p>
              <h1 className="mb-6 font-serif text-3xl font-light leading-tight text-[var(--fg)] sm:text-5xl">
                The institutional standard for <br />
                AI compute yield.
              </h1>
              <p className="max-w-md text-[14px] leading-relaxed text-[var(--text-accent)]">
                A specialized fund allocating capital to top-tier compute lending
                partners. Access professional-grade yield from the build-out of 
                global AI infrastructure.
              </p>
            </div>

            {/* Bottom Stats — Pushed to bottom */}
            <div className="mt-12 pt-8 border-t border-[var(--rule)]/30">
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <p className="font-mono text-[20px] font-bold text-gold-500">15.0%</p>
                  <p className="font-mono text-[9px] uppercase tracking-wider text-[var(--text-accent)]">
                    Target APY
                  </p>
                </div>
                <div>
                  <p className="font-mono text-[20px] font-bold text-[var(--fg)]">$1T+</p>
                  <p className="font-mono text-[9px] uppercase tracking-wider text-[var(--text-accent)]">
                    AI Capex Cycle
                  </p>
                </div>
                <div>
                  <p className="font-mono text-[20px] font-bold text-gold-500">20%</p>
                  <p className="font-mono text-[9px] uppercase tracking-wider text-[var(--text-accent)]">
                    You earn on referrals
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Right Side — Features & Join */}
          <div className="flex flex-col justify-start border-l border-[var(--rule)]/30 bg-[var(--surface-strong)]/30 p-8 sm:p-10 backdrop-blur-md">
            {/* Spacer to match left-side logo height */}
            <div className="h-8" />

            <div className="mt-8 sm:mt-10">
              <h2 className="mb-4 font-mono text-[11px] font-bold uppercase tracking-[0.1em] text-gold-500">
                What you get when you join
              </h2>

              <div className="space-y-8">
                <div className="flex items-start gap-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[var(--rule)] bg-[var(--surface)] text-gold-500 shadow-sm">
                    <IdCard className="h-5 w-5" />
                  </div>
                  <div>
                    <h4 className="font-bold text-[14px] text-[var(--fg)]">
                      Genesis Member Pass
                    </h4>
                    <p className="mt-1 text-[14px] leading-relaxed text-[var(--text-accent)]">
                      Exclusive numbered ID. Verified early-access to the first AI
                      compute yield index on Solana.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[var(--rule)] bg-[var(--surface)] text-gold-500 shadow-sm">
                    <Share2 className="h-5 w-5" />
                  </div>
                  <div>
                    <h4 className="font-bold text-[14px] text-[var(--fg)]">
                      20% Fee Share
                    </h4>
                    <p className="mt-1 text-[14px] leading-relaxed text-[var(--text-accent)]">
                      Earn 20% of protocol fees in USDC for every friend you
                      refer.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[var(--rule)] bg-[var(--surface)] text-gold-500 shadow-sm">
                    <Bell className="h-5 w-5" />
                  </div>
                  <div>
                    <h4 className="font-bold text-[14px] text-[var(--fg)]">
                      Priority Allocation
                    </h4>
                    <p className="mt-1 text-[14px] leading-relaxed text-[var(--text-accent)]">
                      Be first in line to deposit. Secure your spot in restricted
                      early-access vaults.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-auto pt-12">
              <div className="pt-8 border-t border-[var(--rule)]/30">
                {!connected && (
                  <p className="mb-6 font-mono text-[11px] font-bold uppercase tracking-[0.1em] text-gold-500 text-center">
                    Step 1 of 2 · Join the Waitlist
                  </p>
                )}
                {!connected ? (
                  <button
                    onClick={() => setModalOpen(true)}
                    className="group flex w-full items-center justify-center gap-3 rounded-lg bg-gold-500 px-6 py-4 font-mono text-[13px] font-bold uppercase tracking-[0.2em] text-navy-900 shadow-xl shadow-gold-500/30 transition-all hover:bg-gold-400 hover:scale-[1.02] active:scale-[0.98]"
                  >
                    <Wallet className="h-5 w-5" />
                    <span>Join the Waitlist</span>
                  </button>
                ) : (
                  <div className="animate-fade-up">
                    <p className="mb-6 font-mono text-[11px] font-bold uppercase tracking-[0.1em] text-gold-500 text-center">
                      Step 2 of 2 · Finalize Identity
                    </p>
                    <SignInWithX
                      callbackURL="/alpha/reveal"
                      label="Connect X to join"
                      className="w-full"
                    />
                  </div>
                )}
                
                <p className="mt-4 text-center font-mono text-[9px] uppercase tracking-widest text-[var(--text-accent)]">
                  {connected 
                    ? "🔒 Read-only"
                    : "First step: Connect your Solana wallet"
                  }
                </p>

                <WalletModal open={modalOpen} onClose={() => setModalOpen(false)} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
