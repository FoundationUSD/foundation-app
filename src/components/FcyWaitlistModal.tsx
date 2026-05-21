"use client";

/**
 * FCY waitlist modal — mirrors the landing site's ReferralModal flow.
 *
 *   Email → 6-digit OTP via Supabase auth-otp edge function (Resend delivery)
 *   → upserts into `waitlist` with a generated referral code → done screen
 *     shows the user's code + share link + Foundation CTA.
 *
 * Why duplicate the landing modal here: foundation-app is React/Next, the
 * landing is Vue. Both call the same Supabase function and write to the
 * same `waitlist` table, so referral attribution stays unified across surfaces.
 */

import { useEffect, useRef, useState } from "react";
import { Loader2, Check, X, ArrowLeft, Copy } from "lucide-react";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const OTP_ENDPOINT = `${SUPABASE_URL}/functions/v1/auth-otp`;

type Step = "email" | "code" | "done";

interface SignupResult {
  id: number | string;
  email: string;
  referralCode: string | null;
  isNew: boolean;
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** Pre-fill referral code (e.g. from ?ref=CODE). */
  initialReferralCode?: string;
}

async function callOtp(body: Record<string, unknown>) {
  const res = await fetch(OTP_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_ANON,
      Authorization: `Bearer ${SUPABASE_ANON}`,
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({ ok: false, error: "Network error" }));
  if (!res.ok || !data.ok) throw new Error(data.error || "Request failed");
  return data;
}

