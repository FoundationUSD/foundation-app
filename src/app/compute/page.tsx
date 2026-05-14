"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight, ChevronDown, Cpu, Server, Zap } from "lucide-react";
import {
  COMPUTE_CONSTITUENTS,
  getSpecBlendedApy,
  type ComputeConstituentSpec,
  type ComputeConstituentId,
} from "@/lib/integrations/compute";
import { SignInWithX } from "@/components/SignInWithX";
import { WaitlistCounter } from "@/components/WaitlistCounter";

const CONSTITUENT_COLORS: Record<
  ComputeConstituentId,
  { fill: string; soft: string; text: string }
> = {
  gaib:     { fill: "rgb(16, 185, 129)",  soft: "rgba(16, 185, 129, 0.10)",  text: "rgb(5, 150, 105)" },
  susdai:   { fill: "rgb(59, 130, 246)",  soft: "rgba(59, 130, 246, 0.10)",  text: "rgb(29, 78, 216)" },
  gigawatt: { fill: "rgb(168, 85, 247)",  soft: "rgba(168, 85, 247, 0.10)",  text: "rgb(126, 34, 206)" },
};

const CONSTITUENT_ICON: Record<ComputeConstituentId, typeof Cpu> = {
  gaib:     Server,
  susdai:   Cpu,
  gigawatt: Zap,
};

export default function ComputePage() {
  const blendedApy = getSpecBlendedApy();
  const active = COMPUTE_CONSTITUENTS.filter((c) => !c.roadmap);
  const roadmap = COMPUTE_CONSTITUENTS.filter((c) => c.roadmap);

  return (
    <div className="fdn-page max-w-[920px]">
      {/* Page header strip */}
      <div className="relative mb-3 overflow-hidden rounded-xl">
        <div
          className="art-layer art-strip"
          style={{ backgroundImage: "url('/assets/art/strips/Friezemeanderpattern.png')" }}
        />
        <div className="art-content relative flex items-end justify-between gap-4 px-1 py-3 sm:px-2">
          <div>
            <p className="section-label mb-0.5">FOUNDATION</p>
            <h1 className="page-heading text-lg sm:text-xl">
              Compute <em>Yield</em>
            </h1>
          </div>
          <Link href="/" className="fnd-nav-link shrink-0">
            Invest <ArrowUpRight className="h-3 w-3" />
          </Link>
        </div>
      </div>

      <Hero blendedApy={blendedApy} />
      <StatStrip blendedApy={blendedApy} activeCount={active.length} />
      <ConstituentsSection active={active} roadmap={roadmap} />
      <ThesisSection />
      <FaqSection />
    </div>
  );
}

/* ============================================================
   Hero — Atlas art + waitlist + headline APY
   ============================================================ */

function Hero({ blendedApy }: { blendedApy: number }) {
  return (
    <section className="art-frame infra-card relative mb-6 overflow-hidden">
      <div
        className="art-layer art-thumb"
        style={{ backgroundImage: "url('/assets/art/atlasForAWYamplified.png')" }}
      />
      <div className="art-noise" />

      <div className="art-content relative grid grid-cols-1 gap-6 p-6 sm:gap-8 sm:p-8 md:grid-cols-[1fr_360px] md:items-start">
        <div>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-gold-500">
              FCY · Foundation Compute Yield
            </span>
            <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.18em] text-amber-600">
              Coming soon
            </span>
          </div>
          <h2 className="page-heading mb-3 text-2xl sm:text-[2rem]">
            Financing the <em>AI capex boom.</em>
          </h2>
          <p className="max-w-xl text-[13px] leading-relaxed text-[var(--text-accent)] sm:text-sm">
            A USDC-denominated index of on-chain AI compute infrastructure debt —
            GPU-backed financing, datacenter credit, neocloud lending. Yield comes
            from interest and lease payments, not emissions.
          </p>
          <div className="mt-5 inline-flex items-baseline gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-2">
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-emerald-700 dark:text-emerald-400">
              Target APY
            </span>
            <span className="font-mono text-2xl font-bold tracking-[-0.02em] text-emerald-500">
              {blendedApy.toFixed(2)}%
            </span>
          </div>
        </div>

        {/* Waitlist card — X (Twitter) sign-in only. Email auth lives at
            /api/auth/* via better-auth but isn't surfaced on /compute. */}
        <div className="rounded-xl border border-[var(--rule)] bg-[var(--surface)]/95 p-4 backdrop-blur-sm">
          <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.2em] text-gold-500">
            Get notified
          </p>
          <h3 className="mb-2 font-serif text-lg font-light text-[var(--fg)]">
            Join the FCY waitlist
          </h3>
          <p className="mb-4 text-[11px] leading-relaxed text-[var(--text-accent)]">
            Sign in with X to claim your spot. We&apos;ll generate your share
            banner + referral link. Earn 20% of our fee on friends&apos; yield
            when FCY launches.
          </p>
          <SignInWithX callbackURL="/alpha/welcome" />
          <div className="mt-3 border-t border-[var(--rule)] pt-3">
            <WaitlistCounter />
          </div>
        </div>
      </div>
    </section>
  );
}

