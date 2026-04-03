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
    <nav className="fixed top-0 right-0 left-0 z-50 border-b border-white/[0.04] bg-[#060a12]/80 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-[1080px] items-center justify-between px-6">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2.5 transition-opacity hover:opacity-70">
          <Image
            src="/partners/rounded-nobg.png"
            alt="Foundation"
            width={22}
            height={22}
            className="opacity-70"
          />
          <span className="font-serif text-[15px] font-light tracking-wide text-foreground">
            Foundation
          </span>
        </Link>

        {/* Right side */}
        <div className="flex items-center gap-1">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.15em] transition-colors ${
                pathname === link.href
                  ? "text-foreground"
                  : "text-muted-foreground/60 hover:text-muted-foreground"
              }`}
            >
              {link.label}
            </Link>
          ))}
          <div className="ml-3 h-4 w-px bg-white/[0.06]" />
          <div className="ml-3">
            <WalletButton />
          </div>
        </div>
      </div>
    </nav>
  );
}
