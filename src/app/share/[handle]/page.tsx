/**
 * /share/[handle] — public share page that unfurls a personalised banner.
 *
 * Sets the OG meta tags so a tweet linking here renders the user's banner
 * as a large image card.
 *
 * Referral attribution: deferred. Next.js disallows cookies().set() inside
 * server components, so the previous in-page cookie write would 500. When
 * we wire linkReferral(), do it via middleware or a Route Handler instead.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { getWaitlistProfileByHandle } from "@/lib/waitlist/profile";
import { SignInWithX } from "@/components/SignInWithX";

export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ handle: string }>;
}

function appUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.BETTER_AUTH_URL ||
    "http://localhost:3000"
  );
}

function buildOgImage(handle: string, pfp: string | null, number: number) {
  const base = `${appUrl()}/api/og/waitlist?handle=${encodeURIComponent(
    handle,
  )}&number=${number}`;
  return pfp ? `${base}&pfp_url=${encodeURIComponent(pfp)}` : base;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { handle } = await params;
  const profile = await getWaitlistProfileByHandle(handle);
  if (!profile) {
    return {
      title: "Foundation Alpha",
      description: "The compute yield index. The financing layer for the AI super-cycle.",
    };
  }
  const url = `${appUrl()}/share/${profile.xHandle}`;
  const ogImage = buildOgImage(profile.xHandle, profile.pfpUrl, profile.waitlistNumber);
  const title = `${profile.displayName || "@" + profile.xHandle} is on the Foundation Alpha waitlist`;
  const description =
    "The compute yield index. The financing layer for the AI super-cycle.";
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url,
      images: [{ url: ogImage, width: 1200, height: 900 }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImage],
    },
  };
}

export default async function SharePage({ params }: Params) {
  const { handle } = await params;
  const profile = await getWaitlistProfileByHandle(handle);

  const ogImage = profile
    ? buildOgImage(profile.xHandle, profile.pfpUrl, profile.waitlistNumber)
    : null;

  return (
    <div className="fdn-page max-w-[920px]">
      <div className="mb-4">
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-gold-500">
          Foundation Alpha · Waitlist
        </p>
        <h1 className="page-heading mt-1 text-2xl sm:text-[2rem]">
          {profile ? (
            <>
              @{profile.xHandle} is <em>in</em>.
            </>
          ) : (
            <>Compute yield, <em>indexed.</em></>
          )}
        </h1>
        <p className="mt-2 max-w-xl text-[13px] leading-relaxed text-[var(--text-accent)]">
          The compute yield index. Track AI infrastructure debt — GPU-backed
          credit, datacenter financing, neocloud lending. Target APY 15–25%.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_320px] md:items-start">
        {ogImage ? (
          <section className="infra-card overflow-hidden p-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={ogImage}
              alt={`Foundation waitlist banner for @${profile?.xHandle}`}
              className="block h-auto w-full"
              width={1200}
              height={900}
            />
          </section>
        ) : (
          <section className="infra-card flex h-[300px] items-center justify-center p-6">
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--text-accent)]">
              Couldn&apos;t find @{handle.replace(/^@/, "")} on the waitlist.
            </p>
          </section>
        )}

        <aside className="space-y-4">
          <div className="rounded-xl border border-[var(--rule)] bg-[var(--surface)] p-4">
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-gold-500">
              Join the waitlist
            </p>
            <p className="mt-1 text-[11px] leading-relaxed text-[var(--text-accent)]">
              Sign in with X. No password, no spam — we&apos;ll ping you when
              FCY opens.
            </p>
            <div className="mt-3">
              <SignInWithX callbackURL="/alpha/welcome" label="Sign in with X" />
            </div>
          </div>

          <Link
            href="/compute"
            className="block text-center font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--text-accent)] hover:text-gold-500"
          >
            What is FCY? →
          </Link>
        </aside>
      </div>
    </div>
  );
}
