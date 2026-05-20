"use client";

/**
 * Beta footer — waitlist-only build.
 * Product links (Invest/Compute/AWY/Portfolio/Transparency/Security) and the
 * Subscribe form are stripped on ft/beta; the only CTA on this build is the
 * waitlist itself.
 */
export function Footer() {
  return (
    <footer className="relative z-10 mt-16 border-t border-[var(--rule)] bg-[var(--surface)]">
      <div className="mx-auto flex max-w-[1320px] flex-col gap-4 px-6 py-8 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="font-serif text-base font-light tracking-[0.18em] uppercase text-[var(--fg)]">
            Foundation<span className="text-gold-500">.</span>
          </div>
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--text-accent)]">
            Beta · Waitlist
          </span>
        </div>
        <p className="max-w-md text-[11px] leading-relaxed text-[var(--text-accent)]">
          Educational preview — not investment advice. The compute yield index
          opens to waitlist members first.
        </p>
      </div>
    </footer>
  );
}
