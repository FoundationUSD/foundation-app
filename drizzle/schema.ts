/**
 * Drizzle schema — better-auth core tables + Foundation referral primitive.
 *
 * The first four tables (user, session, account, verification) are required by
 * better-auth; their column names must match the library's defaults exactly.
 * See: https://www.better-auth.com/docs/concepts/database
 *
 * Referral tables sit on top of `user.id` and are entirely Foundation-owned.
 * Activation rules (≥ $100 deposited, held ≥ 30 days) are computed by a cron
 * that updates `referrals.activated_at`; the schema supports the model but does
 * not enforce it in DB.
 */

import {
  pgTable,
  text,
  timestamp,
  boolean,
  integer,
  numeric,
  serial,
  uniqueIndex,
  index,
  primaryKey,
} from "drizzle-orm/pg-core";

/* ============================================================
   better-auth core tables
   ============================================================ */

export const user = pgTable(
  "user",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull().unique(),
    emailVerified: boolean("email_verified").notNull().default(false),
    image: text("image"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    emailIdx: uniqueIndex("user_email_idx").on(t.email),
  }),
);

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    token: text("token").notNull().unique(),
    expiresAt: timestamp("expires_at").notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index("session_user_idx").on(t.userId),
    expiresIdx: index("session_expires_idx").on(t.expiresAt),
  }),
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at"),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
    scope: text("scope"),
    idToken: text("id_token"),
    password: text("password"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index("account_user_idx").on(t.userId),
    providerAccountUnique: uniqueIndex("account_provider_account_idx").on(
      t.providerId,
      t.accountId,
    ),
  }),
);

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    identifierIdx: index("verification_identifier_idx").on(t.identifier),
  }),
);

/* ============================================================
   Foundation referrals — built on top of `user.id`
   ============================================================ */

/**
 * One immutable referral code per user, generated automatically at signup
 * via better-auth's databaseHooks.user.create.after callback.
 */
export const referralCode = pgTable(
  "referral_code",
  {
    code: text("code").primaryKey(),
    userId: text("user_id")
      .notNull()
      .unique()
      .references(() => user.id, { onDelete: "cascade" }),
    uses: integer("uses").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
);

/**
 * Referrer→referee link. One row per referee (lifetime).
 *   activatedAt   — set when referee meets thresholds (≥$100 deposit, ≥30 days held).
 *                   Computed by a cron, not enforced at insert.
 *   deactivatedAt — set if referee withdraws everything to 0.
 */
export const referral = pgTable(
  "referral",
  {
    id: text("id").primaryKey(),
    referrerUserId: text("referrer_user_id")
      .notNull()
      .references(() => user.id),
    refereeUserId: text("referee_user_id")
      .notNull()
      .unique()
      .references(() => user.id, { onDelete: "cascade" }),
    codeUsed: text("code_used").notNull(),
    activatedAt: timestamp("activated_at"),
    deactivatedAt: timestamp("deactivated_at"),
    signupIp: text("signup_ip"),
    signupUserAgent: text("signup_user_agent"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    referrerIdx: index("referral_referrer_idx").on(t.referrerUserId),
  }),
);

/**
 * Monthly payout ledger. Computed by a cron that sums each active referee's
 * yield in [periodStart, periodEnd], applies the 10% management fee, and scales
 * by the referrer's tier-determined share (20–35%).
 *
 * Settlement (paidAt + payoutTx) is a separate offline step.
 */
export const referralPayout = pgTable(
  "referral_payout",
  {
    id: text("id").primaryKey(),
    referrerUserId: text("referrer_user_id")
      .notNull()
      .references(() => user.id),
    periodStart: timestamp("period_start").notNull(),
    periodEnd: timestamp("period_end").notNull(),
    refereeCount: integer("referee_count").notNull(),
    totalRefereeYieldUsdc: numeric("total_referee_yield_usdc").notNull().default("0"),
    feeCollectedUsdc: numeric("fee_collected_usdc").notNull().default("0"),
    referralShareBps: integer("referral_share_bps").notNull(),
    payoutUsdc: numeric("payout_usdc").notNull().default("0"),
    paidAt: timestamp("paid_at"),
    payoutTx: text("payout_tx"),
    computedAt: timestamp("computed_at").notNull().defaultNow(),
  },
  (t) => ({
    referrerPeriodUnique: uniqueIndex("referral_payout_referrer_period_idx").on(
      t.referrerUserId,
      t.periodStart,
    ),
  }),
);

/* ============================================================
   FCY waitlist — X (Twitter) signup profile
   ============================================================
   Sits on top of better-auth's `user` row created during the Twitter social
   sign-in. Holds the X-specific fields plus an optional notification email
   the user can add post-signup (no verification — it's newsletter-style).
   waitlistNumber is serial so positions are stable and chronological. */
export const waitlistProfile = pgTable(
  "waitlist_profile",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => user.id, { onDelete: "cascade" }),
    xUserId: text("x_user_id").notNull().unique(),
    xHandle: text("x_handle").notNull(),
    displayName: text("display_name"),
    pfpUrl: text("pfp_url"),
    waitlistNumber: serial("waitlist_number").notNull(),
    notificationEmail: text("notification_email"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    xHandleIdx: index("waitlist_profile_x_handle_idx").on(t.xHandle),
    numberIdx: uniqueIndex("waitlist_profile_number_idx").on(t.waitlistNumber),
  }),
);

/* ============================================================
   Type exports
   ============================================================ */

export type User = typeof user.$inferSelect;
export type Session = typeof session.$inferSelect;
export type ReferralCode = typeof referralCode.$inferSelect;
export type Referral = typeof referral.$inferSelect;
export type ReferralPayout = typeof referralPayout.$inferSelect;
export type WaitlistProfile = typeof waitlistProfile.$inferSelect;
