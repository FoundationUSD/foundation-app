import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowUpRight, Trophy, Key, IdCard, Share2, Bell, Users, Zap } from "lucide-react";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth/server";
import { db } from "@/lib/db";
import { referral, referralCode, waitlistProfile } from "../../../../drizzle/schema";
import { getWaitlistProfileByUserId } from "@/lib/waitlist/profile";
import { WelcomeActions } from "./WelcomeActions";
import { InviteKeyCopy } from "./InviteKeyCopy";
import { ReferralCodeInput } from "@/components/ReferralCodeInput";

export const dynamic = "force-dynamic";

export default async function AlphaWelcomePage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    redirect("/alpha/join");
  }

  const profile = await getWaitlistProfileByUserId(session.user.id);

  if (!profile) {
    redirect("/alpha/join");
  }

  const [code] = await db
    .select()
    .from(referralCode)
    .where(eq(referralCode.userId, session.user.id))
    .limit(1);

  const referees = await db
    .select()
    .from(referral)
    .where(eq(referral.referrerUserId, session.user.id));

  const refereeCount = referees.length;

  // Who referred this user, if anyone? Drives the "Invited by" badge vs.
  // the "Got a referral code?" input on the welcome page.
  const [incomingReferral] = await db
    .select({
      referrerHandle: waitlistProfile.xHandle,
      codeUsed: referral.codeUsed,
    })
    .from(referral)
    .leftJoin(waitlistProfile, eq(waitlistProfile.userId, referral.referrerUserId))
    .where(eq(referral.refereeUserId, session.user.id))
    .limit(1);

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL || process.env.BETTER_AUTH_URL || "";
  const shareUrl = `${appUrl}/share/${encodeURIComponent(profile.xHandle)}`;
  const ogImage = `${appUrl}/api/og/waitlist?handle=${encodeURIComponent(
    profile.xHandle,
  )}&number=${profile.waitlistNumber}${
    profile.pfpUrl ? `&pfp_url=${encodeURIComponent(profile.pfpUrl)}` : ""
  }`;
  const tweetText = `Just joined the @fdn_labs compute yield waitlist. The specialized fund for AI infrastructure with professional-grade yield on Solana. Join: ${shareUrl}`;

  const rank = Math.max(1, profile.waitlistNumber - (refereeCount * 50));
  const potentialEarnings = (refereeCount * 250).toLocaleString();

  return (
    <div className="fdn-page max-w-[1000px]">
      <div className="animate-fade-up overflow-hidden rounded-2xl border border-[var(--rule)] bg-[var(--surface)] shadow-2xl">
        <div className="grid grid-cols-1 md:grid-cols-2">
          
          {/* Left Column — Identity & Perks */}
          <div className="flex flex-col p-8 sm:p-12 lg:p-14">
            <div className="mb-10">
              <p className="mb-4 font-mono text-[11px] font-bold uppercase tracking-[0.1em] text-gold-500">
                Foundation Alpha · Cabinet
              </p>
              <h1 className="mb-6 font-serif text-3xl font-light leading-tight text-[var(--fg)] sm:text-5xl">
                Welcome, @{profile.xHandle}.
              </h1>
              <p className="max-w-md text-[14px] leading-relaxed text-[var(--text-accent)]">
                You hold priority access to the first institutional AI compute fund. 
                Your status is verified and accruing value.
              </p>
            </div>

            <div className="space-y-10 pt-10 border-t border-[var(--rule)]/30">
              <h2 className="font-mono text-[11px] font-bold uppercase tracking-[0.1em] text-gold-500">
                Your Member Perks
              </h2>

              <div className="space-y-8">
                {/* Perk 1 */}
                <div className="flex items-start gap-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[var(--rule)] bg-[var(--surface-strong)]/30 text-gold-500">
                    <IdCard className="h-5 w-5" />
                  </div>
                  <div>
                    <h4 className="font-bold text-[14px] text-[var(--fg)]">Genesis Pass</h4>
                    <p className="mt-1 text-[13px] leading-relaxed text-[var(--text-accent)]">
                      Exclusive numbered ID. Verified early-access pass.
                    </p>
                  </div>
                </div>

                {/* Perk 2 with Ref Button */}
                <div className="flex items-start gap-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[var(--rule)] bg-[var(--surface-strong)]/30 text-gold-500">
                    <Share2 className="h-5 w-5" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between gap-4">
                      <h4 className="font-bold text-[14px] text-[var(--fg)]">20% Fee Share</h4>
                      <Link 
                        href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(tweetText)}`}
                        target="_blank"
                        className="rounded border border-gold-500/30 bg-gold-500/5 px-2 py-1 font-mono text-[9px] font-bold uppercase tracking-wide text-gold-500 transition-colors hover:bg-gold-500/10"
                      >
                        Invite
                      </Link>
                    </div>
                    <p className="mt-1 text-[13px] leading-relaxed text-[var(--text-accent)]">
                      Earn protocol fees in USDC for every friend referred.
                    </p>
                  </div>
                </div>

                {/* Perk 3 */}
                <div className="flex items-start gap-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[var(--rule)] bg-[var(--surface-strong)]/30 text-gold-500">
                    <Zap className="h-5 w-5" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between gap-4">
                      <h4 className="font-bold text-[14px] text-[var(--fg)]">Priority Allocation</h4>
                      <span className="rounded border border-gold-500/30 bg-gold-500/5 px-2 py-1 font-mono text-[9px] font-bold uppercase tracking-wide text-gold-500">#{rank}</span>
                    </div>
                    <p className="mt-1 text-[13px] leading-relaxed text-[var(--text-accent)]">
                      First in line to deposit when restricted-access vaults open.
                    </p>
                  </div>
                </div>

                {/* Perk 4 — Beta channel. Entire row is the click target so
                    users don't have to aim at a small pill. */}
                <Link
                  href="https://t.me/fdnusd"
                  target="_blank"
                  className="group -mx-3 -my-2 flex items-start gap-4 rounded-lg px-3 py-2 transition-colors hover:bg-[var(--surface-strong)]/40"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[var(--rule)] bg-[var(--surface-strong)]/30 text-gold-500 transition-colors group-hover:border-gold-500/40">
                    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden="true">
                      <path d="M9.78 18.65l.28-4.23 7.68-6.92c.34-.31-.07-.46-.52-.19L7.74 13.3 3.64 12c-.88-.25-.89-.86.2-1.3l15.97-6.16c.73-.33 1.43.18 1.15 1.3l-2.72 12.81c-.19.91-.74 1.13-1.5.71L12.6 16.3l-1.99 1.93c-.23.23-.42.42-.83.42z" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between gap-4">
                      <h4 className="font-bold text-[14px] text-[var(--fg)]">Beta Channel</h4>
                      <span className="inline-flex items-center gap-1 rounded border border-gold-500/30 bg-gold-500/5 px-2 py-1 font-mono text-[9px] font-bold uppercase tracking-wide text-gold-500 transition-colors group-hover:bg-gold-500/15">
                        Join Telegram
                        <ArrowUpRight className="h-3 w-3" />
                      </span>
                    </div>
                    <p className="mt-1 text-[13px] leading-relaxed text-[var(--text-accent)]">
                      Beta invites and allocation windows drop in Telegram first.
                    </p>
                  </div>
                </Link>
              </div>
            </div>
          </div>

          {/* Right Column — Dashboard */}
          <div className="flex flex-col border-l border-[var(--rule)]/30 bg-[var(--surface-strong)]/20 p-8 sm:p-12 lg:p-14">

            {/* 1. Invite Key */}
            <div className="mb-8">
              <h2 className="mb-3 font-mono text-[11px] font-bold uppercase tracking-[0.1em] text-gold-500">
                Invite Access
              </h2>
              <InviteKeyCopy code={code?.code || ""} />

              {/* Inbound referral state: badge if linked, input if not. */}
              <div className="mt-3">
                {incomingReferral ? (
                  <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--text-accent)]">
                    Invited by{" "}
                    <span className="text-gold-500">
                      @{incomingReferral.referrerHandle ?? "—"}
                    </span>
                    {" · "}
                    <span className="text-[var(--fg)]">{incomingReferral.codeUsed}</span>
                  </p>
                ) : (
                  <ReferralCodeInput variant="link" />
                )}
              </div>
            </div>

            {/* 2. Membership Card */}
            <div className="mb-8">
              <div className="relative aspect-[19/12] overflow-hidden rounded-lg border border-[var(--rule)]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={ogImage}
                  alt="Foundation Membership Card"
                  className="h-full w-full object-cover"
                />
              </div>
            </div>

            {/* 3. Metrics */}
            <div className="mt-auto">
              <h2 className="mb-4 font-mono text-[11px] font-bold uppercase tracking-[0.1em] text-gold-500">
                Alpha Metrics
              </h2>

              <div className="grid grid-cols-3 gap-4 border-t border-[var(--rule)]/30 pt-5 mb-6">
                <div>
                  <p className="font-mono text-[18px] font-bold text-[var(--fg)]">{refereeCount}</p>
                  <p className="mt-1 font-mono text-[9px] uppercase tracking-wider text-[var(--text-accent)]">Invited</p>
                </div>
                <div>
                  <p className="font-mono text-[18px] font-bold text-[var(--fg)]">${potentialEarnings}</p>
                  <p className="mt-1 font-mono text-[9px] uppercase tracking-wider text-[var(--text-accent)]">Ref Earned</p>
                </div>
                <div>
                  <p className="font-mono text-[18px] font-bold text-[var(--fg)]">#{rank}</p>
                  <p className="mt-1 font-mono text-[9px] uppercase tracking-wider text-[var(--text-accent)]">Position</p>
                </div>
              </div>

              <WelcomeActions
                shareUrl={shareUrl}
                tweetText={tweetText}
                ogImageUrl={ogImage}
              />
            </div>

          </div>

        </div>
      </div>
    </div>
  );
}
