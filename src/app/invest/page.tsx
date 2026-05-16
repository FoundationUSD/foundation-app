"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useWallet } from "@solana/wallet-adapter-react";
import { ArrowUpRight, ArrowRight, ArrowLeft } from "lucide-react";
import { useStrategies } from "@/hooks/useStrategies";
import { VaultDetail } from "@/components/VaultDetail";
import { WalletModal } from "@/components/WalletModal";
import { formatAPY, formatUsdCompact } from "@/lib/utils";
import type { FoundationVault } from "@/lib/vaults";

const PROTOCOL_LOGO: Record<string, string> = {
  solomon: "/partners/solomon-circle.png",
  kamino: "/partners/prime.png",
  oro: "/partners/oro.png",
  awy: "/assets/awy.png",
  // Compute uses the Foundation rounded logo until a dedicated FCY mark exists.
  compute: "/partners/rounded-nobg.png",
};

/**
 * Classical art piece paired with each vault. The art lives behind the card
 * header as a heavily-treated atmospheric layer (see .art-thumb in globals.css).
 *   Solomon → Hermes (god of trade)
 *   Kamino  → Athenian pediment fragment (institutional credit / civic)
 *   Oro     → Plutus / coin hoard (gold)
 *   AWY     → Demeter (harvest, the four-leg basket)
 */
const PROTOCOL_ART: Record<string, string> = {
  solomon: "/assets/art/HermesForSolomon.png",
  kamino: "/assets/art/athenian_pediment_fragment.png",
  oro: "/assets/art/coinhoardForOro.png",
  awy: "/assets/art/GoddessDemeterforAWY.png",
  // Compute → Atlas (titan bearing the world): the financing layer carrying the AI build-out.
  compute: "/assets/art/atlasForAWYamplified.png",
};

