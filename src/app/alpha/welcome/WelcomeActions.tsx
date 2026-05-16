"use client";

/**
 * WelcomeActions — client island under /alpha/welcome.
 *
 *   - "Share on X" → opens the Twitter intent compose
 *   - "Copy image" → copies the rendered banner PNG to clipboard so the user
 *     can paste it directly into any X compose dialog / DM / Slack / etc.
 *
 * Email is fetched from X automatically via the users.email scope, so no
 * email input is shown here.
 */

import { useState } from "react";
import { Check, Copy, ImageDown } from "lucide-react";

interface Props {
  shareUrl: string;
  tweetText: string;
  /** URL to the rendered banner PNG — the same one used as og:image. */
  ogImageUrl: string;
  variant?: "default" | "primary";
}

export function WelcomeActions({ shareUrl, tweetText, ogImageUrl, variant = "default" }: Props) {
  const [copyState, setCopyState] = useState<"idle" | "copying" | "done" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const intentUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(
    tweetText,
  )}`;

  async function copyImage() {
    if (copyState === "copying") return;
    setCopyState("copying");
    setErrorMsg(null);
    try {
      // Fetch the rendered banner. Clipboard API requires the blob to be a
      // PNG (or one of a tiny allow-list of MIME types) and the operation
      // to happen inside a user gesture — this click handler qualifies.
      const res = await fetch(ogImageUrl, { cache: "no-store" });
      if (!res.ok) throw new Error(`Image fetch ${res.status}`);
      const blob = await res.blob();
      if (!blob.type.startsWith("image/")) throw new Error("Not an image");

      // ClipboardItem isn't on the global type in some lib versions.
      const ClipboardItemCtor = (
        window as unknown as { ClipboardItem?: typeof ClipboardItem }
      ).ClipboardItem;
      if (!ClipboardItemCtor || !navigator.clipboard?.write) {
        throw new Error("Clipboard API not supported in this browser");
      }

      await navigator.clipboard.write([
        new ClipboardItemCtor({ [blob.type]: blob }),
      ]);
      setCopyState("done");
      setTimeout(() => setCopyState("idle"), 2200);
    } catch (e) {
      setCopyState("error");
      setErrorMsg(
        e instanceof Error
          ? e.message
          : "Couldn't copy. Try right-click → Copy Image on the preview.",
      );
      setTimeout(() => setCopyState("idle"), 4000);
    }
  }

  return (
    <div className="space-y-3">
      <a
        href={intentUrl}
        target="_blank"
        rel="noopener noreferrer"
        className={`inline-flex w-full items-center justify-center gap-2 rounded-lg font-mono text-[11px] font-medium uppercase tracking-[0.08em] transition-all ${
          variant === "primary"
            ? "bg-gold-500 px-6 py-4 text-navy-900 hover:bg-gold-400 shadow-lg shadow-gold-500/20"
            : "bg-gold-500 px-4 py-2.5 text-[#0c2340] hover:bg-gold-400"
        }`}
      >
        <XLogo className="h-3.5 w-3.5" />
        Post to X
      </a>

      <button
        type="button"
        onClick={copyImage}
        disabled={copyState === "copying"}
        className={`inline-flex w-full items-center justify-center gap-2 rounded-lg border border-[var(--rule)] bg-[var(--surface)] px-4 py-2.5 font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--fg)] transition-all hover:border-gold-500/60 hover:text-gold-500 disabled:cursor-not-allowed disabled:opacity-60 ${
          variant === "primary" ? "hidden" : ""
        }`}
      >
        {copyState === "copying" ? (
          <>
            <Copy className="h-3.5 w-3.5 animate-pulse" /> Copying…
          </>
        ) : copyState === "done" ? (
          <>
            <Check className="h-3.5 w-3.5" /> Image copied
          </>
        ) : (
          <>
            <ImageDown className="h-3.5 w-3.5" /> Copy image
          </>
        )}
      </button>

      {copyState === "error" && errorMsg && (
        <p className="font-mono text-[10px] text-[color:var(--color-error)]">
          {errorMsg}
        </p>
      )}
    </div>
  );
}

function XLogo({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}
