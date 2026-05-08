"use client";

import { useEffect, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { Mail, Check, Loader2, Sparkles } from "lucide-react";

type SubscribeVariant = "newsletter" | "waitlist";

interface SubscribeFormProps {
  /**
   * "newsletter" — default footer/global signup. Generic copy ("Email updates").
   * "waitlist"   — FCY waitlist signup. Captures ?ref=CODE attribution and tags
   *                the subscriber row with source="fcy-waitlist" so we can
   *                migrate to better-auth Email OTP + referrals once that ships.
   */
  variant?: SubscribeVariant;
}

export function SubscribeForm({ variant = "newsletter" }: SubscribeFormProps) {
  const wallet = useWallet();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "sent" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [refCode, setRefCode] = useState<string | null>(null);

  // Capture ?ref=CODE for waitlist attribution. Stored alongside the subscriber
  // row; the better-auth referrals migration will read these on signup.
  // Read via window.location to avoid forcing pages that include this form
  // (e.g. footer on /awy) into a Suspense boundary for SSG. The ref code is a
  // soft-attribution signal — not needed for SSR or initial paint.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const ref = params.get("ref");
    if (ref) setRefCode(ref);
  }, []);

  const isWaitlist = variant === "waitlist";

  const submit = async (e: { preventDefault: () => void }) => {
    e.preventDefault();
    if (status === "loading") return;
    setStatus("loading");
    setError(null);
    try {
      const res = await fetch("/api/subscribers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          wallet: wallet.publicKey?.toBase58(),
          source: isWaitlist ? "fcy-waitlist" : "newsletter",
          ref: refCode,
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Subscription failed");
      setStatus("sent");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Subscription failed");
      setStatus("error");
    }
  };

  if (status === "sent") {
    return (
      <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-4 text-center">
        <div className="mx-auto mb-2 flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
          <Check className="h-4 w-4" />
        </div>
        <p className="text-sm text-[var(--fg)]">
          {isWaitlist ? "You're on the list" : "Check your inbox"}
        </p>
        <p className="mt-1 text-[11px] text-[var(--text-accent)]">
          {isWaitlist
            ? `We'll email ${email} when FCY goes live.`
            : `We sent a confirmation link to ${email}.`}
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="flex items-center gap-2">
        {isWaitlist ? (
          <Sparkles className="h-3.5 w-3.5 text-amber-500" />
        ) : (
          <Mail className="h-3.5 w-3.5 text-[var(--text-accent)]" />
        )}
        <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--text-accent)]">
          {isWaitlist ? "FCY waitlist" : "Email updates"}
        </span>
      </div>
      <p className="text-[11px] leading-relaxed text-[var(--text-accent)]">
        {isWaitlist
          ? "Get early-access notification, methodology updates, and the vault address the moment FCY is live."
          : "Material APY changes (>2%), new vault launches. Unsubscribe anytime."}
      </p>
      <input
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@example.com"
        className="w-full rounded-md border border-[var(--rule)] bg-[var(--surface)] px-3 py-2 font-mono text-[12px] text-[var(--fg)] placeholder:text-[var(--muted)] focus:border-gold-500/60 focus:outline-none"
      />
      <button
        type="submit"
        disabled={status === "loading" || !email}
        className="flex w-full items-center justify-center gap-1.5 rounded-md bg-[var(--navy)] px-4 py-2 font-mono text-[10px] uppercase tracking-wider text-white transition-opacity hover:opacity-90 disabled:opacity-40"
      >
        {status === "loading" ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
        {status === "loading"
          ? "Sending…"
          : isWaitlist
            ? "Join Waitlist"
            : "Subscribe"}
      </button>
      {refCode && isWaitlist && (
        <p className="font-mono text-[10px] tracking-wider text-[var(--text-accent)]">
          Referral: <span className="text-[var(--fg)]">{refCode}</span>
        </p>
      )}
      {error && <p className="text-[11px] text-rose-600 dark:text-rose-400">{error}</p>}
    </form>
  );
}
