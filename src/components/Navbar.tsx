"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { WalletButton } from "@/components/WalletButton";

export function Navbar() {
  const pathname = usePathname();

  const links = [
    { href: "/", label: "Vaults" },
    { href: "/portfolio", label: "Portfolio" },
  ];

  return (
    <nav className="glass fixed top-0 right-0 left-0 z-50 border-b border-white/[0.06]">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-3 transition-opacity hover:opacity-80">
          <Image
            src="/partners/rounded-nobg.png"
            alt="Foundation"
            width={28}
            height={28}
            className="opacity-80"
          />
          <span className="font-serif text-lg font-light tracking-wide text-foreground">
            Foundation
          </span>
        </Link>

        {/* Nav links + wallet */}
        <div className="flex items-center gap-6">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`font-mono text-[11px] uppercase tracking-[0.12em] transition-colors ${
                pathname === link.href
                  ? "text-gold-400"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {link.label}
            </Link>
          ))}
          <WalletButton />
        </div>
      </div>
    </nav>
  );
}