/* ============================================================
   Stat strip — three big numbers under the hero
   ============================================================ */

function StatStrip({ blendedApy, activeCount }: { blendedApy: number; activeCount: number }) {
  const stats: { label: string; value: string; sub: string }[] = [
    { label: "AI Capex", value: "$1T+",                       sub: "annual run-rate by 2027" },
    { label: "Target APY", value: `${blendedApy.toFixed(1)}%`, sub: "blended, ex-emissions" },
    { label: "Constituents", value: `${activeCount}`,          sub: "rules-based index" },
  ];
  return (
    <section className="mb-10 grid grid-cols-3 gap-3">
      {stats.map((s) => (
        <div key={s.label} className="rounded-xl border border-[var(--rule)] bg-[var(--surface)] p-4 sm:p-5">
          <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-gold-500">{s.label}</p>
          <p className="mt-1 font-mono text-xl font-bold tracking-[-0.02em] text-[var(--fg)] sm:text-2xl">
            {s.value}
          </p>
          <p className="mt-0.5 font-mono text-[10px] tracking-wider text-[var(--text-accent)]">
            {s.sub}
          </p>
        </div>
      ))}
    </section>
  );
}

/* ============================================================
   Constituents
   ============================================================ */

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
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="section-label">Index constituents</h2>
        <span className="font-mono text-[10px] text-[var(--text-accent)]">
          Σ blended {blended.toFixed(2)}%
        </span>
      </div>

      {/* Stacked allocation bar — only active constituents */}
      <div className="mb-4 flex h-2 w-full overflow-hidden rounded-full bg-[var(--rule)]">
        {active.map((c) => (
          <div
            key={c.id}
            title={`${c.asset}: ${(c.weightBps / 100).toFixed(0)}%`}
            style={{
              width: `${c.weightBps / 100}%`,
              background: CONSTITUENT_COLORS[c.id].fill,
            }}
          />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {active.map((c) => <ConstituentCard key={c.id} spec={c} />)}
      </div>

      {roadmap.length > 0 && (
        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
          {roadmap.map((c) => <ConstituentCard key={c.id} spec={c} />)}
        </div>
      )}
    </section>
  );
}

function ConstituentCard({ spec }: { spec: ComputeConstituentSpec }) {
  const color = CONSTITUENT_COLORS[spec.id];
  const Icon = CONSTITUENT_ICON[spec.id];
  const weightPct = spec.weightBps / 100;

  return (
    <div className="relative overflow-hidden rounded-xl border border-[var(--rule)] bg-[var(--surface)] p-4 transition-all hover:border-[var(--rule)]/80">
      <span
        className="absolute left-0 top-0 h-full w-0.5"
        style={{ background: color.fill, opacity: spec.roadmap ? 0.4 : 1 }}
      />
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <div
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md"
            style={{ background: color.soft, color: color.text }}
          >
            <Icon className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="font-mono text-[13px] font-bold text-[var(--fg)]">{spec.asset}</div>
            <div className="font-mono text-[10px] uppercase tracking-wider text-[var(--text-accent)]">
              {spec.issuer}
            </div>
          </div>
        </div>
        {spec.roadmap ? (
          <span className="rounded-md border border-[var(--rule)] bg-[var(--surface-strong)] px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-[var(--text-accent)]">
            Roadmap
          </span>
        ) : (
          <span
            className="rounded-md px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-wider"
            style={{ background: color.soft, color: color.text }}
          >
            {weightPct.toFixed(0)}%
          </span>
        )}
      </div>

      <p className="mt-3 text-[11.5px] leading-relaxed text-[var(--text-accent)]">
        {spec.description}
      </p>

      {!spec.roadmap && (
        <div className="mt-3 flex items-center justify-between border-t border-[var(--rule)] pt-2">
          <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--text-accent)]">
            APY
          </span>
          <span className="font-mono text-[12px] text-[var(--fg)]">
            <span className="font-semibold">{spec.baseApy.toFixed(1)}%</span>
            <span className="mx-1 text-[var(--text-accent)]">→</span>
            {spec.maxApy.toFixed(1)}%
          </span>
        </div>
      )}

      {spec.href && !spec.roadmap && (
        <a
          href={spec.href}
          target="_blank"
          rel="noreferrer"
          className="mt-2 inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-wider text-[var(--text-accent)] hover:text-[var(--fg)]"
        >
          Docs <ArrowUpRight className="h-3 w-3" />
        </a>
      )}
    </div>
  );
}

