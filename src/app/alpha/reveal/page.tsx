import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowDown, CheckCircle2 } from "lucide-react";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth/server";
import { db } from "@/lib/db";
import { referralCode } from "../../../../drizzle/schema";
import { getWaitlistProfileByUserId, upsertWaitlistProfileForUser } from "@/lib/waitlist/profile";
import { WaitlistProgress } from "@/components/WaitlistProgress";
import { InviteLinkAction } from "./InviteLinkAction";
import { WelcomeActions } from "../welcome/WelcomeActions";

export const dynamic = "force-dynamic";

export default async function AlphaRevealPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const isBypass = params.bypass === "true";
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session && !isBypass) {
    redirect("/alpha/join");
  }

  const profile = isBypass
    ? { xHandle: "demo", waitlistNumber: 42, pfpUrl: null }
    : await getWaitlistProfileByUserId(session!.user.id);

  if (!profile) {
    if (session) {
      await upsertWaitlistProfileForUser(session.user.id, session.user.name || "user");
      redirect("/alpha/reveal");
    }
    redirect("/alpha/join");
  }

  const [code] = isBypass
    ? [{ code: "DEMO123" }]
    : await db.select().from(referralCode).where(eq(referralCode.userId, session!.user.id)).limit(1);

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
                  href={isBypass ? "/alpha/welcome?bypass=true" : "/alpha/welcome"}
                  className="group flex w-full items-center justify-center gap-2 rounded-lg border border-transparent py-3 font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--muted)] transition-all hover:border-[var(--rule)] hover:bg-[var(--surface-strong)]/30 hover:text-gold-500"
                >
                  Enter the Priority Queue <ArrowDown className="h-3 w-3 opacity-40 transition-transform group-hover:translate-y-0.5 group-hover:opacity-100" />
                </Link>
              </div>
            </div>
          </div>

          {/* Right Side — Card Preview */}
          <div className="relative flex flex-col items-center justify-center border-l border-[var(--rule)]/30 bg-[var(--surface-strong)]/30 p-8 sm:p-10 backdrop-blur-md">
            <p className="mb-8 font-mono text-[10px] uppercase tracking-[0.25em] text-[var(--text-accent)]">
              Your membership card
            </p>

            <div className="relative w-full max-w-[320px] aspect-[19/24] overflow-hidden rounded-2xl border border-white/20 bg-gradient-to-br from-white/10 to-transparent p-6 shadow-2xl backdrop-blur-xl">
              <div className="flex flex-col items-center text-center">
                {profile.pfpUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={profile.pfpUrl}
                    alt=""
                    className="h-20 w-20 rounded-full border-2 border-gold-500 shadow-[0_0_20px_rgba(184,150,12,0.3)]"
                  />
                ) : (
                  <div className="h-20 w-20 rounded-full bg-gold-500/20 border-2 border-gold-500" />
                )}
                
                <div className="mt-4 h-px w-10 bg-gold-500/50" />
                
                <h3 className="mt-4 font-serif text-[20px] font-light text-[var(--fg)]">
                  @{profile.xHandle}
                </h3>
                <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.2em] text-gold-500/80">
                  {profile.waitlistNumber <= 500 ? "Alpha Member" : "Member"} · MMXXVI
                </p>
                
                <div className="mt-6 font-mono text-[32px] font-bold tracking-wider text-gold-500">
                  No. {profile.waitlistNumber.toString().padStart(3, "0")}
                </div>
                <p className="mt-1 font-mono text-[8px] uppercase tracking-[0.3em] text-[var(--text-accent)]">
                  AI Compute Yield
                </p>
              </div>

              <div className="mt-8 space-y-4">
                <div className="rounded-lg border border-gold-500/20 bg-gold-500/5 p-3">
                  <p className="font-mono text-[9px] uppercase tracking-wider text-gold-500">Referral Code</p>
                  <p className="mt-1 font-mono text-[14px] font-bold text-gold-400">{code?.code || "-------"}</p>
                </div>
                
                <div className="rounded-lg border border-[var(--rule)] bg-[var(--surface)]/50 p-3">
                  <p className="font-mono text-[9px] uppercase tracking-wider text-[var(--text-accent)]">
                    <span className="text-gold-500">20%</span> fee share
                  </p>
                  <p className="mt-1 text-[9px] leading-snug text-[var(--text-accent)]">
                    Earned on every friend&apos;s yield. No cap. Paid in USDC at launch.
                  </p>
                </div>
              </div>

              <div className="mt-6 flex items-center justify-between opacity-40">
                <div className="font-mono text-[14px] font-bold text-[var(--fg)]">
                  #{profile.waitlistNumber}
                </div>
                <p className="font-mono text-[8px] uppercase tracking-tighter text-[var(--text-accent)]">
                  Early Access Pass
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
