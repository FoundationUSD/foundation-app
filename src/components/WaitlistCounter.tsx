"use client";

/**
 * WaitlistCounter — small inline counter that pulls the live waitlist size
 * from /api/waitlist/count. Refreshes once on mount; cheap query, no need
 * for polling.
 */

import { useEffect, useState } from "react";

interface Props {
  className?: string;
}

export function WaitlistCounter({ className = "" }: Props) {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/waitlist/count", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d) => {
        if (!cancelled) setCount(Number(d.count) || 0);
      })
      .catch(() => {
        if (!cancelled) setCount(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <p
      className={`font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--text-accent)] ${className}`}
    >
      {count == null ? "" : <><span className="text-gold-500">{count.toLocaleString()}</span> on the waitlist</>}
    </p>
  );
}
