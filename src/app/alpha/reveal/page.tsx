import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowDown } from "lucide-react";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth/server";
import { db } from "@/lib/db";
import { referralCode } from "../../../../drizzle/schema";
import { getWaitlistProfileByUserId, upsertWaitlistProfileForUser } from "@/lib/waitlist/profile";
import { WaitlistProgress } from "@/components/WaitlistProgress";
import { WelcomeActions } from "../welcome/WelcomeActions";
import { InviteKeyCopy } from "../welcome/InviteKeyCopy";

export const dynamic = "force-dynamic";

export default async function AlphaRevealPage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    redirect("/alpha/join");
  }

  let profile = await getWaitlistProfileByUserId(session.user.id);

  if (!profile) {
    // Twitter login completed but profile row missing — self-heal once,
    // then re-read. If still missing, the X account isn't linked.
    profile = await upsertWaitlistProfileForUser(session.user.id);
    if (!profile) redirect("/alpha/join");
  }

  const [code] = await db
    .select()
    .from(referralCode)
    .where(eq(referralCode.userId, session.user.id))
    .limit(1);

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.BETTER_AUTH_URL || "";
  const shareUrl = `${appUrl}/share/${profile.xHandle}`;
  const ogImage = `${appUrl}/api/og/waitlist?handle=${encodeURIComponent(
    profile.xHandle
  )}&number=${profile.waitlistNumber}${
    profile.pfpUrl ? `&pfp_url=${encodeURIComponent(profile.pfpUrl)}` : ""
  }`;
  const tweetText = `Just joined the @fdnusd compute yield waitlist. The specialized fund for AI infrastructure — professional-grade yield on Solana. Join: ${shareUrl}`;

  return (
    <div className="fdn-page max-w-[1000px]">
      <div className="animate-fade-up overflow-hidden rounded-2xl border border-[var(--rule)] bg-[var(--surface)] shadow-2xl">
        {/* Top Progress Tabs — Integrated into Card */}
        <div className="border-b border-[var(--rule)]/30 bg-[var(--surface-strong)]/20">
          <WaitlistProgress currentStep={2} />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2">
          {/* Left Side — Share Prompt */}
          <div className="p-8 sm:p-10">
            <div className="mt-8 sm:mt-10">
              <p className="mb-4 font-mono text-[11px] font-bold uppercase tracking-[0.1em] text-gold-500">
                Foundation Alpha · Identity
              </p>
              <h1 className="mb-6 font-serif text-3xl font-light leading-tight text-[var(--fg)] sm:text-5xl">
                Your card is ready.<br />
                Tell your network.
              </h1>

              <p className="mb-6 max-w-md text-[14px] leading-relaxed text-[var(--text-accent)]">
                Post to X to secure early access and unlock your referral earnings.
                Every friend who joins you earns you 20% of our protocol fees — in USDC, forever.
              </p>

              {/* Post Preview Card */}
              <div className="mb-6 rounded-xl border border-[var(--rule)] bg-[var(--surface-strong)]/50 p-4">
                <div className="flex items-center gap-3 mb-3">
                  {profile.pfpUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={profile.pfpUrl} alt="" className="h-8 w-8 rounded-full border border-gold-500/30" />
                  ) : (
                    <div className="h-8 w-8 rounded-full bg-gold-500/20" />
                  )}
                  <span className="font-mono text-[12px] font-bold text-[var(--fg)]">@{profile.xHandle}</span>
                </div>
                <p className="text-[13px] leading-relaxed text-[var(--fg)] whitespace-pre-wrap">
                  {tweetText.split(shareUrl)[0]}
                  <span className="text-blue-400">{shareUrl}</span>
                </p>
              </div>

              <div className="space-y-6">
                <WelcomeActions 
                  shareUrl={shareUrl}
                  tweetText={tweetText}
                  ogImageUrl={ogImage}
                  variant="default"
                />
                
                <Link
                  href="/alpha/welcome"
                  className="group flex w-full items-center justify-center gap-2 rounded-lg border border-transparent py-3 font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--muted)] transition-all hover:border-[var(--rule)] hover:bg-[var(--surface-strong)]/30 hover:text-gold-500"
                >
                  Enter the Priority Queue <ArrowDown className="h-3 w-3 opacity-40 transition-transform group-hover:translate-y-0.5 group-hover:opacity-100" />
                </Link>
              </div>
            </div>
          </div>

          {/* Right Side — Card Preview (real OG share image) */}
          <div className="flex flex-col border-l border-[var(--rule)]/30 bg-[var(--surface-strong)]/20 p-8 sm:p-10">
            <p className="mb-4 font-mono text-[11px] font-bold uppercase tracking-[0.1em] text-gold-500">
              Your Membership Card
            </p>

            <div className="relative aspect-[19/12] w-full overflow-hidden rounded-lg border border-[var(--rule)] shadow-xl">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={ogImage}
                alt={`Foundation Alpha Membership · @${profile.xHandle} · No. ${profile.waitlistNumber}`}
                className="h-full w-full object-cover"
              />
            </div>

            <p className="mt-3 font-mono text-[10px] leading-relaxed text-[var(--text-accent)]">
              This is the exact image that posts with your tweet. Hosted at
              <span className="ml-1 text-gold-500">/api/og/waitlist</span> — auto-rendered
              by X, Telegram, and Farcaster.
            </p>

            <div className="mt-auto pt-8 space-y-4">
              <InviteKeyCopy code={code?.code || ""} />

              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-lg border border-[var(--rule)] bg-[var(--surface)] p-3">
                  <p className="font-mono text-[9px] uppercase tracking-wider text-[var(--text-accent)]">
                    Position
                  </p>
                  <p className="mt-1 font-mono text-[16px] font-bold tracking-tight text-[var(--fg)]">
                    #{profile.waitlistNumber.toString().padStart(3, "0")}
                  </p>
                </div>
                <div className="rounded-lg border border-[var(--rule)] bg-[var(--surface)] p-3">
                  <p className="font-mono text-[9px] uppercase tracking-wider text-[var(--text-accent)]">
                    Fee Share
                  </p>
                  <p className="mt-1 font-mono text-[16px] font-bold tracking-tight text-gold-500">
                    20%
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
