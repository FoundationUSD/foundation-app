# FCY Waitlist v2 — X (Twitter) sign-in + personalised share banner

## What changed

The FCY waitlist now signs users in with X (Twitter). Everything we need —
identity, handle, PFP, and email — comes from the X profile in one step. No
email input, no OTP, no second step. The X flow:

- Captures a verified social identity (handle + PFP + confirmed email)
- Generates a personalised share banner the user can post to X
- Builds in referral attribution via the existing `referral_code` system

The email-OTP modal (`FcyWaitlistModal`) is **kept** as an alternate path for
users who don't have an X account. Nothing about the landing-page surface or
its Supabase Edge Function was touched.

## Architecture

```
User clicks "Sign in with X" on /compute
  → authClient.signIn.social({ provider: "twitter" })
  → better-auth redirect → twitter.com/i/oauth2/authorize (PKCE)
  → callback → {BETTER_AUTH_URL}/api/auth/callback/twitter
  → better-auth writes `user`, `account`, `session` rows
  → user.create.after hook fires:
       - generateReferralCode(userId)
       - upsertWaitlistProfileForUser(userId)
  → redirect to /alpha/welcome
```

Tables involved (all already in `drizzle/schema.ts`):

- `user` — better-auth core, gets a synthetic email `${x_user_id}@x.fdnusd.local`
- `account` — better-auth core, `providerId='twitter'`, `accountId=<x_user_id>`
- `session` — better-auth core, signed httpOnly cookie
- `referral_code` — Foundation referral primitive
- **`waitlist_profile`** — NEW; one row per X signup, holds `x_user_id`,
  `x_handle`, `display_name`, `pfp_url`, `waitlist_number` (serial), and
  optional `notification_email`

## Required env vars

```
TWITTER_CLIENT_ID=<from developer.x.com>
TWITTER_CLIENT_SECRET=<from developer.x.com>

# These are already present and required by the existing better-auth flow:
BETTER_AUTH_SECRET=<openssl rand -base64 32>
BETTER_AUTH_URL=https://demo.fdnusd.com
NEXT_PUBLIC_APP_URL=https://demo.fdnusd.com
DATABASE_URL=postgres://...
```

## X Developer Portal setup

1. Go to https://developer.x.com → your Project → Authentication Settings.
2. **Type of App**: Web App.
3. **App permissions**: Read.
4. **Request email from users**: ON. This unlocks the `users.email` OAuth 2.0
   scope, which is how we read `confirmed_email` from `/2/users/me`. X
   requires both **Privacy Policy URL** and **Terms of Service URL** before
   this toggle can be enabled — point these at `https://fdnusd.com/privacy`
   and `https://fdnusd.com/terms`.
5. **OAuth 2.0**: enable. PKCE is mandatory for OAuth 2.0; better-auth
   handles the PKCE flow automatically — you don't configure it.
6. **Callback URI / Redirect URL**: add both
   - `https://demo.fdnusd.com/api/auth/callback/twitter` (production)
   - `https://<your-ngrok>.ngrok.app/api/auth/callback/twitter` (local dev)
7. **Website URL**: `https://fdnusd.com`.
8. Save. Copy **Client ID** + **Client Secret** to `.env.local`.

## Files

| Path | Purpose |
|---|---|
| `drizzle/schema.ts` | `waitlistProfile` table definition |
| `drizzle/migrations/0001_waitlist_profile.sql` | Migration SQL |
| `src/lib/auth/server.ts` | Adds `socialProviders.twitter` + hook for waitlist row |
| `src/lib/waitlist/profile.ts` | Server-only helpers: upsert, lookup, count, email |
| `src/components/SignInWithX.tsx` | Sign-in button (inline X SVG) |
| `src/components/WaitlistCounter.tsx` | Live counter for `/compute` |
| `src/app/api/og/waitlist/route.tsx` | `next/og` ImageResponse — personalised banner |
| `src/app/api/waitlist/count/route.ts` | Count endpoint |
| `src/app/alpha/welcome/page.tsx` | Logged-in landing — banner + share |
| `src/app/alpha/welcome/WelcomeActions.tsx` | Client island for share/copy |
| `src/app/share/[handle]/page.tsx` | Public unfurl page with OG tags |
| `public/waitlist_banner.png` | Background template (already in repo) |

## Banner asset

The template lives at `public/waitlist_banner.png` (1200×900). The OG route
overlays the user's PFP, @handle, and waitlist number on top.

If the overlays don't line up with the template's gold circle, tune the
`BANNER` constants at the top of `src/app/api/og/waitlist/route.tsx`. The
coords are in 1200×900 image space.

## Apply the migration

The project uses `drizzle-kit`. Two options:

```bash
# Option A — generate from schema diff (preferred; produces a proper named
# migration + snapshot)
bun x drizzle-kit generate

# Option B — apply the hand-written SQL directly
psql "$DATABASE_URL" -f drizzle/migrations/0001_waitlist_profile.sql
```

If you go with Option A, drizzle-kit will produce a new `000X_<name>.sql` and
update `drizzle/migrations/meta/*`. You can then delete the hand-written
`0001_waitlist_profile.sql` to avoid duplicates.

## Test locally with ngrok

X OAuth requires HTTPS callback URLs, so plain `localhost` won't work for the
callback. Use ngrok:

```bash
# In one terminal
bun dev

# In another
ngrok http 3000
```

ngrok will give you a public HTTPS URL like `https://1234.ngrok.app`. Add
`https://1234.ngrok.app/api/auth/callback/twitter` to your X app's callback
list, then set:

```bash
BETTER_AUTH_URL=https://1234.ngrok.app
NEXT_PUBLIC_APP_URL=https://1234.ngrok.app
```

Restart `bun dev`. Visit `https://1234.ngrok.app/compute`, click "Sign in
with X", complete the OAuth dance, and you should land at `/alpha/welcome`.

## Test the OG image without OAuth

```
http://localhost:3000/api/og/waitlist?handle=vivek&number=42&pfp_url=https%3A%2F%2Fpbs.twimg.com%2Fprofile_images%2F1234567890%2Fxxx.jpg
```

Should return a 1200×900 PNG. The PFP URL must allow hot-linking (X's
`pbs.twimg.com` does).

## Referral attribution

When someone visits `/share/<handle>`, the page drops a `fdn_ref` cookie with
the page-owner's referral code. If they then sign up with X, you can
plug `linkReferral(refereeUserId, code, ip, ua)` into the `user.create.after`
hook to consume the cookie — that wiring lives next to `generateReferralCode`
in `src/lib/auth/server.ts` and can be added incrementally.

## Operational notes

- **Two emails per user.** `user.email` is a synthetic identifier
  (`<x_user_id>@x.fdnusd.local`) — never sent to. `waitlist_profile.notification_email`
  is the real, X-confirmed address we use for product email. The synthetic
  pattern lets us satisfy better-auth's NOT-NULL/unique constraint on
  `user.email` without colliding when the same X user has an existing
  email-OTP account.
- `emailVerified=false` for Twitter signups by design. X already verified
  the email on their side; we just don't claim our own verification.
- If a single human signs up with both X and Email OTP, they end up with
  **two** `user` rows. We accept this for v1 — account merging is a
  separate feature.
- `waitlist_number` is a Postgres `serial`. Positions are stable and
  chronological. Deleted rows leave gaps — fine for an early-access list.
- The OG image route is cached `immutable, max-age=31536000` per-URL.
  Cache busts naturally when any query param (PFP url, number) changes.
