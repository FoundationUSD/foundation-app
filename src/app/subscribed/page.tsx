import Link from "next/link";

const STATUS_COPY: Record<string, { title: string; body: string }> = {
  ok: {
    title: "You're in",
    body: "Your subscription is confirmed. We'll only email when something material happens — significant APY moves, your own deposits and withdrawals, and new vault launches. No spam.",
  },
  unsubscribed: {
    title: "Unsubscribed",
    body: "You're off the list. We won't email you again from Foundation. You can re-subscribe any time from the footer of the app.",
  },
  invalid: {
    title: "Link expired",
    body: "This verification or unsubscribe link is no longer valid. Subscribe again from the app footer if you'd like to receive updates.",
  },
  unavailable: {
    title: "Service unavailable",
    body: "Couldn't process this right now. Please try again in a minute.",
  },
};

export default async function SubscribedPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const copy = STATUS_COPY[status || ""] || STATUS_COPY.invalid;

  return (
    <div className="fdn-page mx-auto flex min-h-[400px] max-w-2xl flex-col items-center justify-center px-6 py-16 text-center">
      <h1 className="mb-4 font-serif text-3xl font-light text-[var(--fg)]">{copy.title}</h1>
      <p className="mb-8 max-w-lg text-sm leading-relaxed text-[var(--text-accent)]">{copy.body}</p>
      <Link
        href="/invest"
        className="rounded-lg bg-[var(--navy)] px-6 py-2.5 font-mono text-xs uppercase tracking-wider text-white transition-opacity hover:opacity-90"
      >
        Back to Foundation
      </Link>
    </div>
  );
}
