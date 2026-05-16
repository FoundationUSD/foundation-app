"use client";

import { useState } from "react";
import { Check, Copy, Link as LinkIcon } from "lucide-react";

interface Props {
  shareUrl: string;
}

export function InviteLinkAction({ shareUrl }: Props) {
  const [copied, setCopied] = useState(false);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy link", err);
    }
  }

  return (
    <button
      onClick={copyLink}
      className="group relative flex w-full items-center justify-center gap-3 overflow-hidden rounded-lg bg-gold-500 px-6 py-4 font-mono text-[12px] font-bold uppercase tracking-[0.2em] text-navy-900 shadow-xl shadow-gold-500/20 transition-all hover:bg-gold-400 hover:scale-[1.02] active:scale-[0.98]"
    >
      {copied ? (
        <>
          <Check className="h-4 w-4" />
          Link Copied
        </>
      ) : (
        <>
          <LinkIcon className="h-4 w-4" />
          Copy Referral Link
        </>
      )}
      
      {/* Subtle shine effect */}
      <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/20 to-transparent transition-transform duration-1000 group-hover:translate-x-full" />
    </button>
  );
}
