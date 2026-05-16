/**
 * /alpha/welcome — Success page after signing up and revealing the card.
 */

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import { auth } from "@/lib/auth/server";
import { db } from "@/lib/db";
import {
  getWaitlistProfileByUserId,
  upsertWaitlistProfileForUser,
} from "@/lib/waitlist/profile";
import {
  referral,
  referralCode,
  type WaitlistProfile,
} from "../../../../drizzle/schema";
import { WelcomeActions } from "./WelcomeActions";
import { WaitlistProgress } from "@/components/WaitlistProgress";

export const dynamic = "force-dynamic";

export default async function AlphaWelcomePage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const isBypass = params.bypass === "true";
  const session = isBypass
    ? { user: { id: "demo-user-id", name: "Demo User", email: "demo@foundation.app" } }
    : await auth.api.getSession({ headers: await headers() });

  if (!session?.user) redirect("/alpha/join");

  let profile = isBypass ? {
    userId: "demo-user-id",
    xHandle: "demo",
    displayName: "Demo User",
    pfpUrl: "https://abs.twimg.com/sticky/default_profile_images/default_profile_400x400.png",
    waitlistNumber: 42,
    notificationEmail: "demo@foundation.app"
  } as WaitlistProfile : await getWaitlistProfileByUserId(session.user.id);

  if (!isBypass && !profile) profile = await upsertWaitlistProfileForUser(session.user.id);
  if (!profile) redirect("/compute");

  const [code] = isBypass ? [{ code: "DEMO-CODE" }] : await db
    .select()
    .from(referralCode)
    .where(eq(referralCode.userId, session.user.id))
    .limit(1);

  const referees = isBypass ? [] : await db
    .select({ id: referral.id })
    .from(referral)
    .where(eq(referral.referrerUserId, session.user.id));
  const refereeCount = referees.length;

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL || process.env.BETTER_AUTH_URL || "";
  const shareUrl = `${appUrl}/share/${profile.xHandle}`;
  const ogImage = `${appUrl}/api/og/waitlist?handle=${encodeURIComponent(
    profile.xHandle,
  )}&number=${profile.waitlistNumber}${
    profile.pfpUrl ? `&pfp_url=${encodeURIComponent(profile.pfpUrl)}` : ""
  }`;
  const tweetText = `Just joined the @fdn_labs Foundation Alpha waitlist. The compute yield index — the financing layer for the AI super-cycle. Join: ${shareUrl}`;

  return (
    <div className="fdn-page max-w-[1000px]">
      <WaitlistProgress currentStep={3} />

      <div className="animate-fade-up overflow-hidden rounded-2xl border border-[var(--rule)] bg-[var(--surface)] shadow-2xl">
        <div className="grid grid-cols-1 md:grid-cols-[1.2fr_1fr]">
          {/* Left Side — Success Message */}
          <div className="p-8 sm:p-12">
            <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-gold-500">
              Foundation Alpha · Welcome
            </p>
            <h1 className="mt-2 font-serif text-3xl font-light leading-tight text-[var(--fg)] sm:text-5xl">
              You&apos;re <em className="text-gold-500">#{profile.waitlistNumber}</em> on the <br />
              FCY waitlist.
            </h1>
            <p className="mt-6 max-w-md text-[14px] leading-relaxed text-[var(--text-accent)]">
              Welcome, @{profile.xHandle}. You&apos;re early to the compute yield
              index — track AI infrastructure debt with a USDC deposit when we ship.
            </p>

            <div className="mt-12">
              <div className="relative w-full max-w-[400px] aspect-[1200/900] overflow-hidden rounded-xl border border-[var(--rule)] shadow-lg transition-transform hover:scale-[1.02]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={ogImage}
                  alt={`Foundation waitlist banner for @${profile.xHandle}`}
                  className="block h-auto w-full"
                  width={1200}
                  height={900}
                />
                <div className="absolute bottom-4 right-4 flex h-8 w-8 items-center justify-center rounded-full bg-[var(--surface)]/80 text-gold-500 backdrop-blur-sm shadow-md">
                  <ArrowUpRight className="h-4 w-4" />
                </div>
              </div>
            </div>
          </div>

          {/* Right Side — Actions & Referrals */}
          <div className="flex flex-col border-l border-[var(--rule)]/30 bg-[var(--surface-strong)]/30 p-8 sm:p-12 backdrop-blur-md">
            <WelcomeActions
              shareUrl={shareUrl}
              tweetText={tweetText}
              ogImageUrl={ogImage}
            />

            <div className="mt-12 space-y-4">
              <div className="rounded-xl border border-[var(--rule)] bg-[var(--surface)] p-6 shadow-sm">
                <div className="flex items-center justify-between">
                  <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-gold-500">
                    Referrals
                  </p>
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-gold-500/10 text-gold-500">
                    <Share2 className="h-3 w-3" />
                  </div>
                </div>
                <p className="mt-2 font-mono text-3xl font-bold tracking-[-0.02em] text-[var(--fg)]">
                  {refereeCount.toLocaleString()}
                </p>
                <p className="mt-1 font-mono text-[10px] tracking-wider text-[var(--text-accent)]">
                  {refereeCount === 1 ? "person joined" : "people joined"} via your link
                </p>
                
                {code && (
                  <div className="mt-6 flex items-center justify-between rounded-lg border border-gold-500/20 bg-gold-500/5 px-3 py-2">
                    <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--text-accent)]">
                      Your code
                    </span>
                    <span className="font-mono text-[12px] font-bold text-gold-500">{code.code}</span>
                  </div>
                )}
              </div>

              <Link
                href="/compute"
                className="flex items-center justify-center gap-2 rounded-lg py-4 font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--text-accent)] transition-colors hover:text-gold-500"
              >
                <ArrowLeft className="h-3 w-3" /> Back to FCY
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Share2({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
      <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
    </svg>
  );
}
