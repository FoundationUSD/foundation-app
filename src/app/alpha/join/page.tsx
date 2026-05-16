"use client";

import Link from "next/link";
import { ArrowLeft, Bell, IdCard, Share2 } from "lucide-react";
import { SignInWithX } from "@/components/SignInWithX";
import { WaitlistProgress } from "@/components/WaitlistProgress";

export default function JoinWaitlistPage() {
  return (
    <div className="fdn-page max-w-[1000px]">
      <WaitlistProgress currentStep={1} />

      <div className="animate-fade-up overflow-hidden rounded-2xl border border-[var(--rule)] bg-[var(--surface)] shadow-2xl">
        <div className="grid grid-cols-1 md:grid-cols-[1.2fr_1fr]">
          {/* Left Side — Branding & Stats */}
          <div className="relative flex flex-col justify-between p-8 sm:p-12">
            {/* Logo/Back link */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-mono text-[13px] font-bold tracking-[0.2em] text-[var(--fg)]">
                  FOUNDATION<span className="text-gold-500">.</span>
                </span>
              </div>
              <Link
                href="/compute"
                className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-[var(--text-accent)] transition-colors hover:text-gold-500"
              >
                <ArrowLeft className="h-3 w-3" /> Back to FCY
              </Link>
            </div>

            {/* Main Headline */}
            <div className="my-16 sm:my-24">
              <p className="mb-4 font-mono text-[10px] uppercase tracking-[0.3em] text-gold-500">
                FCY · Foundation Compute Yield · Early Access
              </p>
              <h1 className="font-serif text-4xl font-light leading-tight text-[var(--fg)] sm:text-6xl">
                Financing the <br />
                <em className="text-gold-500">AI super-cycle.</em>
              </h1>
              <p className="mt-6 max-w-md text-[14px] leading-relaxed text-[var(--text-accent)]">
                On-chain AI Infrastructure debt — GPU-backed financing, datacenter
                credit, neocloud lending. Real yield from interest and lease
                payments, not token emissions.
              </p>
            </div>

            {/* Bottom Stats */}
            <div className="grid grid-cols-3 gap-4 border-t border-[var(--rule)]/30 pt-8">
              <div>
                <p className="font-mono text-[20px] font-bold text-gold-500">17.0%</p>
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

          {/* Right Side — Features & Join */}
          <div className="flex flex-col justify-center border-l border-[var(--rule)]/30 bg-[var(--surface-strong)]/30 p-8 sm:p-12 backdrop-blur-md">
            <h2 className="mb-8 font-mono text-[11px] uppercase tracking-[0.25em] text-[var(--text-accent)]">
              What you get when you join
            </h2>

            <div className="space-y-8">
              <div className="flex items-start gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[var(--rule)] bg-[var(--surface)] text-gold-500 shadow-sm">
                  <IdCard className="h-5 w-5" />
                </div>
                <div>
                  <h4 className="font-serif text-[16px] font-medium text-[var(--fg)]">
                    Numbered membership card
                  </h4>
                  <p className="mt-1 text-[12px] leading-relaxed text-[var(--text-accent)]">
                    Alpha card with your X avatar, shareable image.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[var(--rule)] bg-[var(--surface)] text-gold-500 shadow-sm">
                  <Share2 className="h-5 w-5" />
                </div>
                <div>
                  <h4 className="font-serif text-[16px] font-medium text-[var(--fg)]">
                    Referral link + 20% fee share
                  </h4>
                  <p className="mt-1 text-[12px] leading-relaxed text-[var(--text-accent)]">
                    Earn on every friend&apos;s yield, paid in USDC.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[var(--rule)] bg-[var(--surface)] text-gold-500 shadow-sm">
                  <Bell className="h-5 w-5" />
                </div>
                <div>
                  <h4 className="font-serif text-[16px] font-medium text-[var(--fg)]">
                    Launch notification
                  </h4>
                  <p className="mt-1 text-[12px] leading-relaxed text-[var(--text-accent)]">
                    First to deposit when FCY goes live.
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-12 pt-8 border-t border-[var(--rule)]/30">
              <SignInWithX
                callbackURL="/alpha/reveal"
                label="Connect X to join"
                className="w-full"
              />
              <p className="mt-4 text-center font-mono text-[9px] uppercase tracking-widest text-[var(--text-accent)]">
                🔒 Read-only · never posts without permission
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
