/**
 * POST /api/referrals/capture
 *
 * Drops the `fdn_ref` cookie for a pre-signup visitor who pasted a referral
 * code into the join form (instead of arriving via /share/<handle>). The
 * cookie survives the X OAuth round-trip and is consumed in
 * databaseHooks.user.create.after, exactly like the /share path.
 *
 * Body: { code: string }
 * Returns: { ok: true } or { ok: false, reason: "invalid" | "unknown" }
 *
 * No auth required — anyone visiting the join page can call this.
 */

import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { referralCode } from "../../../../../drizzle/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CODE_RE = /^[A-Z0-9]{6,12}$/;

export async function POST(req: Request) {
  let body: { code?: unknown };
  try {
    body = (await req.json()) as { code?: unknown };
  } catch {
    return NextResponse.json({ ok: false, reason: "invalid" }, { status: 400 });
  }

  const raw = typeof body.code === "string" ? body.code.trim().toUpperCase() : "";
  if (!CODE_RE.test(raw)) {
    return NextResponse.json({ ok: false, reason: "invalid" }, { status: 400 });
  }

  // Confirm the code actually exists before persisting — saves us from
  // attributing later signups to junk a user typed in.
  const row = await db
    .select({ code: referralCode.code })
    .from(referralCode)
    .where(eq(referralCode.code, raw))
    .limit(1);

  if (!row[0]) {
    return NextResponse.json({ ok: false, reason: "unknown" }, { status: 404 });
  }

  const res = NextResponse.json({ ok: true, code: raw });
  res.headers.set(
    "set-cookie",
    `fdn_ref=${raw}; Path=/; Max-Age=${60 * 60 * 24 * 30}; HttpOnly; Secure; SameSite=Lax`,
  );
  return res;
}
