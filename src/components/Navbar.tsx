"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Users } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";

/**
 * Beta header — waitlist-only build.
 * Wallet, notifications, and the full product nav (Invest/Portfolio/Compute/
 * Transparency) are stripped on ft/beta; this build is just the waitlist flow.
 */
export function Navbar() {
  const pathname = usePathname();
  const isActive = pathname === "/" || pathname.startsWith("/alpha");

  return (
    <header className="fdn-header">
      <div className="fdn-header__inner mx-auto flex max-w-[1320px] items-center gap-6">
        <Link href="/alpha" className="fnd-header__logo flex shrink-0 items-center gap-2.5">
          <Image
            src="/partners/rounded-bg.png"
            alt="Foundation"
            width={36}
            height={36}
            className="h-9 w-9 fdn-logo-light"
          />
          <Image
            src="/partners/rounded-nobg.png"
            alt="Foundation"
            width={36}
            height={36}
            className="h-9 w-9 fdn-logo-dark"
          />
          <span className="font-serif text-[16px] font-light tracking-[0.18em] uppercase text-[var(--logo-text)]">
            Foundation<span className="text-gold-500">.</span>
          </span>
        </Link>

        <nav className="fnd-header__nav flex flex-1 items-center gap-0.5">
          <Link
            href="/alpha"
            className={`fdn-header__nav-link flex items-center gap-2 text-[13px] font-medium ${
              isActive ? "fdn-header__nav-link--active" : ""
            }`}
          >
            <Users className="fdn-header__nav-icon" />
            <span>Waitlist</span>
          </Link>
        </nav>

        <div className="fnd-header__actions flex items-center gap-2 shrink-0">
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
