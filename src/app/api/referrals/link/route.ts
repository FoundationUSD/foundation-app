/**
 * POST /api/referrals/link
 *
 * Lets an already-signed-in user attach a referral code post-hoc — for users
 * who signed up without going through /share/<handle>. Idempotent: silently
 * no-ops once a referee row exists (DB UNIQUE on referee_user_id).
 *
 * Body: { code: string }
 * Returns:
 *   { ok: true }                       — newly linked
 *   { ok: false, reason: "..." }       — see linkReferral() for codes
 */

import { headers as nextHeaders } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { linkReferral } from "@/lib/referrals";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CODE_RE = /^[A-Z0-9]{6,12}$/;

export async function POST(req: Request) {
  const headerList = await nextHeaders();
  const session = await auth.api.getSession({ headers: headerList });
  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, reason: "unauthorized" }, { status: 401 });
  }

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

  const result = await linkReferral({
    refereeUserId: session.user.id,
    code: raw,
    ip:
      headerList.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      headerList.get("x-real-ip") ??
      null,
    userAgent: headerList.get("user-agent"),
  });

  if (!result.ok) {
    const status =
      result.reason === "no-such-code"
        ? 404
        : result.reason === "self" || result.reason === "already-linked"
          ? 409
          : 400;
    return NextResponse.json(result, { status });
  }

  return NextResponse.json({ ok: true });
}
