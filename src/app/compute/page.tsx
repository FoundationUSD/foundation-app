"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight, ChevronDown, Cpu, Server, Zap } from "lucide-react";
import {
  COMPUTE_CONSTITUENTS,
  COMPUTE_FEES,
  getSpecBlendedApy,
  type ComputeConstituentSpec,
  type ComputeConstituentId,
} from "@/lib/integrations/compute";
import { SubscribeForm } from "@/components/SubscribeForm";

const CONSTITUENT_COLORS: Record<
  ComputeConstituentId,
  { stroke: string; fill: string; soft: string; text: string }
> = {
  gaib: {
    stroke: "rgb(16, 185, 129)",
    fill: "rgb(16, 185, 129)",
    soft: "rgba(16, 185, 129, 0.10)",
    text: "rgb(5, 150, 105)",
  },
  susdai: {
    stroke: "rgb(59, 130, 246)",
    fill: "rgb(59, 130, 246)",
    soft: "rgba(59, 130, 246, 0.10)",
    text: "rgb(29, 78, 216)",
  },
  gigawatt: {
    stroke: "rgb(168, 85, 247)",
    fill: "rgb(168, 85, 247)",
    soft: "rgba(168, 85, 247, 0.10)",
    text: "rgb(126, 34, 206)",
  },
};

const CONSTITUENT_ICON: Record<ComputeConstituentId, typeof Cpu> = {
  gaib: Server,
  susdai: Cpu,
  gigawatt: Zap,
};

