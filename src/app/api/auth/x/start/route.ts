/**
 * GET /api/auth/x/start — server-side initiation of the X OAuth 2.0 flow.
 *
 * Bypasses better-auth's client SDK (which depends on React hydration).
 * Calls better-auth's server API → reads the X consent URL from its JSON
 * response → constructs our own 302 redirect that ALSO carries forward
 * the Set-Cookie headers better-auth sets (state, PKCE code verifier).
 * Dropping those cookies → state_mismatch on the OAuth callback.
 */

import { headers as nextHeaders } from "next/headers";
import { auth } from "@/lib/auth/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const callbackURL = url.searchParams.get("callbackURL") || "/alpha/welcome";
  // Referral capture: visitors of /share/<handle> get the referrer's code in
  // ?ref=. We stash it in an httpOnly cookie so it survives the X OAuth round
  // trip, then read it in databaseHooks.user.create.after to link the new user.
  const rawRef = url.searchParams.get("ref") ?? "";
  const refCookie = /^[A-Z0-9]{6,12}$/.test(rawRef.toUpperCase())
    ? rawRef.toUpperCase()
    : null;

  try {
    const response = await auth.api.signInSocial({
      body: { provider: "twitter", callbackURL },
      headers: await nextHeaders(),
      asResponse: true,
    });

    // Pull the X consent URL out of better-auth's JSON body
    const data = (await response.clone().json()) as {
      url?: string;
      redirect?: boolean;
    };
    if (!data.url) {
      console.error("[auth/x/start] no redirect URL in response:", data);
      return new Response("No redirect URL from better-auth", { status: 500 });
    }

    // Build a 302 that copies forward better-auth's Set-Cookie headers
    // (state + codeVerifier). Without these the OAuth callback will fail
    // with state_mismatch.
    const out = new Response(null, {
      status: 302,
      headers: {
        Location: data.url,
      },
    });
    for (const [k, v] of response.headers.entries()) {
      if (k.toLowerCase() === "set-cookie") out.headers.append("set-cookie", v);
    }
    // Some runtimes split multi-cookie responses across getSetCookie()
    const multi = (response.headers as Headers & {
      getSetCookie?: () => string[];
    }).getSetCookie?.();
    if (multi && multi.length) {
      // Replace any single 'set-cookie' we may have copied above with the
      // full split list — guards against runtimes that join them with comma.
      out.headers.delete("set-cookie");
      for (const c of multi) out.headers.append("set-cookie", c);
    }
    if (refCookie) {
      out.headers.append(
        "set-cookie",
        `fdn_ref=${refCookie}; Path=/; Max-Age=${60 * 60 * 24 * 30}; HttpOnly; Secure; SameSite=Lax`,
      );
    }
    return out;
  } catch (e) {
    console.error("[auth/x/start] error:", e);
    return new Response(
      e instanceof Error ? e.message : "Failed to start X sign-in",
      { status: 500 },
    );
  }
}
