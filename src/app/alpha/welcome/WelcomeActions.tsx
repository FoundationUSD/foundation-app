"use client";

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
      const res = await fetch(ogImageUrl, { cache: "no-store" });
      if (!res.ok) throw new Error(`Image fetch ${res.status}`);
      const blob = await res.blob();
      if (!blob.type.startsWith("image/")) throw new Error("Not an image");

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
      {/* Post to X - Branded Gold & Navy button */}
      <a
        href={intentUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="group flex w-full items-center justify-center gap-3 rounded-lg bg-gold-500 px-6 py-4 font-mono text-[12px] font-bold uppercase tracking-[0.2em] text-navy-900 no-underline shadow-xl shadow-gold-500/10 transition-all hover:bg-gold-400 hover:scale-[1.01] active:scale-[0.99]"
      >
        <XLogo className="h-4 w-4 shrink-0" />
        <span>Post to X</span>
      </a>

      {/* Copy Image - Understated Dark Glass Button */}
      <button
        type="button"
        onClick={copyImage}
        disabled={copyState === "copying"}
        className={`group flex w-full items-center justify-center gap-3 rounded-lg border border-[var(--rule)]/60 bg-[var(--surface-strong)]/20 px-6 py-4 font-mono text-[12px] font-bold uppercase tracking-[0.2em] text-[var(--fg)] transition-all hover:bg-[var(--surface-strong)]/40 hover:border-[var(--rule)] disabled:cursor-not-allowed disabled:opacity-60 ${
          variant === "primary" ? "hidden" : ""
        }`}
      >
        {copyState === "copying" ? (
          <>
            <Copy className="h-4 w-4 animate-pulse shrink-0 text-gold-500" />
            <span>Copying…</span>
          </>
        ) : copyState === "done" ? (
          <>
            <Check className="h-4 w-4 text-emerald-500 shrink-0" />
            <span>Image copied</span>
          </>
        ) : (
          <>
            <ImageDown className="h-4 w-4 shrink-0 text-[var(--text-accent)] group-hover:text-gold-500 transition-colors" />
            <span>Copy image</span>
          </>
        )}
      </button>

      {copyState === "error" && errorMsg && (
        <p className="font-mono text-[10px] text-red-500 text-center mt-1">
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
