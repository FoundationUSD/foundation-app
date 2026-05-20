/**
 * better-auth server instance — Email OTP only (passwordless).
 *
 * Why better-auth:
 *   - Battle-tested session model (HTTP-only cookies, encrypted tokens, CSRF guards)
 *   - Mandatory email verification before session creation
 *   - Replaces the home-rolled sol_users / sol_otp_codes / sol_sessions schema
 *     that was flagged for missing hashing guarantees and CSRF protection
 *
 * Referrals: layered on top via `databaseHooks.user.create.after`. Every newly
 * created user gets a `referral_code` row automatically. Linking a referee to
 * a referrer happens via `linkReferral()` from a separate post-signup call
 * carrying the `?ref=CODE` captured at the form step.
 */

import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { emailOTP } from "better-auth/plugins";
import { Resend } from "resend";
import { db } from "@/lib/db";
import * as schema from "../../../drizzle/schema";
import { cookies as nextCookies, headers as nextRequestHeaders } from "next/headers";
import { generateReferralCode, linkReferral } from "@/lib/referrals";
import { upsertWaitlistProfileForUser } from "@/lib/waitlist/profile";

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const EMAIL_FROM = process.env.EMAIL_FROM || "Foundation <notifications@fdnusd.com>";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
const BETTER_AUTH_SECRET = process.env.BETTER_AUTH_SECRET;
const BETTER_AUTH_URL = process.env.BETTER_AUTH_URL || APP_URL;
// X OAuth 2.0 creds — better-auth's social provider key is still "twitter"
// internally, but the env vars are namespaced X_* to match X's current portal.
const X_CLIENT_ID = process.env.X_CLIENT_ID;
const X_CLIENT_SECRET = process.env.X_CLIENT_SECRET;

const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;

if (!BETTER_AUTH_SECRET) {
  // Don't throw at import — `next build` does static analysis that reaches this
  // module even when the deploy hasn't injected secrets yet. Each request through
  // the auth handler will still fail loudly because better-auth refuses to operate
  // with the build-time placeholder. Production must set BETTER_AUTH_SECRET.
  console.warn("BETTER_AUTH_SECRET is not set — auth requests will fail until configured.");
}

// Build-time placeholder lets the module instantiate during SSG without throwing.
// At runtime, better-auth will reject this placeholder and the request will 5xx
// with a clear "default secret" error pointing at the missing env var.
const SECRET_PLACEHOLDER = "fdn-build-placeholder-not-for-runtime-use-set-BETTER_AUTH_SECRET";

