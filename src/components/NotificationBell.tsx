"use client";

import { useEffect, useRef, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import Link from "next/link";
import { Bell, Check, ExternalLink } from "lucide-react";

interface Notification {
  id: number;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
  wallet: string | null;
}

const POLL_MS = 60_000;

export function NotificationBell() {
  const wallet = useWallet();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  // Outside click to close
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", handler);
    return () => window.removeEventListener("mousedown", handler);
  }, [open]);

  // Poll for new notifications
  useEffect(() => {
    if (!wallet.publicKey) {
      setItems([]);
      setUnread(0);
      return;
    }
    let cancelled = false;
    const pk = wallet.publicKey.toBase58();
    const load = async () => {
      try {
        const r = await fetch(`/api/notifications?wallet=${pk}`);
        const j = await r.json();
        if (!cancelled && j.success) {
          setItems(j.data.items);
          setUnread(j.data.unread);
        }
      } catch {}
    };
    load();
    const i = setInterval(load, POLL_MS);
    return () => { cancelled = true; clearInterval(i); };
  }, [wallet.publicKey]);

  const markRead = async (id: number) => {
    if (!wallet.publicKey) return;
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, read_at: new Date().toISOString() } : n)));
    setUnread((u) => Math.max(0, u - 1));
    await fetch("/api/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ wallet: wallet.publicKey.toBase58(), action: "mark_read", id }),
    }).catch(() => {});
  };

  const markAll = async () => {
    if (!wallet.publicKey) return;
    setItems((prev) => prev.map((n) => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })));
    setUnread(0);
    await fetch("/api/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ wallet: wallet.publicKey.toBase58(), action: "mark_all_read" }),
    }).catch(() => {});
  };

  if (!wallet.connected) return null;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative flex h-9 w-9 items-center justify-center rounded-md border border-[var(--rule)] bg-[var(--surface)] text-[var(--fg)] transition-colors hover:bg-[var(--surface-strong)]"
        aria-label={`Notifications${unread > 0 ? ` (${unread} unread)` : ""}`}
      >
        <Bell className="h-3.5 w-3.5" />
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full border border-[var(--surface)] bg-rose-500 px-1 font-mono text-[9px] font-bold text-white">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-[calc(100%+8px)] z-50 w-[360px] overflow-hidden rounded-xl border border-[var(--rule)] bg-[var(--surface)] shadow-xl">
          <div className="flex items-center justify-between border-b border-[var(--rule)] px-4 py-3">
            <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--text-accent)]">
              Notifications
            </span>
            {unread > 0 && (
              <button
                onClick={markAll}
                className="font-mono text-[10px] text-gold-500 hover:text-gold-400"
              >
                Mark all read
              </button>
            )}
          </div>
          <div className="max-h-[420px] overflow-y-auto">
            {items.length === 0 ? (
              <div className="px-4 py-12 text-center">
                <p className="text-xs text-[var(--text-accent)]">You're all caught up</p>
                <p className="mt-1 text-[10px] text-[var(--muted)]">
                  Deposits, withdrawals, and APY moves will show up here.
                </p>
              </div>
            ) : (
              items.map((n) => {
                const isUnread = n.read_at === null;
                const Wrapper: React.ElementType = n.link ? Link : "div";
                const wrapperProps = n.link ? { href: n.link } : {};
                return (
                  <Wrapper
                    key={n.id}
                    {...wrapperProps}
                    onClick={() => isUnread && markRead(n.id)}
                    className={`block border-b border-[var(--rule)] px-4 py-3 transition-colors hover:bg-[var(--surface-strong)] ${
                      isUnread ? "bg-[var(--surface-strong)]/40" : ""
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <span
                        className={`mt-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full ${
                          isUnread ? "bg-rose-500" : "bg-transparent"
                        }`}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-[12px] font-medium leading-snug text-[var(--fg)]">{n.title}</p>
                          {n.link && <ExternalLink className="h-3 w-3 shrink-0 text-[var(--muted)]" />}
                        </div>
                        {n.body && (
                          <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-[var(--text-accent)]">
                            {n.body}
                          </p>
                        )}
                        <p className="mt-1 font-mono text-[9px] text-[var(--muted)]">
                          {timeAgo(n.created_at)}
                        </p>
                      </div>
                      {isUnread && (
                        <button
                          onClick={(e) => { e.preventDefault(); e.stopPropagation(); markRead(n.id); }}
                          className="mt-0.5 shrink-0 rounded p-1 text-[var(--muted)] hover:bg-[var(--surface)] hover:text-[var(--fg)]"
                          aria-label="Mark as read"
                          title="Mark as read"
                        >
                          <Check className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  </Wrapper>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function timeAgo(iso: string): string {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}