export default function HomePage() {
  const { strategies, loading } = useStrategies();
  const router = useRouter();
  const wallet = useWallet();
  const [walletModalOpen, setWalletModalOpen] = useState(false);
  const [selectedVault, setSelectedVault] = useState<FoundationVault | null>(null);
  const [activeFilter, setActiveFilter] = useState<"all" | "foundation" | "partner">("all");

  // AWY and Compute have their own dedicated detail routes — composite/index products
  // with full methodology pages. Other vaults render inline via VaultDetail.
  const goToVault = (v: FoundationVault) => {
    if (v.protocol === "awy") {
      router.push("/awy");
      return;
    }
    if (v.protocol === "compute") {
      router.push("/compute");
      return;
    }
    setSelectedVault(v);
  };

  // Scroll to top when entering / leaving detail view.
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [selectedVault]);

  // AWY 2x and 3x are leverage *settings* on the AWY product, not separate
  // SKUs. They live on-chain (their own vaults + receipt mints) but are
  // routed through the single AWY card on /awy. Hide from the invest grid.
  const surfacedStrategies = strategies.filter(
    (v) => v.id !== "fdn-awy-2x" && v.id !== "fdn-awy-3x",
  );
  // Filter by category. Foundation = AWY (Foundation-composed basket); Partner =
  // pass-through partner integrations (Solomon, Kamino, Oro). "All" shows everything.
  const visibleStrategies =
    activeFilter === "all" ? surfacedStrategies : surfacedStrategies.filter((v) => v.category === activeFilter);
  const activeStrategies = visibleStrategies.filter((v) => v.status === "live");
  const comingSoonStrategies = visibleStrategies.filter((v) => v.status === "coming_soon");

  // Not connected — landing
  if (!wallet.connected) {
    return (
      <div className="fdn-page">
        {/* Hero — caryatid colonnade backdrop, gold hairline frame */}
        <div className="art-frame relative animate-fade-up mb-16 overflow-hidden rounded-2xl sm:mb-24">
          <div
            className="art-layer art-hero"
            style={{ backgroundImage: "url('/assets/art/caryatid_colonnade.png')" }}
          />
          <div className="art-noise" />
          <div className="art-content relative px-6 py-20 text-center sm:py-28">
            <div className="mx-auto mb-6 h-10 w-10 animate-float opacity-60 sm:mb-8 sm:h-12 sm:w-12">
              <Image src="/partners/rounded-nobg.png" alt="Foundation" width={48} height={48} />
            </div>
            <h1 className="page-heading mb-4 text-2xl sm:mb-5 sm:text-[3.2rem]">
              The financing layer
              <br />
              <em>for the AI super-cycle.</em>
            </h1>
            <p className="mx-auto mb-8 max-w-xl text-sm leading-relaxed text-[var(--text-accent)] sm:mb-10 sm:text-[15px]">
              Foundation builds index funds and managed vaults for on-chain yield.
              Deposit USDC, hold an appreciating receipt token, earn from real
              financing activity — not emissions. Custody runs through Squads
              multisig. Withdrawals are open at any time.
            </p>
            <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link href="/compute" className="btn-primary inline-flex items-center gap-2">
                Explore Compute Vault <ArrowRight className="h-3.5 w-3.5" />
              </Link>
              <button
                onClick={() => setWalletModalOpen(true)}
                className="inline-flex items-center gap-2 rounded-md border border-[var(--rule)] bg-[var(--surface)] px-4 py-2.5 font-mono text-[11px] uppercase tracking-wider text-[var(--fg)] transition-colors hover:bg-[var(--surface-strong)]"
              >
                Connect Wallet
              </button>
            </div>
          </div>
        </div>

        {/* How It Works — vault-agnostic so it covers both AWY and FCY */}
        <div className="mb-14 sm:mb-20">
          <h2 className="section-label mb-6 sm:mb-10">How It Works</h2>
          <div className="grid gap-6 sm:gap-10 md:grid-cols-4">
            {[
              {
                n: "01",
                title: "Deposit USDC",
                desc: "Pick a vault — Compute Yield (FCY) or All-Weather Yield (AWY) — and deposit USDC.",
              },
              {
                n: "02",
                title: "Foundation Routes",
                desc: "A Squads multisig holds the deposit and routes it into the underlying strategy per a published methodology.",
              },
              {
                n: "03",
                title: "Yield Accrues",
                desc: "Your receipt token (fcyUSD, awyUSD, …) grows automatically via the Token-2022 InterestBearing extension.",
              },
              {
                n: "04",
                title: "Withdraw Anytime",
                desc: "Burn the receipt token to redeem USDC with accrued yield. No lockup on liquid legs.",
              },
            ].map((item) => (
              <div key={item.n}>
                <span className="mb-2 block font-mono text-[10px] tracking-[0.2em] text-gold-500">{item.n}</span>
                <h4 className="mb-1.5 text-[13px] font-medium text-[var(--text-page)]">{item.title}</h4>
                <p className="text-[12px] leading-relaxed text-[var(--text-accent)]">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>

        <footer className="pt-4 text-center">
          <div className="fdn-divider mb-5" />
          <p className="font-mono text-[9px] uppercase tracking-[0.25em] text-[var(--text-accent)]">
            Foundation · Solana · Squads Multisig · Token-2022
          </p>
        </footer>

        <WalletModal open={walletModalOpen} onClose={() => setWalletModalOpen(false)} />
      </div>
    );
  }

  // Connected — vault grid
  return (
    <div className="fdn-page">
      {/* Page header with frieze meander strip */}
      <div className="relative mb-6 overflow-hidden rounded-xl sm:mb-8">
        <div
          className="art-layer art-strip"
          style={{ backgroundImage: "url('/assets/art/strips/Friezemeanderpattern.png')" }}
        />
        <div className="art-content relative flex items-end justify-between gap-4 px-1 py-4 sm:px-2 sm:py-5">
          <div>
            <p className="section-label mb-1 sm:mb-2">
              {selectedVault ? selectedVault.provider.toUpperCase() : "VAULT INFRASTRUCTURE"}
            </p>
            <h1 className="page-heading text-xl sm:text-2xl">
              {selectedVault ? selectedVault.assetName : <>Deposit <em>Strategies</em></>}
            </h1>
            {!selectedVault && (
              <p className="mt-1 max-w-xl text-sm text-[var(--text-accent)]">
                Institutional-grade yield vaults. Deposit USDC to access curated
                real-world asset strategies, custodied on chain through Squads
                multisig.
              </p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-3">
            {selectedVault && (
              <button onClick={() => setSelectedVault(null)} className="fnd-nav-link">
                <ArrowLeft className="h-3 w-3" /> Back
              </button>
            )}
            <Link href="/portfolio" className="fnd-nav-link">
              Portfolio <ArrowUpRight className="h-3 w-3" />
            </Link>
          </div>
        </div>
      </div>

      {selectedVault ? (
        <VaultDetail vault={selectedVault} />
      ) : (
        <>
          {/* Source Filter — glass pill container */}
          <div className="mb-8 inline-flex items-center gap-1 rounded-xl border border-[var(--rule)] bg-[var(--surface-strong)] p-1 shadow-[inset_0_1px_3px_rgba(0,0,0,0.02)]">
            {(["all", "foundation", "partner"] as const).map((filter) => (
              <button
                key={filter}
                onClick={() => setActiveFilter(filter)}
                className={`cursor-pointer rounded-lg px-4 py-2 text-xs font-semibold transition-all sm:text-sm ${
                  activeFilter === filter
                    ? "bg-[var(--surface)] text-[var(--fg)] shadow-sm ring-1 ring-[var(--rule)]"
                    : "text-[var(--muted)] hover:text-[var(--fg)] hover:bg-[var(--surface)]/50"
                }`}
              >
                {filter === "all" ? "All Vaults" : filter === "foundation" ? "Foundation" : "Partner"}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="skeleton h-64" />
              ))}
            </div>
          ) : activeStrategies.length === 0 && comingSoonStrategies.length === 0 ? (
            <p className="py-12 text-center font-mono text-sm text-[var(--text-accent)]">No vaults found</p>
          ) : (
            <>
              {activeStrategies.length > 0 && (
                <section className="mb-10">
                  <div className="mb-4 flex items-baseline justify-between">
                    <h2 className="section-label">Active Vaults</h2>
                    <span className="font-mono text-[10px] text-[var(--text-accent)]">
                      {activeStrategies.length} live
                    </span>
                  </div>
                  <div className="stagger-children grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {activeStrategies.map((v) => (
                      <VaultCard key={v.id} vault={v} onSelect={() => goToVault(v)} />
                    ))}
                  </div>
                </section>
              )}

              {comingSoonStrategies.length > 0 && (
                <section>
                  <div className="mb-4 flex items-baseline justify-between">
                    <h2 className="section-label">Coming Soon</h2>
                    <span className="font-mono text-[10px] text-[var(--text-accent)]">
                      {comingSoonStrategies.length} queued
                    </span>
                  </div>
                  <div className="stagger-children grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {comingSoonStrategies.map((v) => (
                      <VaultCard key={v.id} vault={v} onSelect={() => goToVault(v)} />
                    ))}
                  </div>
                </section>
              )}

            </>
          )}
        </>
      )}
    </div>
  );
}

