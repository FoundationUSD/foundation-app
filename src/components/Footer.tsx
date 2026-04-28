"use client";

import Link from "next/link";
import { SubscribeForm } from "@/components/SubscribeForm";

export function Footer() {
  return (
    <footer className="relative z-10 mt-16 border-t border-[var(--rule)] bg-[var(--surface)]">
      <div className="mx-auto grid max-w-[1320px] gap-8 px-6 py-10 md:grid-cols-[1fr_360px]">
        <div className="space-y-3">
          <div className="font-serif text-base font-light tracking-[0.18em] uppercase text-[var(--fg)]">
            Foundation<span className="text-gold-500">.</span>
          </div>
          <p className="max-w-md text-[12px] leading-relaxed text-[var(--text-accent)]">
            Managed RWA yield on Solana. Squads-multisig vaults with Token-2022 receipt mints.
          </p>
          <div className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-[11px] text-[var(--text-accent)]">
            <Link href="/" className="hover:text-[var(--fg)]">Invest</Link>
            <Link href="/portfolio" className="hover:text-[var(--fg)]">Portfolio</Link>
            <Link href="/risk" className="hover:text-[var(--fg)]">Risk</Link>
            <Link href="/transparency" className="hover:text-[var(--fg)]">Transparency</Link>
            <Link href="/amplify" className="hover:text-[var(--fg)]">Amplify</Link>
          </div>
          <div className="mt-3 flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-[10px] leading-relaxed text-amber-700 dark:text-amber-400">
            <span className="mt-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
            <span>
              <span className="font-mono uppercase tracking-wider">Foundation Alpha</span> — this version is for
              educational purposes only. Not investment advice.
            </span>
          </div>
        </div>
        <div className="rounded-xl border border-[var(--rule)] bg-[var(--surface-strong)] p-4">
          <SubscribeForm />
        </div>
      </div>
    </footer>
  );
}
