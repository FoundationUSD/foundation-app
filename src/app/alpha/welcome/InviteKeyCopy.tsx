"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

interface Props {
  code: string;
}

export function InviteKeyCopy({ code }: Props) {
  const [copied, setCopied] = useState(false);

  async function copyKey() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy key", err);
    }
  }

  return (
    <button
      onClick={copyKey}
      className="group relative flex w-full items-center justify-between rounded-lg border border-[var(--rule)] bg-[var(--surface)] px-5 py-4 transition-all hover:border-gold-500/30 hover:shadow-md active:scale-[0.99]"
    >
      <div className="text-left">
        <p className="font-mono text-[9px] font-bold uppercase tracking-[0.08em] text-[var(--text-accent)] mb-1">
          Your Invite Key
        </p>
        <p className="font-mono text-[20px] font-bold tracking-[0.05em] text-gold-500">
          {code}
        </p>
      </div>
      <div className="h-10 w-10 flex items-center justify-center rounded-md border border-[var(--rule)] bg-[var(--surface-strong)]/20 text-[var(--text-accent)] group-hover:text-gold-500 group-hover:border-gold-500/30 transition-colors">
        {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
      </div>
    </button>
  );
}
