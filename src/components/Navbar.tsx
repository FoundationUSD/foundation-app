"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { WalletButton } from "@/components/WalletButton";
import { ThemeToggle } from "@/components/ThemeToggle";

export function Navbar() {
  const pathname = usePathname();

  const links = [
    { href: "/", label: "Vaults" },
    { href: "/portfolio", label: "Portfolio" },
  ];

  return (
    <nav className="fixed top-0 right-0 left-0 z-50 border-b border-[var(--border-color)] bg-[var(--bg)]/80 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-3 transition-opacity hover:opacity-80">
          <Image
            src="/partners/rounded-nobg.png"
            alt="Foundation"
            width={24}
            height={24}
            className="opacity-80"
          />
          <span className="font-serif text-base font-light tracking-wide text-[var(--fg)]">
            Foundation
          </span>
        </Link>

        {/* Nav links + theme + wallet */}
        <div className="flex items-center gap-5">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`font-mono text-[10px] uppercase tracking-[0.12em] transition-colors ${
                pathname === link.href
                  ? "text-gold-500"
                  : "text-[var(--muted)] hover:text-[var(--fg)]"
              }`}
            >
              {link.label}
            </Link>
          ))}
          <ThemeToggle />
          <WalletButton />
        </div>
      </div>
    </nav>
  );
}
