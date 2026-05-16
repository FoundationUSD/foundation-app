/**
 * SignInWithX — plain anchor link to the server-side OAuth start endpoint.
 *
 * Intentionally NOT a "use client" component — no React state, no event
 * handlers. The button is a real HTML <a> link, so it works without
 * hydration. The actual OAuth dance is initiated server-side at
 * /api/auth/x/start which 302-redirects to the X consent screen.
 *
 * Why no client component: Turbopack + tunnel + Next.js 16 has been
 * dropping hydration of nested client components, leaving event handlers
 * unattached. A plain link sidesteps the whole problem.
 */

interface Props {
  callbackURL?: string;
  className?: string;
  label?: string;
}

export function SignInWithX({
  callbackURL = "/alpha/reveal",
  className = "",
  label = "Sign in with X",
}: Props) {
  const href =
    process.env.NODE_ENV === "development"
      ? `/alpha/reveal?bypass=true`
      : `/api/auth/x/start?callbackURL=${encodeURIComponent(callbackURL)}`;

  return (
    <div className={className}>
      <a
        href={href}
        aria-label={label}
        className="group inline-flex w-full items-center justify-center gap-2.5 rounded-lg border border-[var(--rule)] bg-[var(--surface)] px-4 py-2.5 font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--fg)] no-underline transition-all hover:border-gold-500/60 hover:bg-gold-500/5 hover:text-gold-500"
      >
        <XLogo className="h-3.5 w-3.5" />
        <span>{label}</span>
      </a>
      
      {process.env.NODE_ENV === "development" && (
        <div className="mt-4 text-center">
          <p className="font-mono text-[9px] uppercase tracking-widest text-emerald-500/60">
            Developer Mode: Bypassing X Auth
          </p>
        </div>
      )}
    </div>
  );
}

function XLogo({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}