/* ============================================================
   Vault Card — matches AppFrontend strategy card
   ============================================================ */
function VaultCard({ vault, onSelect }: { vault: FoundationVault; onSelect: () => void }) {
  const logo = PROTOCOL_LOGO[vault.protocol];
  const isLive = vault.status === "live";

  return (
    <div
      onClick={isLive ? onSelect : undefined}
      className={`strategy-card overflow-hidden border border-[var(--rule)] bg-[var(--surface-strong)] rounded-xl divide-y divide-[var(--rule)] transition-all ${
        isLive ? "cursor-pointer hover:-translate-y-0.5" : "cursor-not-allowed opacity-70"
      }`}
      data-glow
    >
      {/* Header — classical art behind the protocol logo + vault name */}
      <div className="relative overflow-hidden">
        {PROTOCOL_ART[vault.protocol] && (
          <>
            <div
              className="art-layer art-thumb"
              style={{ backgroundImage: `url('${PROTOCOL_ART[vault.protocol]}')` }}
            />
            <div className="art-noise" />
          </>
        )}
        <div className="art-content relative flex items-center gap-3 px-5 py-4">
          {logo ? (
            <Image src={logo} alt={vault.protocol} width={36} height={36} className="h-9 w-9 flex-shrink-0 object-contain" />
          ) : (
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-600 text-[9px] font-bold text-white">
              {vault.receiptToken.slice(0,4).toUpperCase()}
            </div>
          )}
          <div className="flex min-w-0 flex-col">
            <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-gold-500">
              {vault.provider}
            </span>
            <span className="truncate font-serif text-xl font-light tracking-[-0.01em] text-[var(--fg)]">
              {vault.assetName}
            </span>
          </div>
          {!isLive && (
            <span className="ml-auto rounded-full border border-[var(--rule)] bg-[var(--surface)] px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider text-gold-500">
              Soon
            </span>
          )}
        </div>
      </div>

      {/* Description */}
      <div className="px-5 py-4">
        <p className="line-clamp-2 text-sm text-[var(--muted)] leading-relaxed">
          {vault.description}
        </p>
      </div>

      {/* Data Grid */}
      <div className="divide-y divide-[var(--rule)]">
        {/* Row 1: APY + TVL */}
        <div className="grid grid-cols-2 divide-x divide-[var(--rule)]">
          <div className="flex flex-col items-start px-5 py-4">
            <span className="section-label mb-1.5 font-mono text-[10px] font-semibold tracking-[0.15em] text-[var(--gold)]">TARGET APY</span>
            <span className="font-mono text-3xl font-bold tracking-[-0.03em] text-emerald-500">
              {formatAPY(vault.apy)}
            </span>
          </div>
          <div className="flex flex-col items-start px-5 py-4">
            <span className="section-label mb-1.5 font-mono text-[10px] font-semibold tracking-[0.15em] text-[var(--gold)]">TVL</span>
            <span className="font-mono text-[1.4rem] font-bold tracking-wide text-[#334155] dark:text-[var(--fg)]">
              {formatUsdCompact(vault.tvlUsd)}
            </span>
          </div>
        </div>

        {/* Row 2: Curator + Type */}
        <div className="grid grid-cols-2 divide-x divide-[var(--rule)]">
          <div className="flex flex-col items-start px-5 py-4">
            <span className="section-label mb-1.5 font-mono text-[10px] font-semibold tracking-[0.15em] text-[var(--gold)]">CURATOR</span>
            <span className="font-mono text-sm font-bold text-[#334155] dark:text-[var(--fg)]">
              {vault.provider}
            </span>
          </div>
          <div className="flex flex-col items-start px-5 py-4">
            <span className="section-label mb-1.5 font-mono text-[10px] font-semibold tracking-[0.15em] text-[var(--gold)]">TYPE</span>
            <span className="font-mono text-xs font-bold leading-snug tracking-wide text-[#334155] dark:text-[var(--fg)] uppercase line-clamp-2">
              {vault.strategy}
            </span>
          </div>
        </div>
      </div>

      {/* CTA */}
      <div className="flex items-center justify-between px-5 py-4">
        <span className="text-xs font-mono tracking-wide text-[var(--muted)]">USDC</span>
        <span className={`text-xs font-mono font-bold tracking-[0.1em] uppercase transition-colors ${
          isLive ? "text-[#0f172a] dark:text-[var(--fg)]" : "text-[var(--muted)]"
        }`}>
          {isLive ? "View Details →" : "Coming Soon"}
        </span>
      </div>
    </div>
  );
}

