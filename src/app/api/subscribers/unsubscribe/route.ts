import { NextRequest, NextResponse } from "next/server";
import { isSupabaseConfigured, supabaseAdmin } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://fdnusd.com";

/**
 * GET /api/subscribers/unsubscribe?t=<token>
 * One-shot delete by token. We hard-delete rather than mark inactive — keeps
 * the table tidy and avoids ever re-emailing the user by mistake.
 */
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("t");
  if (!token) return NextResponse.redirect(`${APP_URL}/subscribed?status=invalid`);
  if (!isSupabaseConfigured()) return NextResponse.redirect(`${APP_URL}/subscribed?status=unavailable`);

  await supabaseAdmin.from("sol_subscribers").delete().eq("unsubscribe_token", token);

  return NextResponse.redirect(`${APP_URL}/subscribed?status=unsubscribed`);
}
