"use client";

import { useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { Mail, Check, Loader2 } from "lucide-react";

/**
 * Footer email subscribe form. Optionally attaches the connected wallet so
 * the user gets per-position notifications (deposit/withdrawal confirmations).
 */
export function SubscribeForm() {
  const wallet = useWallet();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "sent" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
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
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Subscription failed");
      setStatus("sent");
      setEmail("");
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
        <p className="text-sm text-[var(--fg)]">Check your inbox</p>
        <p className="mt-1 text-[11px] text-[var(--text-accent)]">We sent you a confirmation link.</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <div className="flex items-center gap-2">
        <Mail className="h-3.5 w-3.5 text-[var(--text-accent)]" />
        <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--text-accent)]">
          Email updates
        </span>
      </div>
      <p className="text-[11px] leading-relaxed text-[var(--text-accent)]">
        Material APY changes (&gt;2%), your deposit/withdrawal confirmations, new vault launches.
      </p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          type="email"
          required
          placeholder="you@email.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="flex-1 rounded-md border border-[var(--rule)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--fg)] placeholder:text-[var(--muted)]"
          disabled={status === "loading"}
          aria-label="Email address"
        />
        <button
          type="submit"
          disabled={status === "loading" || !email}
          className="flex items-center justify-center gap-1.5 rounded-md bg-[var(--navy)] px-4 py-2 font-mono text-[10px] uppercase tracking-wider text-white transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {status === "loading" ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
          Subscribe
        </button>
      </div>
      {error && (
        <p className="text-[11px] text-rose-600 dark:text-rose-400">{error}</p>
      )}
      {wallet.publicKey && (
        <p className="font-mono text-[9px] text-[var(--muted)]">
          Linked to {wallet.publicKey.toBase58().slice(0, 4)}…{wallet.publicKey.toBase58().slice(-4)}
        </p>
      )}
    </form>
  );
}
