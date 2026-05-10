/**
 * Referral primitives — server-only.
 *
 * Two operations:
 *   generateReferralCode(userId)              — call from better-auth's user.create.after
 *   linkReferral(refereeUserId, code, ip, ua) — call from a /api/referrals/link route
 *                                                that fires post-signup with the
 *                                                ?ref=CODE captured at the form step
 *
 * Activation rules (≥$100 deposited, held ≥30 days) are enforced by a separate
 * cron that updates `referral.activatedAt`. This module only handles the link.
 */

import crypto from "crypto";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { referral, referralCode, user } from "../../drizzle/schema";

/**
 * Generate an immutable referral code for a user, idempotent. Skips silently
 * if a code already exists (e.g. retry path). Returns the code.
 *
 * Codes are 8 chars of base32-ish alphanumeric (uppercase letters + digits,
 * minus easily-confused chars I/L/O/0/1). 32^8 ≈ 1.1T possibilities — collision
 * is unlikely but we retry on conflict just in case.
 */
export async function generateReferralCode(userId: string): Promise<string> {
  const existing = await db
    .select({ code: referralCode.code })
    .from(referralCode)
    .where(eq(referralCode.userId, userId))
    .limit(1);

  if (existing[0]?.code) return existing[0].code;

  const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no I/L/O/0/1
  for (let attempt = 0; attempt < 5; attempt++) {
    const buf = crypto.randomBytes(8);
    let code = "";
    for (let i = 0; i < 8; i++) code += ALPHABET[buf[i] % ALPHABET.length];

    try {
      await db.insert(referralCode).values({ code, userId });
      return code;
    } catch (e) {
      // Unique-violation on `code` PK or `user_id` UNIQUE. The UNIQUE on user_id
      // means another concurrent path already inserted; re-read and return.
      const again = await db
        .select({ code: referralCode.code })
        .from(referralCode)
        .where(eq(referralCode.userId, userId))
        .limit(1);
      if (again[0]?.code) return again[0].code;
      // Otherwise it was a code-collision — retry with a new code.
      if (attempt === 4) throw e;
    }
  }
  throw new Error("Failed to generate unique referral code after 5 attempts");
}

/**
 * Link a referee to a referrer using the code captured at signup. Idempotent
 * per referee (UNIQUE on referee_user_id). Self-referral is rejected at the DB
 * level via the foreign-key + check at insert time.
 *
 * Returns:
 *   { ok: true }                          — linked
 *   { ok: false, reason: "no-such-code" } — code doesn't exist
 *   { ok: false, reason: "self" }         — referee tried to use their own code
 *   { ok: false, reason: "already-linked" } — referee already has a referrer
 */
export async function linkReferral(params: {
  refereeUserId: string;
  code: string;
  ip?: string | null;
  userAgent?: string | null;
}): Promise<
  | { ok: true; referrerUserId: string }
  | { ok: false; reason: "no-such-code" | "self" | "already-linked" }
> {
  const code = params.code.trim().toUpperCase();
  if (!code) return { ok: false, reason: "no-such-code" };

  const codeRow = await db
    .select({ userId: referralCode.userId })
    .from(referralCode)
    .where(eq(referralCode.code, code))
    .limit(1);

  const referrerUserId = codeRow[0]?.userId;
  if (!referrerUserId) return { ok: false, reason: "no-such-code" };
  if (referrerUserId === params.refereeUserId) return { ok: false, reason: "self" };

  // Sanity: the referrer user still exists (FK is cascade-on-delete, so a stale
  // code shouldn't exist, but check anyway).
  const referrerExists = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.id, referrerUserId))
    .limit(1);
  if (!referrerExists[0]) return { ok: false, reason: "no-such-code" };

  const existing = await db
    .select({ id: referral.id })
    .from(referral)
    .where(eq(referral.refereeUserId, params.refereeUserId))
    .limit(1);
  if (existing[0]) return { ok: false, reason: "already-linked" };

  await db.insert(referral).values({
    id: crypto.randomUUID(),
    referrerUserId,
    refereeUserId: params.refereeUserId,
    codeUsed: code,
    signupIp: params.ip ?? null,
    signupUserAgent: params.userAgent ?? null,
  });

  return { ok: true, referrerUserId };
}