/* ============================================================
   Thesis
   ============================================================ */

function ThesisSection() {
  return (
    <section className="mb-10">
      <h2 className="section-label mb-3">Why compute credit</h2>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <ThesisCard
          n="01"
          title="$1T+ capex cycle"
          body="Hyperscaler AI capex is heading toward $700B+ annually, with cumulative spend through 2030 estimated at $3–7T."
        />
        <ThesisCard
          n="02"
          title="Financing gap"
          body="Banks are still learning to underwrite GPU-backed loans. Private credit fills that gap — increasingly on-chain."
        />
        <ThesisCard
          n="03"
          title="Yield premium"
          body="Lending into smaller compute operators and GPU-backed financing pays materially more than IG bond yields."
        />
      </div>
    </section>
  );
}

function ThesisCard({ n, title, body }: { n: string; title: string; body: string }) {
  return (
    <div className="rounded-xl border border-[var(--rule)] bg-[var(--surface)] p-4">
      <span className="mb-2 block font-mono text-[10px] tracking-[0.2em] text-gold-500">{n}</span>
      <h4 className="mb-1.5 font-serif text-[15px] font-light text-[var(--fg)]">{title}</h4>
      <p className="text-[11.5px] leading-relaxed text-[var(--text-accent)]">{body}</p>
    </div>
  );
}

/* ============================================================
   FAQ
   ============================================================ */

function FaqSection() {
  const faqs = [
    {
      q: "How is this different from buying NVIDIA stock?",
      a: "Public AI equity gives you exposure to earnings multiples and trades on sentiment. FCY is a fixed-income claim on the financing of physical compute infrastructure. Cash flow comes from interest, lease, and debt repayments — uncorrelated with public AI sentiment.",
    },
    {
      q: "Who is the borrower?",
      a: "FCY does not lend directly in v1. It allocates into established on-chain compute-credit primitives (GAIB, sUSDai) which underwrite GPU-backed loans, datacenter financing, and neocloud operators. Direct origination is on the roadmap.",
    },
    {
      q: "What about token emissions and points?",
      a: "Headline FCY yield excludes them. Methodology tracks yield from real financing activity only. Any incentives received by underlying constituents are disclosed separately.",
    },
    {
      q: "Why coming soon?",
      a: "Squads multisig and Token-2022 fcyUSD mint are deploying alongside an audit pass. Email updates go out the moment FCY is live. Methodology and constituent set above are final.",
    },
  ];

  return (
    <section className="mb-10">
      <h2 className="section-label mb-3">FAQ</h2>
      <div className="space-y-2">
        {faqs.map((f, i) => <FaqRow key={i} q={f.q} a={f.a} />)}
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
        className="flex w-full items-center justify-between gap-3 px-5 py-3.5 text-left"
      >
        <span className="font-serif text-[14px] font-light text-[var(--fg)]">{q}</span>
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
