/**
 * Waitlist profile helpers — server-only.
 *
 * Materialises a `waitlist_profile` row for any user that signed in via the
 * Twitter social provider. We hit X's /2/users/me with the access token
 * better-auth stored in the `account` row to pull the authoritative
 * username + high-res PFP + (with the users.email scope) the confirmed
 * email, which we store as notification_email for delivery.
 *
 * For users that signed in with Email OTP only, no waitlist_profile is
 * created — they're regular auth users.
 */

import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { account, user, waitlistProfile } from "../../../drizzle/schema";

interface XProfile {
  id: string;
  username: string;
  name: string;
  profile_image_url?: string;
  confirmed_email?: string;
}

/** Fetch the X user profile using the access token better-auth saved. */
async function fetchXProfile(accessToken: string): Promise<XProfile | null> {
  try {
    const url = new URL("https://api.twitter.com/2/users/me");
    url.searchParams.set(
      "user.fields",
      "id,username,name,profile_image_url,confirmed_email",
    );
    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { data?: XProfile };
    return json?.data ?? null;
  } catch {
    return null;
  }
}

function highResPfp(url: string | null | undefined): string | null {
  if (!url) return null;
  return url.replace(/_normal(?=\.\w+$)/, "");
}

/**
 * Read the Twitter account row for a user (if any) and write/update the
 * corresponding waitlist_profile. Idempotent — safe to call on retries.
 *
 * Returns the resulting profile, or null if the user has no Twitter account
 * linked (e.g. email-only signup).
 */
export async function upsertWaitlistProfileForUser(userId: string) {
  const [twitterAccount] = await db
    .select()
    .from(account)
    .where(and(eq(account.userId, userId), eq(account.providerId, "twitter")))
    .limit(1);

  if (!twitterAccount) return null;

  const [u] = await db.select().from(user).where(eq(user.id, userId)).limit(1);
  if (!u) return null;

  // Pull authoritative fields straight from X: username, high-res PFP, and
  // (with users.email scope) confirmed_email. Graceful fallback to the
  // user-row values if the API call fails.
  const xProfile = twitterAccount.accessToken
    ? await fetchXProfile(twitterAccount.accessToken)
    : null;

  const xHandle =
    xProfile?.username ||
    u.name?.replace(/\s+/g, "").toLowerCase() ||
    "anon";
  const displayName = xProfile?.name || u.name || null;
  const pfpUrl = highResPfp(xProfile?.profile_image_url) || u.image || null;
  const notificationEmail =
    xProfile?.confirmed_email?.toLowerCase().trim() || null;

  const [existing] = await db
    .select()
    .from(waitlistProfile)
    .where(eq(waitlistProfile.userId, userId))
    .limit(1);

  if (existing) {
    // Re-runs (e.g. self-heal on /alpha/welcome) — refresh derived fields
    // from the latest X profile without changing waitlist_number.
    if (
      existing.xHandle !== xHandle ||
      existing.displayName !== displayName ||
      existing.pfpUrl !== pfpUrl ||
      (notificationEmail && existing.notificationEmail !== notificationEmail)
    ) {
      const [updated] = await db
        .update(waitlistProfile)
        .set({
          xHandle,
          displayName,
          pfpUrl,
          notificationEmail: notificationEmail ?? existing.notificationEmail,
        })
        .where(eq(waitlistProfile.userId, userId))
        .returning();
      return updated;
    }
    return existing;
  }

  const [inserted] = await db
    .insert(waitlistProfile)
    .values({
      userId,
      xUserId: twitterAccount.accountId,
      xHandle,
      displayName,
      pfpUrl,
      notificationEmail,
    })
    .returning();

  return inserted;
}

export async function getWaitlistProfileByUserId(userId: string) {
  const [row] = await db
    .select()
    .from(waitlistProfile)
    .where(eq(waitlistProfile.userId, userId))
    .limit(1);
  return row ?? null;
}

export async function getWaitlistProfileByHandle(handle: string) {
  const normalized = handle.toLowerCase().replace(/^@/, "");
  const [row] = await db
    .select()
    .from(waitlistProfile)
    .where(eq(waitlistProfile.xHandle, normalized))
    .limit(1);
  return row ?? null;
}

export async function countWaitlistProfiles(): Promise<number> {
  const rows = await db.select({ userId: waitlistProfile.userId }).from(waitlistProfile);
  return rows.length;
}
