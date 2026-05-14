/**
 * /alpha/welcome — landing page after a successful X sign-in.
 *
 * Server component pulls session + waitlist profile + referral counts.
 * Client islands handle the share buttons and the optional notification
 * email input.
 */

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { eq } from "drizzle-orm";
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

export const dynamic = "force-dynamic";

export default async function AlphaWelcomePage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) redirect("/compute");

  // Self-heal: if the user lands here without a waitlist row (e.g. the
  // create-hook silently failed once), build it now from their twitter account.
  let profile: WaitlistProfile | null = await getWaitlistProfileByUserId(
    session.user.id,
  );
  if (!profile) profile = await upsertWaitlistProfileForUser(session.user.id);
  if (!profile) {
    // Email-only signup — no waitlist row to show. Push them back.
    redirect("/compute");
  }

  // Referral metrics for this user.
  const [code] = await db
    .select()
    .from(referralCode)
    .where(eq(referralCode.userId, session.user.id))
    .limit(1);

  const referees = await db
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
    <div className="fdn-page max-w-[920px]">
      <div className="mb-6">
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-gold-500">
          Foundation Alpha
        </p>
        <h1 className="page-heading mt-1 text-2xl sm:text-[2rem]">
          You&apos;re <em>#{profile.waitlistNumber}</em> on the FCY waitlist.
        </h1>
        <p className="mt-2 max-w-xl text-[13px] leading-relaxed text-[var(--text-accent)]">
          Welcome, @{profile.xHandle}. You&apos;re early to the compute yield
          index — track AI infrastructure debt with a USDC deposit when we ship.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_360px] md:items-start">
        {/* Banner preview */}
        <section className="infra-card overflow-hidden p-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={ogImage}
            alt={`Foundation waitlist banner for @${profile.xHandle}`}
            className="block h-auto w-full"
            width={1200}
            height={900}
          />
        </section>

        {/* Action column */}
        <aside className="space-y-4">
          <WelcomeActions
            shareUrl={shareUrl}
            tweetText={tweetText}
            ogImageUrl={ogImage}
          />

          <div className="rounded-xl border border-[var(--rule)] bg-[var(--surface)] p-4">
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-gold-500">
              Referrals
            </p>
            <p className="mt-1 font-mono text-2xl font-bold tracking-[-0.02em] text-[var(--fg)]">
              {refereeCount.toLocaleString()}
            </p>
            <p className="mt-0.5 font-mono text-[10px] tracking-wider text-[var(--text-accent)]">
              {refereeCount === 1 ? "person joined" : "people joined"} via your link
            </p>
            {code && (
              <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--text-accent)]">
                Your code: <span className="text-gold-500">{code.code}</span>
              </p>
            )}
          </div>

          <Link
            href="/compute"
            className="block text-center font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--text-accent)] hover:text-gold-500"
          >
            ← Back to FCY
          </Link>
        </aside>
      </div>
    </div>
  );
}
