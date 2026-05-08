import Link from "next/link";
import { Shield, Lock, Mail, FileCheck, AlertTriangle, ExternalLink } from "lucide-react";

export const metadata = {
  title: "Security · Foundation",
  description:
    "How Foundation protects user funds and information. Non-custodial Squads multisig vaults, on-chain verifiable. Security contact and disclosure policy.",
};

export default function SecurityPage() {
  return (
    <div className="fdn-page mx-auto max-w-4xl">
      <div className="art-frame relative mb-10 overflow-hidden rounded-2xl">
        <div
          className="art-layer art-hero"
          style={{ backgroundImage: "url('/assets/art/athenian_pediment_fragment.png')" }}
        />
        <div className="art-noise" />
        <div className="art-content relative px-6 py-16 text-center sm:py-20">
          <p className="section-label mx-auto mb-6 block w-fit">Security &amp; Disclosure</p>
          <h1 className="page-heading mb-4 text-[clamp(2.2rem,5vw,3.5rem)] leading-[1.08]">
            How Foundation <em>protects you</em>
          </h1>
          <p className="mx-auto max-w-xl text-sm text-[var(--muted)]">
            Foundation is a non-custodial application on Solana. Custody runs through Squads
            multisig. Every vault, every transaction, and every line of code is publicly
            verifiable.
          </p>
        </div>
      </div>

      <div className="mb-6 infra-card overflow-hidden">
        <div className="flex items-center gap-2 border-b border-[var(--rule)] px-6 py-4">
          <Shield className="h-4 w-4 text-gold-500" />
          <h2 className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--fg)]">
            What Foundation will never do
          </h2>
        </div>
        <ul className="divide-y divide-[var(--rule)] text-[13px]">
          {[
            "Ask for your seed phrase, private keys, or wallet password.",
            "Ask you to install software, browser extensions, or sign messages outside your wallet UI.",
            "Request payment information, credit cards, or banking details.",
            "Run airdrop claim flows, fake giveaways, or urgency-based promotions.",
            "Send unsolicited DMs on Twitter, Telegram, or Discord asking you to connect your wallet.",
          ].map((line) => (
            <li key={line} className="flex items-start gap-3 px-6 py-3">
              <span className="mt-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-rose-500" />
              <span className="text-[var(--text-accent)]">{line}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="mb-6 infra-card overflow-hidden">
        <div className="flex items-center gap-2 border-b border-[var(--rule)] px-6 py-4">
          <Lock className="h-4 w-4 text-gold-500" />
          <h2 className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--fg)]">
            How custody works
          </h2>
        </div>
        <div className="space-y-3 px-6 py-5 text-[13px] leading-relaxed text-[var(--text-accent)]">
          <p>
            Foundation does not hold your USDC. When you deposit, funds are routed into a
            <strong className="text-[var(--fg)]"> Squads Protocol v4 multisig</strong> on Solana
            mainnet that holds the underlying yield position. You receive a Token-2022 receipt
            (e.g. <code className="font-mono text-[12px]">awyUSD</code>,{" "}
            <code className="font-mono text-[12px]">soloUSD</code>) representing your share.
          </p>
          <p>
            Withdrawals burn your receipt token and return USDC to your wallet. Multisig
            addresses, vault PDAs, and receipt mints are all listed on{" "}
            <Link href="/transparency" className="text-gold-500 underline-offset-2 hover:underline">
              /transparency
            </Link>
            . You can verify every balance and every transaction on Solana Explorer.
          </p>
          <p>
            Wallet connection uses the official{" "}
            <code className="font-mono text-[12px]">@solana/wallet-adapter</code> SDK. Every
            transaction is signed in your own wallet (Phantom, Solflare, Backpack) after you
            review and approve it.
          </p>
        </div>
      </div>

      <div className="mb-6 infra-card overflow-hidden">
        <div className="flex items-center gap-2 border-b border-[var(--rule)] px-6 py-4">
          <FileCheck className="h-4 w-4 text-gold-500" />
          <h2 className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--fg)]">
            Audits &amp; status
          </h2>
        </div>
        <div className="grid grid-cols-1 divide-y divide-[var(--rule)] text-[13px] sm:grid-cols-2 sm:divide-x sm:divide-y-0">
          <div className="px-6 py-4">
            <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--muted)]">
              Smart contracts
            </p>
            <p className="text-[var(--fg)]">External audit pending — Q2 2026</p>
          </div>
          <div className="px-6 py-4">
            <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--muted)]">
              Multisig
            </p>
            <p className="text-[var(--fg)]">Squads Protocol v4 (audited)</p>
          </div>
          <div className="px-6 py-4">
            <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--muted)]">
              Receipt tokens
            </p>
            <p className="text-[var(--fg)]">SPL Token-2022 (audited extension)</p>
          </div>
          <div className="px-6 py-4">
            <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--muted)]">
              Stage
            </p>
            <p className="text-[var(--fg)]">Alpha — see disclaimer below</p>
          </div>
        </div>
      </div>

      <div className="mb-6 infra-card overflow-hidden">
        <div className="flex items-center gap-2 border-b border-[var(--rule)] px-6 py-4">
          <Mail className="h-4 w-4 text-gold-500" />
          <h2 className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--fg)]">
            Report a vulnerability
          </h2>
        </div>
        <div className="space-y-3 px-6 py-5 text-[13px] leading-relaxed text-[var(--text-accent)]">
          <p>
            If you discover a security issue, please report it privately before public disclosure.
            We commit to acknowledging reports within 48 hours.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <a
              href="mailto:v@fdnusd.com"
              className="inline-flex items-center gap-2 rounded-md border border-[var(--rule)] bg-[var(--surface-strong)] px-3 py-2 font-mono text-[12px] text-[var(--fg)] transition-colors hover:border-gold-500/50"
            >
              <Mail className="h-3.5 w-3.5" />
              v@fdnusd.com
            </a>
            <a
              href="/.well-known/security.txt"
              className="inline-flex items-center gap-2 rounded-md border border-[var(--rule)] bg-[var(--surface-strong)] px-3 py-2 font-mono text-[12px] text-[var(--fg)] transition-colors hover:border-gold-500/50"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              security.txt
            </a>
          </div>
          <p className="text-[12px] text-[var(--muted)]">
            Scope: <code className="font-mono">fdnusd.com</code>,{" "}
            <code className="font-mono">demo.fdnusd.com</code>,{" "}
            <code className="font-mono">app.fdnusd.com</code>, and Foundation&apos;s on-chain
            programs on Solana mainnet.
          </p>
        </div>
      </div>

      <div className="mb-10 flex items-start gap-3 rounded-md border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-[12px] leading-relaxed text-amber-700 dark:text-amber-400">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          <span className="font-mono uppercase tracking-wider">Foundation Alpha</span> — DeFi
          carries smart-contract, market, and counterparty risk. This site is for educational
          purposes and is not investment advice. Only deposit what you can afford to lose.
        </span>
      </div>
    </div>
  );
}
