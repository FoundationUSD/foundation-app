"use client";

/**
 * Two variants of the referral-code input used across the waitlist flow.
 *
 *   variant="capture"  — pre-signup (on /alpha/join). POSTs to
 *                        /api/referrals/capture which drops the `fdn_ref`
 *                        cookie. The cookie is then consumed automatically
 *                        when the user finishes the X OAuth flow.
 *
 *   variant="link"     — post-signup (on /alpha/welcome) for sessions that
 *                        skipped the share link. POSTs to /api/referrals/link
 *                        which calls linkReferral with the current session.
 *
 * Collapsed by default to keep the surface visually quiet — users without a
 * code shouldn't be nudged into asking around for one.
 */

import { useEffect, useRef, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";

type Variant = "capture" | "link";

interface Props {
  variant: Variant;
  /** Initial value (e.g. cookie echo after capture). Triggers the "applied" state. */
  initialApplied?: string | null;
}

const ENDPOINT: Record<Variant, string> = {
  capture: "/api/referrals/capture",
  link: "/api/referrals/link",
};

function errorMessage(reason?: string): string {
  switch (reason) {
    case "invalid":
      return "That doesn't look like a valid code.";
    case "unknown":
    case "no-such-code":
      return "We couldn't find that code.";
    case "self":
      return "You can't use your own code.";
    case "already-linked":
      return "A referral is already attached to your account.";
    case "unauthorized":
      return "Please sign in first.";
    default:
      return "Couldn't apply that code. Try again.";
  }
}

export function ReferralCodeInput({ variant, initialApplied = null }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(Boolean(initialApplied));
  const [code, setCode] = useState(initialApplied ?? "");
  const [busy, setBusy] = useState(false);
  const [applied, setApplied] = useState<string | null>(initialApplied);
  const [error, setError] = useState<string | null>(null);
  const autoTriedRef = useRef(false);

  // Pre-signup only: if the URL carries ?ref=CODE, auto-apply it once so the
  // cookie is dropped before the user starts the OAuth flow. Strip it from the
  // URL after so a refresh doesn't keep re-applying.
  useEffect(() => {
    if (variant !== "capture" || autoTriedRef.current) return;
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    const fromUrl = url.searchParams.get("ref");
    if (!fromUrl) return;
    autoTriedRef.current = true;
    const cleaned = fromUrl.trim().toUpperCase();
    if (!/^[A-Z0-9]{6,12}$/.test(cleaned)) return;
    setCode(cleaned);
    setOpen(true);
    fetch("/api/referrals/capture", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: cleaned }),
    })
      .then((res) => res.json().catch(() => ({})))
      .then((data: { ok?: boolean }) => {
        if (data?.ok) setApplied(cleaned);
      })
      .catch(() => {})
      .finally(() => {
        url.searchParams.delete("ref");
        window.history.replaceState({}, "", url.toString());
      });
  }, [variant]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) return;
    setBusy(true);
    try {
      const res = await fetch(ENDPOINT[variant], {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: trimmed }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        reason?: string;
      };
      if (!res.ok || !data.ok) {
        setError(errorMessage(data.reason));
        return;
      }
      setApplied(trimmed);
      if (variant === "link") {
        // Refresh so the welcome page reflects the new "Invited by" state.
        router.refresh();
      }
    } catch {
      setError(errorMessage());
    } finally {
      setBusy(false);
    }
  }

  if (applied) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-md border border-emerald-500/30 bg-emerald-500/5 px-3 py-2">
        <div className="flex items-center gap-2">
          <Check className="h-3.5 w-3.5 text-emerald-500" />
          <span className="font-mono text-[11px] uppercase tracking-wider text-[var(--fg)]">
            Code applied · <span className="text-gold-500">{applied}</span>
          </span>
        </div>
      </div>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--text-accent)] underline-offset-4 transition-colors hover:text-gold-500 hover:underline"
      >
        Have a referral code?
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-2">
      <label className="block">
        <span className="mb-1 block font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--text-accent)]">
          Referral code
        </span>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="e.g. RTHESHUW"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 12))}
            maxLength={12}
            autoComplete="off"
            spellCheck={false}
            disabled={busy}
            className="min-w-0 flex-1 rounded-md border border-[var(--rule)] bg-[var(--surface)] px-3 py-2 font-mono text-[12px] uppercase tracking-wider text-[var(--fg)] outline-none transition-colors focus:border-gold-500/40"
          />
          <button
            type="submit"
            disabled={busy || code.trim().length < 6}
            className="inline-flex items-center justify-center gap-1.5 rounded-md border border-gold-500/40 bg-gold-500/10 px-3 py-2 font-mono text-[10px] font-bold uppercase tracking-[0.15em] text-gold-500 transition-colors hover:bg-gold-500/20 disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : "Apply"}
          </button>
        </div>
      </label>
      {error && <p className="font-mono text-[10px] text-red-500">{error}</p>}
    </form>
  );
}
