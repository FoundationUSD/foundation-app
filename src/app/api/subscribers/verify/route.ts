import { NextRequest, NextResponse } from "next/server";
import { isSupabaseConfigured, supabaseAdmin } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://fdnusd.com";

/**
 * GET /api/subscribers/verify?t=<token>
 * Marks subscriber as verified, clears verify_token, redirects to /subscribed.
 */
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("t");
  if (!token) return NextResponse.redirect(`${APP_URL}/subscribed?status=invalid`);
  if (!isSupabaseConfigured()) return NextResponse.redirect(`${APP_URL}/subscribed?status=unavailable`);

  const { data } = await supabaseAdmin
    .from("sol_subscribers")
    .select("id")
    .eq("verify_token", token)
    .limit(1)
    .single();

  if (!data) return NextResponse.redirect(`${APP_URL}/subscribed?status=invalid`);

  await supabaseAdmin
    .from("sol_subscribers")
    .update({ verified_at: new Date().toISOString(), verify_token: null })
    .eq("id", data.id);

  return NextResponse.redirect(`${APP_URL}/subscribed?status=ok`);
}