export const auth = betterAuth({
  secret: BETTER_AUTH_SECRET || SECRET_PLACEHOLDER,
  baseURL: BETTER_AUTH_URL,
  trustedOrigins: [APP_URL, "http://localhost:3000"].filter(Boolean) as string[],

  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: schema.user,
      session: schema.session,
      account: schema.account,
      verification: schema.verification,
    },
  }),

  // Crypto product → shorter sessions to limit token-exposure window if a cookie
  // ever leaks. 3 days vs. better-auth's 7-day default.
  session: {
    expiresIn: 60 * 60 * 24 * 3,
    updateAge: 60 * 60 * 24,
  },

  emailAndPassword: {
    // Disabled: passwordless via Email OTP plugin.
    enabled: false,
  },

  /* ----------------------------------------------------------
     Social providers — X (Twitter) for FCY waitlist signup.
     X OAuth 2.0 does NOT return email; we synthesise one so
     better-auth's NOT-NULL email constraint is satisfied. The
     real X handle + PFP land in waitlist_profile via the
     user.create.after hook below. Users can optionally add a
     notification email later on /alpha/welcome.
     ---------------------------------------------------------- */
  socialProviders:
    X_CLIENT_ID && X_CLIENT_SECRET
      ? {
          twitter: {
            clientId: X_CLIENT_ID,
            clientSecret: X_CLIENT_SECRET,
            // Drop better-auth's default `users.email` scope: X rejects the
            // OAuth request with "Something went wrong" when the app hasn't
            // fully been granted email release on console.x.com — even with
            // the "Request email from users" toggle on, propagation/save
            // workflow is finicky. We synthesise an email from the X user id
            // in getUserInfo below, so dropping the scope is safe.
            disableDefaultScope: true,
            scope: ["users.read", "tweet.read", "offline.access"],

            // Override getUserInfo because better-auth's default returns null
            // on any non-2xx from /2/users/me and swallows the underlying X
            // response, leaving us with a generic `unable_to_get_user_info`.
            // This version logs the real status + body and uses a single
            // /2/users/me call requesting every field we need.
            getUserInfo: async (token) => {
              const accessToken = (token as { accessToken?: string })
                ?.accessToken;
              if (!accessToken) {
                console.error("[twitter] getUserInfo: no access token");
                return null;
              }

              const url =
                "https://api.x.com/2/users/me?user.fields=id,name,username,profile_image_url";
              const res = await fetch(url, {
                headers: { Authorization: `Bearer ${accessToken}` },
              });

              if (!res.ok) {
                const body = await res.text().catch(() => "<no body>");
                console.error(
                  "[twitter] /2/users/me failed:",
                  res.status,
                  res.statusText,
                  body,
                );
                return null;
              }

              const json = (await res.json()) as {
                data?: {
                  id: string;
                  name?: string;
                  username?: string;
                  profile_image_url?: string;
                  confirmed_email?: string;
                };
              };
              const profile = json?.data;
              if (!profile?.id) {
                console.error(
                  "[twitter] /2/users/me missing data.id:",
                  JSON.stringify(json),
                );
                return null;
              }

              const username = profile.username ?? profile.id;
              const name = profile.name ?? username;
              const image = (profile.profile_image_url ?? "").replace(
                /_normal(?=\.\w+$)/,
                "",
              );
              // X confirmed email when granted; otherwise synthetic for
              // better-auth's NOT-NULL email constraint.
              const email =
                profile.confirmed_email?.toLowerCase() ||
                `${profile.id}@x.fdnusd.local`;

              return {
                user: {
                  id: profile.id,
                  name,
                  email,
                  image: image || undefined,
                  emailVerified: Boolean(profile.confirmed_email),
                },
                data: { data: profile },
              };
            },
          },
        }
      : undefined,

  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
  },

  plugins: [
    emailOTP({
      otpLength: 6,
      expiresIn: 5 * 60, // 5 minutes
      sendVerificationOnSignUp: true,
      async sendVerificationOTP({ email, otp, type }) {
        if (!resend) {
          console.warn(`[auth] RESEND_API_KEY not set — would have sent OTP ${otp} to ${email} (${type})`);
          return;
        }
        const subject =
          type === "sign-in"
            ? "Your Foundation sign-in code"
            : type === "email-verification"
              ? "Verify your Foundation email"
              : "Your Foundation security code";
        await resend.emails.send({
          from: EMAIL_FROM,
          to: email,
          subject,
          html: renderOtpEmail({ otp, type }),
        });
      },
    }),
  ],

  databaseHooks: {
    user: {
      create: {
        after: async (createdUser) => {
          // Idempotent: generateReferralCode is upsert-safe.
          try {
            await generateReferralCode(createdUser.id);
          } catch (e) {
            console.error("[auth] referral code generation failed for", createdUser.id, e);
          }
          // If this user signed in via Twitter, materialise their waitlist_profile
          // from the account row better-auth just inserted. Idempotent.
          try {
            await upsertWaitlistProfileForUser(createdUser.id);
          } catch (e) {
            console.error("[auth] waitlist profile upsert failed for", createdUser.id, e);
          }
          // Attribute the referral if they arrived from /share/<handle>. The
          // `fdn_ref` cookie was dropped by /api/auth/x/start and survives the
          // X OAuth round-trip via SameSite=Lax. linkReferral is idempotent
          // and silently no-ops on self/already-linked.
          try {
            const cookieStore = await nextCookies();
            const ref = cookieStore.get("fdn_ref")?.value;
            if (ref) {
              const reqHeaders = await nextRequestHeaders();
              await linkReferral({
                refereeUserId: createdUser.id,
                code: ref,
                ip:
                  reqHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ??
                  reqHeaders.get("x-real-ip") ??
                  null,
                userAgent: reqHeaders.get("user-agent"),
              });
            }
          } catch (e) {
            console.error("[auth] linkReferral failed for", createdUser.id, e);
          }
        },
      },
    },
  },
});

export type Session = typeof auth.$Infer.Session;

/* ============================================================
   Email rendering — kept inline to avoid a circular import with
   src/lib/notifications.ts (which uses sol_subscribers, separate flow).
   ============================================================ */

function renderOtpEmail({
  otp,
  type,
}: {
  otp: string;
  type: "sign-in" | "email-verification" | "forget-password" | "change-email" | string;
}): string {
  const title =
    type === "sign-in"
      ? "Sign in to Foundation"
      : type === "email-verification"
        ? "Verify your email"
        : type === "change-email"
          ? "Confirm your new email"
          : "Reset your password";
  const body =
    type === "sign-in"
      ? "Use this code to sign in. It expires in 5 minutes."
      : type === "email-verification"
        ? "Use this code to verify your email and finish creating your Foundation account. It expires in 5 minutes."
        : type === "change-email"
          ? "Use this code to confirm your new email address. It expires in 5 minutes."
          : "Use this code to continue. It expires in 5 minutes.";

  return `<!doctype html>
<html><body style="margin:0;padding:0;background:#f6f7f9;font-family:ui-sans-serif,system-ui,sans-serif;color:#0f172a;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="480" cellspacing="0" cellpadding="0" style="background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
        <tr><td style="padding:24px 28px 0 28px;">
          <div style="font-family:ui-serif,Georgia,serif;font-size:13px;letter-spacing:0.18em;text-transform:uppercase;color:#b8960c;">Foundation<span style="color:#0f172a;">.</span></div>
        </td></tr>
        <tr><td style="padding:14px 28px 4px 28px;">
          <h1 style="margin:0;font-family:ui-serif,Georgia,serif;font-weight:300;font-size:24px;line-height:1.25;color:#0f172a;">${escapeHtml(title)}</h1>
        </td></tr>
        <tr><td style="padding:8px 28px 16px 28px;">
          <p style="margin:0;font-size:14px;line-height:1.55;color:#334155;">${escapeHtml(body)}</p>
        </td></tr>
        <tr><td style="padding:8px 28px 24px 28px;text-align:center;">
          <div style="display:inline-block;padding:14px 22px;background:#0f172a;color:#ffffff;border-radius:8px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:24px;font-weight:600;letter-spacing:0.32em;">${escapeHtml(otp)}</div>
        </td></tr>
        <tr><td style="padding:18px 28px 22px 28px;border-top:1px solid #e2e8f0;font-size:11px;color:#64748b;">
          If you didn't request this, you can ignore this email.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