export function FcyWaitlistModal({ open, onClose, initialReferralCode }: Props) {
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [referralCode, setReferralCode] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(0);
  const [copied, setCopied] = useState(false);
  const [result, setResult] = useState<SignupResult | null>(null);
  const codeInputRef = useRef<HTMLInputElement | null>(null);

  // Reset state every time the modal opens; capture ?ref= from URL if present.
  useEffect(() => {
    if (!open) return;
    setStep("email");
    setCode("");
    setError(null);
    setCopied(false);
    setResult(null);
    if (initialReferralCode) {
      setReferralCode(initialReferralCode.toUpperCase());
    } else if (typeof window !== "undefined") {
      const r = new URL(window.location.href).searchParams.get("ref");
      if (r) setReferralCode(r.toUpperCase());
    }
  }, [open, initialReferralCode]);

  // Focus the code input as soon as step transitions.
  useEffect(() => {
    if (step === "code") codeInputRef.current?.focus();
  }, [step]);

  // Resend cooldown ticker.
  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((v) => v - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  const goBack = () => {
    setStep("email");
    setCode("");
    setError(null);
  };

  const submitEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email || !email.includes("@")) {
      setError("Enter a valid email");
      return;
    }
    setBusy(true);
    try {
      await callOtp({ action: "request", email });
      setStep("code");
      setResendIn(30);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setBusy(false);
    }
  };

  const submitCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!/^\d{6}$/.test(code)) {
      setError("Enter the 6-digit code");
      return;
    }
    setBusy(true);
    try {
      const data = await callOtp({
        action: "verify",
        email,
        code,
        referralCode: referralCode || undefined,
      });
      setResult(data.user as SignupResult);
      setStep("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    if (resendIn > 0) return;
    setBusy(true);
    setError(null);
    try {
      await callOtp({ action: "request", email });
      setResendIn(30);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setBusy(false);
    }
  };

  const shareUrl = result?.referralCode ? `https://fdnusd.com?ref=${result.referralCode}` : "";
  const twitterUrl = result?.referralCode
    ? `https://twitter.com/intent/tweet?text=${encodeURIComponent("On the Foundation Compute Yield waitlist — AI infrastructure debt, on-chain.")}&url=${encodeURIComponent(shareUrl)}`
    : "";

  const copy = async () => {
    if (!shareUrl) return;
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="relative w-full max-w-md rounded-xl border border-[var(--rule)] bg-[var(--surface)] p-6 shadow-2xl sm:p-8">
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="absolute right-3 top-3 rounded-md p-1.5 text-[var(--text-accent)] transition-colors hover:bg-[var(--surface-strong)] hover:text-[var(--fg)]"
        >
          <X className="h-4 w-4" />
        </button>

        {step === "email" && (
          <>
            <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--text-accent)]">
              Foundation · FCY waitlist
            </p>
            <h2 className="mb-2 font-serif text-2xl font-light text-[var(--fg)]">
              Reserve your spot
            </h2>
            <p className="mb-5 text-sm leading-relaxed text-[var(--text-accent)]">
              Get the FCY launch announcement and your referral code. Friends who
              join through you earn you <strong>20% of our fee on their yield</strong> —
              paid monthly in USDC. No tokens, no points.
            </p>

            <form className="space-y-3" onSubmit={submitEmail}>
              <label className="block">
                <span className="mb-1 block font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--text-accent)]">
                  Email
                </span>
                <input
                  type="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  className="w-full rounded-md border border-[var(--rule)] bg-[var(--surface-strong)] px-3 py-2.5 font-mono text-sm text-[var(--fg)] outline-none transition-colors focus:border-emerald-500/40"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={busy}
                  required
                />
              </label>

              <label className="block">
                <span className="mb-1 block font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--text-accent)]">
                  Referral code <em>(optional)</em>
                </span>
                <input
                  type="text"
                  placeholder="e.g. ABCD123"
                  maxLength={12}
                  className="w-full rounded-md border border-[var(--rule)] bg-[var(--surface-strong)] px-3 py-2.5 font-mono text-sm uppercase tracking-wider text-[var(--fg)] outline-none transition-colors focus:border-emerald-500/40"
                  value={referralCode}
                  onChange={(e) => setReferralCode(e.target.value.toUpperCase())}
                  disabled={busy}
                />
              </label>

              {error && <p className="font-mono text-[11px] text-red-500">{error}</p>}

              <button
                type="submit"
                disabled={busy || !email}
                className="aw-submit w-full"
              >
                {busy ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Sending…
                  </>
                ) : (
                  "Send 6-digit code"
                )}
              </button>
            </form>

            {/* Follow Foundation — pinned to the email step so first-time
                visitors see the social presence before committing to sign-up. */}
            <div className="mt-5 flex items-center justify-between gap-3 border-t border-[var(--rule)] pt-3">
              <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--text-accent)]">
                Follow Foundation
              </span>
              <div className="flex items-center gap-1.5">
                <a
                  href="https://t.me/fdnusd"
                  target="_blank"
                  rel="noopener"
                  aria-label="Foundation on Telegram"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-[var(--rule)] bg-[var(--surface-strong)] text-[var(--text-accent)] transition-colors hover:bg-[var(--surface)] hover:text-[var(--fg)]"
                >
                  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="currentColor" aria-hidden="true">
                    <path d="M9.78 18.65l.28-4.23 7.68-6.92c.34-.31-.07-.46-.52-.19L7.74 13.3 3.64 12c-.88-.25-.89-.86.2-1.3l15.97-6.16c.73-.33 1.43.18 1.15 1.3l-2.72 12.81c-.19.91-.74 1.13-1.5.71L12.6 16.3l-1.99 1.93c-.23.23-.42.42-.83.42z" />
                  </svg>
                </a>
                <a
                  href="https://x.com/fdn_labs"
                  target="_blank"
                  rel="noopener"
                  aria-label="Foundation on X"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-[var(--rule)] bg-[var(--surface-strong)] text-[var(--text-accent)] transition-colors hover:bg-[var(--surface)] hover:text-[var(--fg)]"
                >
                  <svg viewBox="0 0 24 24" className="h-3 w-3" fill="currentColor" aria-hidden="true">
                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                  </svg>
                </a>
              </div>
            </div>
          </>
        )}

        {step === "code" && (
          <>
            <button
              type="button"
              onClick={goBack}
              className="mb-3 inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--text-accent)] transition-colors hover:text-[var(--fg)]"
            >
              <ArrowLeft className="h-3 w-3" /> Back
            </button>
            <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--text-accent)]">
              Verify
            </p>
            <h2 className="mb-2 font-serif text-2xl font-light text-[var(--fg)]">
              Check your email
            </h2>
            <p className="mb-5 text-sm text-[var(--text-accent)]">
              We sent a 6-digit code to <strong className="text-[var(--fg)]">{email}</strong>. Enter it below.
            </p>

            <form className="space-y-3" onSubmit={submitCode}>
              <label className="block">
                <span className="mb-1 block font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--text-accent)]">
                  6-digit code
                </span>
                <input
                  ref={codeInputRef}
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="••••••"
                  maxLength={6}
                  className="w-full rounded-md border border-[var(--rule)] bg-[var(--surface-strong)] px-3 py-3 text-center font-mono text-2xl tracking-[0.4em] text-[var(--fg)] outline-none transition-colors focus:border-emerald-500/40"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  disabled={busy}
                />
              </label>

              {error && <p className="font-mono text-[11px] text-red-500">{error}</p>}

              <button
                type="submit"
                disabled={busy || code.length !== 6}
                className="aw-submit w-full"
              >
                {busy ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Verifying…
                  </>
                ) : (
                  "Verify & continue"
                )}
              </button>

              <button
                type="button"
                onClick={resend}
                disabled={busy || resendIn > 0}
                className="w-full font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--text-accent)] transition-colors hover:text-[var(--fg)] disabled:opacity-50"
              >
                {resendIn > 0 ? `Resend in ${resendIn}s` : "Resend code"}
              </button>
            </form>
          </>
        )}

        {step === "done" && result && (
          <>
            <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/15">
              <Check className="h-5 w-5 text-emerald-500" />
            </div>
            <h2 className="mb-2 font-serif text-2xl font-light text-[var(--fg)]">
              You&apos;re in
            </h2>
            <p className="mb-5 text-sm leading-relaxed text-[var(--text-accent)]">
              Share your code. When someone signs up and deposits ≥ $100, you start
              earning 20% of our fee on their yield — paid monthly in USDC.
            </p>

            <div className="mb-3 rounded-md border border-[var(--rule)] bg-[var(--surface-strong)] p-3">
              <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--text-accent)]">
                Your referral code
              </p>
              <p className="font-mono text-2xl font-bold tracking-[0.2em] text-[var(--fg)]">
                {result.referralCode}
              </p>
            </div>

            <div className="mb-3 flex items-center gap-2">
              <input
                readOnly
                value={shareUrl}
                onFocus={(e) => e.currentTarget.select()}
                className="flex-1 rounded-md border border-[var(--rule)] bg-[var(--surface-strong)] px-2.5 py-2 font-mono text-[11px] text-[var(--fg)] outline-none"
              />
              <button
                type="button"
                onClick={copy}
                className="inline-flex items-center gap-1.5 rounded-md border border-[var(--rule)] bg-[var(--surface-strong)] px-3 py-2 font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--fg)] transition-colors hover:bg-[var(--surface)]"
              >
                {copied ? (
                  <>
                    <Check className="h-3 w-3 text-emerald-500" /> Copied
                  </>
                ) : (
                  <>
                    <Copy className="h-3 w-3" /> Copy
                  </>
                )}
              </button>
            </div>

            {/* Telegram is the primary action post-signup — beta invites and
                allocation windows are announced there first. Pinned above
                Share/AWY so it's the obvious next click. */}
            <a
              href="https://t.me/fdnusd"
              target="_blank"
              rel="noopener noreferrer"
              className="mb-2 flex items-center gap-3 rounded-md border border-[var(--rule)] bg-[var(--surface-strong)] px-3 py-2.5 transition-colors hover:bg-[var(--surface)]"
            >
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[var(--surface)] text-[var(--text-accent)]">
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="currentColor" aria-hidden="true">
                  <path d="M9.78 18.65l.28-4.23 7.68-6.92c.34-.31-.07-.46-.52-.19L7.74 13.3 3.64 12c-.88-.25-.89-.86.2-1.3l15.97-6.16c.73-.33 1.43.18 1.15 1.3l-2.72 12.81c-.19.91-.74 1.13-1.5.71L12.6 16.3l-1.99 1.93c-.23.23-.42.42-.83.42z" />
                </svg>
              </div>
              <p className="flex-1 text-[12px] leading-tight text-[var(--fg)]">
                Beta invites drop in Telegram first.
              </p>
            </a>

            <div className="flex gap-2">
              <a
                href={twitterUrl}
                target="_blank"
                rel="noopener"
                className="flex-1 rounded-md border border-[var(--rule)] bg-[var(--surface-strong)] px-3 py-2 text-center font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--fg)] transition-colors hover:bg-[var(--surface)]"
              >
                Share on X
              </a>
              <a
                href="/awy"
                className="flex-1 rounded-md bg-emerald-500/15 px-3 py-2 text-center font-mono text-[10px] uppercase tracking-[0.15em] text-emerald-600 transition-colors hover:bg-emerald-500/25 dark:text-emerald-400"
              >
                Open AWY →
              </a>
            </div>

            <p className="mt-4 font-mono text-[10px] leading-relaxed text-[var(--text-accent)]">
              Referral activates when your friend deposits ≥ $100 and holds ≥ 30 days.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