export default function ComputePage() {
  const blendedApy = getSpecBlendedApy();
  const active = COMPUTE_CONSTITUENTS.filter((c) => !c.roadmap);
  const roadmap = COMPUTE_CONSTITUENTS.filter((c) => c.roadmap);

  return (
    <div className="fdn-page">
      {/* Header — frieze meander strip, matches /awy */}
      <div className="relative mb-6 overflow-hidden rounded-xl sm:mb-8">
        <div
          className="art-layer art-strip"
          style={{ backgroundImage: "url('/assets/art/strips/Friezemeanderpattern.png')" }}
        />
        <div className="art-content relative flex items-end justify-between gap-4 px-1 py-4 sm:px-2 sm:py-5">
          <div>
            <p className="section-label mb-1 sm:mb-2">FOUNDATION</p>
            <h1 className="page-heading text-xl sm:text-2xl">
              Compute <em>Yield</em>
            </h1>
            <p className="mt-1 max-w-xl text-sm text-[var(--text-accent)]">
              The financing layer for the AI super-cycle. A rules-based index of
              on-chain AI compute infrastructure debt — yield from real financing
              activity, not emissions.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <Link href="/" className="fnd-nav-link">
              Invest <ArrowUpRight className="h-3 w-3" />
            </Link>
          </div>
        </div>
      </div>

      {/* Hero — Atlas titan holding the AI compute world */}
      <div className="art-frame infra-card relative mb-8 overflow-hidden p-6 sm:p-8">
        <div
          className="art-layer art-thumb"
          style={{ backgroundImage: "url('/assets/art/atlasForAWYamplified.png')" }}
        />
        <div className="art-noise" />

        <div className="art-content relative">
          <div className="mb-7 flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between sm:gap-8">
            <div className="max-w-xl">
              <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-gold-500">
                Foundation Compute Yield · FCY
              </p>
              <h3 className="page-heading mb-3 text-xl sm:text-[1.75rem]">
                Financing the <em>AI capex boom.</em>
              </h3>
              <p className="text-[13px] leading-relaxed text-[var(--text-accent)] sm:text-sm">
                Hyperscaler AI capex is on track to clear $700B–$1T+ this cycle. The
                obvious trade is buying NVIDIA. The other side is financing the
                hardware. FCY is the first index fund tracking yield from on-chain AI
                infrastructure debt — GPU-backed financing, datacenter credit, and
                neocloud lending — in a single USDC-denominated vault.
              </p>
            </div>
            <div className="flex shrink-0 flex-col items-start gap-1 sm:items-end sm:text-right">
              <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-gold-500">
                Target APY
              </p>
              <span className="font-mono text-3xl font-bold tracking-[-0.03em] text-emerald-500 sm:text-[2.75rem]">
                {blendedApy.toFixed(2)}%
              </span>
              <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.2em] text-amber-600">
                Coming Soon
              </span>
            </div>
          </div>

          {/* At-a-glance constituents grid */}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {COMPUTE_CONSTITUENTS.map((c) => {
              const color = CONSTITUENT_COLORS[c.id];
              const Icon = CONSTITUENT_ICON[c.id];
              return (
                <div
                  key={c.id}
                  className="relative flex items-center gap-2.5 overflow-hidden rounded-lg border border-[var(--rule)] bg-[var(--surface)]/60 px-3 py-2.5"
                >
                  <span
                    className="absolute left-0 top-0 h-full w-0.5"
                    style={{ background: color.fill }}
                  />
                  <div
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md"
                    style={{ background: color.soft, color: color.text }}
                  >
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="font-mono text-[12px] font-semibold tracking-tight text-[var(--fg)]">
                      {c.asset}
                    </div>
                    <div className="font-mono text-[10px] tracking-wider text-[var(--text-accent)]">
                      {c.roadmap ? "Roadmap" : `${(c.weightBps / 100).toFixed(0)}% · ${c.issuer}`}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Thesis */}
      <ThesisSection />

      {/* Constituents */}
      <ConstituentsSection active={active} roadmap={roadmap} />

      {/* Methodology */}
      <MethodologySection />

      {/* Waitlist banner */}
      <WaitlistBanner />

      {/* FAQ */}
      <FaqSection />
    </div>
  );
}

/* ============================================================
   Sections
   ============================================================ */

function ThesisSection() {
  return (
    <section className="mb-10">
      <div className="mb-4 flex items-baseline justify-between">
        <h2 className="section-label">The Thesis</h2>
        <span className="font-mono text-[10px] text-[var(--text-accent)]">why compute credit</span>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <ThesisCard
          n="01"
          title="$1T+ capex cycle"
          body="Hyperscaler AI capex is heading toward $700B+ annually, with cumulative spend through 2030 estimated at $3T–$7T across compute, datacenters, and power."
        />
        <ThesisCard
          n="02"
          title="The financing gap"
          body="Banks are still learning to underwrite GPU-backed loans. That gap is being filled by private credit — and increasingly, on-chain."
        />
        <ThesisCard
          n="03"
          title="Yield is structurally higher"
          body="Lending to a hyperscaler earns IG bond yields. Lending into smaller compute operators and GPU-backed financing pays materially more — that spread is the FCY yield."
        />
      </div>
    </section>
  );
}

function ThesisCard({ n, title, body }: { n: string; title: string; body: string }) {
  return (
    <div className="rounded-xl border border-[var(--rule)] bg-[var(--surface)] p-5">
      <span className="mb-2 block font-mono text-[10px] tracking-[0.2em] text-gold-500">{n}</span>
      <h4 className="mb-2 font-serif text-base font-light text-[var(--fg)]">{title}</h4>
      <p className="text-[12px] leading-relaxed text-[var(--text-accent)]">{body}</p>
    </div>
  );
}

function ConstituentsSection({
  active,
  roadmap,
}: {
  active: ComputeConstituentSpec[];
  roadmap: ComputeConstituentSpec[];
}) {
  const blended = getSpecBlendedApy();

  return (
    <section className="mb-10">
      <div className="mb-4 flex items-baseline justify-between">
        <h2 className="section-label">Index Constituents · v1</h2>
        <span className="font-mono text-[10px] text-[var(--text-accent)]">
          Σ blended = {blended.toFixed(2)}%
        </span>
      </div>

      {/* Stacked allocation bar — only active constituents */}
      <div className="mb-4">
        <div className="flex h-3 w-full overflow-hidden rounded-full bg-[var(--rule)]">
          {active.map((c) => (
            <div
              key={c.id}
              title={`${c.asset}: ${(c.weightBps / 100).toFixed(0)}%`}
              style={{
                width: `${c.weightBps / 100}%`,
                background: CONSTITUENT_COLORS[c.id].fill,
              }}
              className="transition-all"
            />
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {active.map((c) => (
          <ConstituentCard key={c.id} spec={c} />
        ))}
        {roadmap.map((c) => (
          <ConstituentCard key={c.id} spec={c} />
        ))}
      </div>
    </section>
  );
}

function ConstituentCard({ spec }: { spec: ComputeConstituentSpec }) {
  const color = CONSTITUENT_COLORS[spec.id];
  const Icon = CONSTITUENT_ICON[spec.id];
  const weightPct = spec.weightBps / 100;

  return (
    <div
      className="relative overflow-hidden rounded-xl border bg-[var(--surface)] p-5 transition-all"
      style={{ borderColor: "var(--rule)" }}
    >
      <div
        className="absolute left-0 top-0 h-full w-1"
        style={{ background: color.stroke, opacity: spec.roadmap ? 0.4 : 1 }}
      />

      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
            style={{ background: color.soft, color: color.text }}
          >
            <Icon className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-baseline gap-2">
              <span className="font-mono text-base font-bold text-[var(--fg)]">{spec.asset}</span>
              {spec.roadmap ? (
                <span className="rounded-md border border-[var(--rule)] bg-[var(--surface-strong)] px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-wider text-[var(--text-accent)]">
                  Roadmap
                </span>
              ) : (
                <span
                  className="rounded-md px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-wider"
                  style={{ background: color.soft, color: color.text }}
                >
                  v1 · {weightPct.toFixed(0)}%
                </span>
              )}
            </div>
            <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--text-accent)]">
              {spec.issuer} · {spec.riskDriver}
            </p>
          </div>
        </div>
      </div>

      <p className="mb-4 text-[12px] leading-relaxed text-[var(--text-accent)]">{spec.description}</p>

      {!spec.roadmap && (
        <div className="flex items-center justify-between border-t border-[var(--rule)] pt-3">
          <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--text-accent)]">
            APY range
          </div>
          <div className="font-mono text-sm">
            <span className="font-semibold text-[var(--fg)]">{spec.baseApy.toFixed(1)}%</span>
            <span className="mx-1 text-[var(--text-accent)]">→</span>
            <span className="text-[var(--fg)]">{spec.maxApy.toFixed(1)}%</span>
          </div>
        </div>
      )}

      {spec.href && !spec.roadmap && (
        <a
          href={spec.href}
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-wider text-[var(--text-accent)] hover:text-[var(--fg)]"
        >
          Read constituent docs <ArrowUpRight className="h-3 w-3" />
        </a>
      )}
    </div>
  );
}

function MethodologySection() {
  const mgmtPct = (COMPUTE_FEES.managementBps / 100).toFixed(0);
  const mintRedeemPct = (COMPUTE_FEES.mintRedeemBps / 100).toFixed(2);

  return (
    <section className="mb-10 grid grid-cols-1 gap-4 md:grid-cols-2">
      <div className="rounded-xl border border-[var(--rule)] bg-[var(--surface)] p-6">
        <h2 className="section-label mb-4">Methodology</h2>
        <ul className="space-y-3 text-[12px] leading-relaxed text-[var(--text-accent)]">
          <li className="flex gap-3">
            <span className="mt-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-gold-500" />
            <span>
              <span className="text-[var(--fg)]">Headline yield excludes</span> token emissions,
              points, and promotional incentives.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="mt-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-gold-500" />
            <span>
              Tracks yield from <span className="text-[var(--fg)]">interest payments, lease
              payments, debt repayments,</span> and compute-linked credit returns.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="mt-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-gold-500" />
            <span>
              Allocation is rebalanced per published rules; concentration caps are disclosed.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="mt-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-gold-500" />
            <span>
              Constituents must meet underwriting standards: verifiable on-chain financing activity,
              transparent NAV, sufficient liquidity for vault entry/exit.
            </span>
          </li>
        </ul>
      </div>

      <div className="rounded-xl border border-[var(--rule)] bg-[var(--surface)] p-6">
        <h2 className="section-label mb-4">Fees</h2>
        <div className="space-y-4">
          <div className="flex items-baseline justify-between border-b border-[var(--rule)] pb-3">
            <div>
              <div className="font-mono text-[12px] font-semibold text-[var(--fg)]">
                Management fee
              </div>
              <div className="font-mono text-[10px] tracking-wider text-[var(--text-accent)]">
                Charged on yield, not principal
              </div>
            </div>
            <span className="font-mono text-2xl font-bold tracking-[-0.02em] text-[var(--fg)]">
              {mgmtPct}%
            </span>
          </div>
          <div className="flex items-baseline justify-between">
            <div>
              <div className="font-mono text-[12px] font-semibold text-[var(--fg)]">
                Mint / redeem
              </div>
              <div className="font-mono text-[10px] tracking-wider text-[var(--text-accent)]">
                One-time, on each direction
              </div>
            </div>
            <span className="font-mono text-2xl font-bold tracking-[-0.02em] text-[var(--fg)]">
              {mintRedeemPct}%
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}

function WaitlistBanner() {
  return (
    <section className="mb-10">
      <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-6 sm:p-8">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-[1fr_360px]">
          <div>
            <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-amber-700 dark:text-amber-400">
              Launching soon
            </p>
            <h3 className="page-heading mb-3 text-xl sm:text-2xl">
              Join the <em>FCY waitlist.</em>
            </h3>
            <p className="text-[13px] leading-relaxed text-[var(--text-accent)] sm:text-sm">
              The Compute Vault is finalizing its multisig deployment and audit pass.
              Drop your email to get early-access notification, methodology updates, and the
              vault address the moment we go live. AWY remains live in the meantime.
            </p>
          </div>
          <div className="rounded-xl border border-[var(--rule)] bg-[var(--surface)] p-4">
            <SubscribeForm variant="waitlist" />
          </div>
        </div>
      </div>
    </section>
  );
}

function FaqSection() {
  const faqs = [
    {
      q: "How is this different from buying NVIDIA stock?",
      a: "Public AI equity gives you exposure to earnings multiples and trades on sentiment. FCY gives you a fixed-income claim on the financing of physical compute infrastructure. The cash flow source is interest, lease, and debt repayments — not earnings growth — so the return profile is uncorrelated with the public AI trade.",
    },
    {
      q: "Who is the borrower?",
      a: "FCY does not lend directly in v1. It allocates into established on-chain compute-credit primitives — GAIB and sUSDai — which underwrite GPU-backed loans, datacenter financing facilities, and neocloud operators. As Foundation expands, direct origination is on the roadmap.",
    },
    {
      q: "What about token emissions and points?",
      a: "Headline FCY yield excludes them. Methodology tracks yield from real financing activity only. Any incentives received by the underlying constituents are disclosed separately and do not flow into the headline number.",
    },
    {
      q: "Why coming soon?",
      a: "The vault's Squads multisig and Token-2022 fcyUSD mint are deploying alongside an audit pass. Email updates will go out the moment FCY is live. The published methodology and constituent set above are final.",
    },
  ];

  return (
    <section className="mb-10">
      <h2 className="section-label mb-4">FAQ</h2>
      <div className="space-y-2">
        {faqs.map((f, i) => (
          <FaqRow key={i} q={f.q} a={f.a} />
        ))}
      </div>
    </section>
  );
}

function FaqRow({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border border-[var(--rule)] bg-[var(--surface)]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
      >
        <span className="font-serif text-[15px] font-light text-[var(--fg)]">{q}</span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-[var(--text-accent)] transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      <div
        className={`grid overflow-hidden transition-[grid-template-rows] duration-300 ease-out ${
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        }`}
      >
        <div className="min-h-0">
          <p className="px-5 pb-4 text-[12px] leading-relaxed text-[var(--text-accent)]">{a}</p>
        </div>
      </div>
    </div>
  );
}
