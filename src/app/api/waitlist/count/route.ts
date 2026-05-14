/**
 * GET /api/waitlist/count — total FCY waitlist signups.
 * Pulls from `waitlist_profile`; revalidates every 60s.
 */

import { NextResponse } from "next/server";
import { countWaitlistProfiles } from "@/lib/waitlist/profile";

export const runtime = "nodejs";
export const revalidate = 60;

export async function GET() {
  try {
    const count = await countWaitlistProfiles();
    return NextResponse.json(
      { count },
      { headers: { "Cache-Control": "public, max-age=60, s-maxage=60" } },
    );
  } catch (e) {
    console.error("[waitlist/count] failed:", e);
    return NextResponse.json({ count: 0 }, { status: 200 });
  }
}
