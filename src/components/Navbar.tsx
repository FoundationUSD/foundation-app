"use client";

import Link from "next/link";
import dynamic from "next/dynamic";

const WalletMultiButton = dynamic(
  () => import("@solana/wallet-adapter-react-ui").then((m) => m.WalletMultiButton),
  { ssr: false },
);

export function Navbar() {
  return (
    <nav className="glass fixed top-0 right-0 left-0 z-50 border-b border-white/[0.06]">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-sm bg-gold-500">
            <span className="font-mono text-xs font-bold text-navy-950">F</span>
          </div>
          <span className="font-serif text-lg font-light tracking-wide text-foreground">
            Foundation
          </span>
        </Link>

        {/* Nav links */}
        <div className="flex items-center gap-8">
          <Link
            href="/"
            className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted transition-colors hover:text-foreground"
          >
            Vaults
          </Link>
          <Link
            href="/portfolio"
            className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted transition-colors hover:text-foreground"
          >
            Portfolio
          </Link>
          <WalletMultiButton
            style={{
              background: "rgba(255, 255, 255, 0.06)",
              backdropFilter: "blur(20px)",
              border: "1px solid rgba(255, 255, 255, 0.1)",
              borderRadius: "0",
              fontFamily: "var(--font-mono)",
              fontSize: "11px",
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              height: "36px",
              padding: "0 20px",
            }}
          />
        </div>
      </div>
    </nav>
  );
}
