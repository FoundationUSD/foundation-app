import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Beta middleware — waitlist-only build.
 * On ft/beta we strip the full product (Invest/Portfolio/Compute/AWY/etc.)
 * from the nav and footer, but the page files still ship in the bundle. Any
 * direct link into those surfaces gets bounced to /alpha so the only thing
 * users can reach on beta.fdnusd.com is the waitlist flow.
 *
 * Allowed paths: /alpha/**, /share/**, /api/**, and static assets handled by
 * the matcher exclusion below.
 */

const BLOCKED_PREFIXES = [
  "/invest",
  "/portfolio",
  "/compute",
  "/awy",
  "/transparency",
  "/security",
  "/rebalance",
  "/risk",
  "/subscribed",
  "/strategy",
];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (BLOCKED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    const url = req.nextUrl.clone();
    url.pathname = "/alpha";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next|api|share|alpha|favicon|partners|.*\\..*).*)"],
};
