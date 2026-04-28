import { NextRequest, NextResponse } from "next/server";
import { isSupabaseConfigured, supabaseAdmin } from "@/lib/supabase-server";
import { validatePublicKey } from "@/lib/api-validation";

export const dynamic = "force-dynamic";

/**
 * GET /api/notifications?wallet=<pk>&limit=20
 *
 * Returns the user's notifications + broadcasts (wallet IS NULL) in
 * reverse-chronological order. Includes unread count for the bell badge.
 */
export async function GET(req: NextRequest) {
  const wallet = req.nextUrl.searchParams.get("wallet");
  const limit = Math.min(Number(req.nextUrl.searchParams.get("limit") || "30"), 100);

  if (!wallet) {
    return NextResponse.json({ success: false, error: "wallet param required" }, { status: 400 });
  }
  const err = validatePublicKey("wallet", wallet);
  if (err) return NextResponse.json({ success: false, error: err.message }, { status: 400 });

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ success: true, data: { items: [], unread: 0 } });
  }

  // User-specific notifications + broadcasts (wallet IS NULL)
  const { data, error } = await supabaseAdmin
    .from("sol_notifications")
    .select("id,type,title,body,link,metadata,read_at,created_at,wallet")
    .or(`wallet.eq.${wallet},wallet.is.null`)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  const unread = (data ?? []).filter((n) => n.read_at === null).length;

  return NextResponse.json({ success: true, data: { items: data ?? [], unread } });
}

/**
 * POST /api/notifications
 *   { wallet, action: "mark_read" | "mark_all_read", id? }
 *
 * Mark a single notification or all of a user's notifications as read.
 */
export async function POST(req: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ success: false, error: "Database not configured" }, { status: 503 });
  }

  let body: { wallet?: string; action?: string; id?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.wallet) {
    return NextResponse.json({ success: false, error: "wallet required" }, { status: 400 });
  }
  const err = validatePublicKey("wallet", body.wallet);
  if (err) return NextResponse.json({ success: false, error: err.message }, { status: 400 });

  const now = new Date().toISOString();

  if (body.action === "mark_read") {
    if (!body.id) {
      return NextResponse.json({ success: false, error: "id required for mark_read" }, { status: 400 });
    }
    // Only allow marking your own (or broadcasts you've seen)
    await supabaseAdmin
      .from("sol_notifications")
      .update({ read_at: now })
      .eq("id", body.id)
      .or(`wallet.eq.${body.wallet},wallet.is.null`);
    return NextResponse.json({ success: true });
  }

  if (body.action === "mark_all_read") {
    await supabaseAdmin
      .from("sol_notifications")
      .update({ read_at: now })
      .or(`wallet.eq.${body.wallet},wallet.is.null`)
      .is("read_at", null);
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ success: false, error: "Unknown action" }, { status: 400 });
}
