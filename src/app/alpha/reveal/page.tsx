import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { auth } from "@/lib/auth/server";
import { getWaitlistProfileByUserId, upsertWaitlistProfileForUser } from "@/lib/waitlist/profile";
import { WaitlistProgress } from "@/components/WaitlistProgress";
import { WelcomeActions } from "../welcome/WelcomeActions";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ bypass?: string }>;
}

export default async function AlphaRevealPage({ searchParams }: PageProps) {
  const resolvedSearchParams = await searchParams;
  const isBypass = resolvedSearchParams.bypass === "true";

  let session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session && !isBypass) {
    redirect("/alpha/join");
  }

  // If in bypass mode, generate a mock session
  if (isBypass && !session) {
    session = {
      user: {
        id: "mock-dev-id",
        email: "dev@foundation.com",
        emailVerified: true,
        name: "Developer Admin",
        image: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      session: {
        id: "mock-session-id",
        userId: "mock-dev-id",
        expiresAt: new Date(Date.now() + 86400 * 1000),
        token: "mock-token",
        createdAt: new Date(),
        updatedAt: new Date(),
        ipAddress: null,
        userAgent: null,
      }
    };
  }

  // If session is still null (fail-safe), redirect
  if (!session) {
    redirect("/alpha/join");
  }

  // Get or self-heal waitlist profile (or mock if bypassing)
  let profile;
  if (isBypass) {
    profile = {
      id: "mock-profile-id",
      userId: "mock-dev-id",
      xHandle: "foundation_dev",
      waitlistNumber: 420,
      pfpUrl: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  } else {
    profile =
      (await getWaitlistProfileByUserId(session.user.id)) ??
      (await upsertWaitlistProfileForUser(session.user.id));
  }

  if (!profile) {
    redirect("/alpha/join");
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.BETTER_AUTH_URL || "";
  const shareUrl = `${appUrl}/share/${encodeURIComponent(profile.xHandle)}`;
  const ogImage = `${appUrl}/api/og/waitlist?handle=${encodeURIComponent(
    profile.xHandle
  )}&number=${profile.waitlistNumber}${
    profile.pfpUrl ? `&pfp_url=${encodeURIComponent(profile.pfpUrl)}` : ""
  }`;
  const tweetText = `Just joined the @fdnusd compute yield waitlist. The specialized fund for AI infrastructure — professional-grade yield on Solana. Join: ${shareUrl}`;

  return (
    <div className="fdn-page max-w-[900px] mx-auto px-4 sm:px-0">
      <div className="animate-fade-up overflow-hidden rounded-2xl border border-[var(--rule)] bg-[var(--surface)] shadow-2xl">
        
        {/* Top Progress Tabs — Integrated into Card */}
        <div className="border-b border-[var(--rule)]/30 bg-[var(--surface-strong)]/20">
          <WaitlistProgress currentStep={2} />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2">
          {/* Left Side — Share Prompt & Post Preview */}
          <div className="p-8 sm:p-10 flex flex-col justify-between min-h-[420px]">
            <div>
              <h1 className="mb-4 font-serif text-3xl font-light leading-tight text-[var(--fg)] sm:text-4xl">
                Your membership is active.
              </h1>

              <p className="mb-6 text-[14px] leading-relaxed text-[var(--text-accent)] font-light">
                Share your Genesis Pass on X to activate perpetual USDC fee sharing and secure priority access.
              </p>

              {/* Restored Sleek Post Preview Card */}
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
            </div>

            <div className="space-y-4">
              <WelcomeActions 
                shareUrl={shareUrl}
                tweetText={tweetText}
                ogImageUrl={ogImage}
                variant="default"
              />
              
              <Link
                href={isBypass ? "/alpha/welcome?bypass=true" : "/alpha/welcome"}
                className="group flex w-full items-center justify-center gap-1 rounded-lg border border-transparent py-2.5 font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--muted)] transition-all hover:text-gold-500 no-underline"
              >
                Access the Cabinet <ArrowRight className="h-3 w-3 opacity-40 transition-transform group-hover:translate-x-0.5 group-hover:opacity-100" />
              </Link>
            </div>
          </div>

          {/* Right Side — Card Preview Only */}
          <div className="flex flex-col border-l border-[var(--rule)]/30 bg-[var(--surface-strong)]/20 p-8 sm:p-10 justify-center items-center min-h-[420px]">
            <div className="w-full max-w-sm">
              <div className="relative aspect-[19/12] w-full overflow-hidden rounded-lg border border-[var(--rule)] shadow-xl bg-[var(--surface)]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={ogImage}
                  alt={`Foundation Alpha Membership Pass`}
                  className="h-full w-full object-cover"
                />
              </div>

              <p className="mt-4 text-center font-mono text-[10px] uppercase tracking-wider text-[var(--text-accent)] opacity-60">
                Genesis Pass Preview
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
