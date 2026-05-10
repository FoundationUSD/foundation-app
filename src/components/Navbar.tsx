"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useWallet } from "@solana/wallet-adapter-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { IconWalletMoney, IconCoin, IconSafe } from "@/components/Icons";
import { Cpu } from "lucide-react";
import { WalletButton } from "@/components/WalletButton";
import { NotificationBell } from "@/components/NotificationBell";

// AWY is reachable from the Invest grid card and the footer; pulled from the
// header to keep top nav focused on the active product surface (Invest +
// Portfolio + Transparency). Compute tab will land on the merge with ft/compute.
const NAV_TABS = [
  { key: "portfolio", label: "Portfolio", Icon: IconWalletMoney, path: "/portfolio" },
  { key: "invest", label: "Invest", Icon: IconCoin, path: "/" },
  { key: "compute", label: "Compute", Icon: Cpu, path: "/compute" },
  { key: "transparency", label: "Transparency", Icon: IconSafe, path: "/transparency" },
];

export function Navbar() {
  const pathname = usePathname();
  const wallet = useWallet();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [mobileOpen]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return (
    <>
      {/* Main Header */}
      <header className="fdn-header">
        <div className="fdn-header__inner mx-auto flex max-w-[1320px] items-center gap-6">
          {/* Logo */}
          <Link href="/" className="fnd-header__logo flex shrink-0 items-center gap-2.5">
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

          {/* Desktop Nav */}
          <nav className="fnd-header__nav flex flex-1 items-center gap-0.5">
            {NAV_TABS.map((tab) => {
              const isActive =
                (tab.key === "portfolio" && pathname === "/portfolio") ||
                (tab.key === "invest" && (pathname === "/" || pathname.startsWith("/strategy"))) ||
                (tab.key === "compute" && pathname.startsWith("/compute")) ||
                (tab.key === "transparency" && pathname === "/transparency");
              return (
                <Link
                  key={tab.key}
                  href={tab.path}
                  className={`fdn-header__nav-link flex items-center gap-2 text-[13px] font-medium ${
                    isActive ? "fdn-header__nav-link--active" : ""
                  }`}
                >
                  <tab.Icon className="fdn-header__nav-icon" />
                  <span>{tab.label}</span>
                </Link>
              );
            })}
          </nav>

          {/* Right Actions */}
          <div className="fnd-header__actions flex items-center gap-2 shrink-0">
            <NotificationBell />
            <ThemeToggle />
            {wallet.connecting ? (
              <button className="fdn-header__connect-btn flex items-center gap-2 px-4 text-[11px] uppercase tracking-wider">
                <span className="h-3 w-3 animate-spin rounded-full border-2 border-gold-400/60 border-t-gold-400" />
                Connect
              </button>
            ) : (
              <WalletButton />
            )}

            {/* Hamburger */}
            <button
              className="fdn-header__hamburger shrink-0"
              onClick={() => setMobileOpen((v) => !v)}
              aria-label="Toggle menu"
            >
              <span className={`block h-0.5 w-4 bg-[var(--hamburger)] transition-all duration-300 ${mobileOpen ? "translate-y-2 rotate-45" : ""}`} />
              <span className={`block h-0.5 w-4 bg-[var(--hamburger)] transition-all duration-300 ${mobileOpen ? "opacity-0" : ""}`} />
              <span className={`block h-0.5 w-4 bg-[var(--hamburger)] transition-all duration-300 ${mobileOpen ? "-translate-y-2 -rotate-45" : ""}`} />
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Menu */}
      {mobileOpen && mounted && (
        <>
          <div className="fixed inset-0 z-[200] bg-black/40 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <div className="fdn-mobile-menu">
            <div className="fdn-mobile-menu__header">
              <Image src="/partners/rounded-bg.png" alt="Foundation" width={32} height={32} className="fdn-logo-light" />
              <Image src="/partners/rounded-nobg.png" alt="Foundation" width={32} height={32} className="fdn-logo-dark" />
              <button className="fnd-mobile-close" onClick={() => setMobileOpen(false)}>
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <nav className="fdn-mobile-menu__nav">
              {NAV_TABS.map((tab) => {
                const isActive =
                  (tab.key === "portfolio" && pathname === "/portfolio") ||
                  (tab.key === "invest" && (pathname === "/" || pathname.startsWith("/strategy"))) ||
                    (tab.key === "transparency" && pathname === "/transparency");
                return (
                  <Link
                    key={tab.key}
                    href={tab.path}
                    onClick={() => setMobileOpen(false)}
                    className={`fdn-mobile-menu__link ${isActive ? "fdn-mobile-menu__link--active" : ""}`}
                  >
                    <tab.Icon className="fdn-mobile-menu__link-icon" />
                    <span>{tab.label}</span>
                  </Link>
                );
              })}
            </nav>
          </div>
        </>
      )}
    </>
  );
}
