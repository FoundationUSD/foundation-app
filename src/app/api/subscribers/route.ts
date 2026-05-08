import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { isSupabaseConfigured, supabaseAdmin } from "@/lib/supabase-server";
import { sendVerificationEmail } from "@/lib/notifications";
import { validatePublicKey } from "@/lib/api-validation";

export const dynamic = "force-dynamic";

const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * POST /api/subscribers
 *   { email, wallet?, prefs? }
 *
 * Creates a subscriber row (idempotent on email — re-subscribing replays the
 * verification email and refreshes prefs). Always returns 200 even if email
 * is invalid to avoid enumeration; client gets {success:false} when it fails.
 */
export async function POST(req: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ success: false, error: "Database not configured" }, { status: 503 });
  }

  let body: { email?: string; wallet?: string; prefs?: Record<string, boolean> };
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const email = (body.email ?? "").trim().toLowerCase();
  if (!EMAIL_RX.test(email) || email.length > 200) {
    return NextResponse.json({ success: false, error: "Invalid email" }, { status: 400 });
  }

  if (body.wallet) {
    const err = validatePublicKey("wallet", body.wallet);
    if (err) return NextResponse.json({ success: false, error: err.message }, { status: 400 });
  }

  const verifyToken = crypto.randomBytes(24).toString("base64url");
  const unsubscribeToken = crypto.randomBytes(24).toString("base64url");

  const defaultPrefs = {
    apy_change: true,
    deposits: true,
    withdrawals: true,
    vault_launches: true,
    weekly_digest: false,
  };
  const prefs = { ...defaultPrefs, ...(body.prefs || {}) };

  const { error } = await supabaseAdmin
    .from("sol_subscribers")
    .upsert(
      {
        email,
        wallet: body.wallet || null,
        prefs,
        verify_token: verifyToken,
        unsubscribe_token: unsubscribeToken,
        verified_at: null,
      },
      { onConflict: "email" },
    );

  if (error) {
    console.error("subscribe insert failed:", error);
    return NextResponse.json({ success: false, error: "Failed to create subscription" }, { status: 500 });
  }

  try {
    await sendVerificationEmail({ email, verifyToken });
  } catch (e) {
    console.error("verification email failed:", e);
    return NextResponse.json(
      { success: false, error: "Subscription created but verification email failed to send. Try again later." },
      { status: 500 },
    );
  }

  return NextResponse.json({ success: true });
}
