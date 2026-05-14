/**
 * better-auth client — used from React components.
 *
 * Exposes:
 *   - useSession()    — reactive session hook
 *   - signIn / signOut
 *   - emailOtp.{ sendVerificationOtp, signIn, verifyEmail }  via the plugin
 *
 * Do NOT import this from server code; use `auth` from `@/lib/auth/server`.
 */

import { createAuthClient } from "better-auth/react";
import { emailOTPClient } from "better-auth/client/plugins";

// Prefer the actual page origin in the browser — keeps requests same-origin
// regardless of NEXT_PUBLIC_APP_URL (which might point at a tunnel for
// OG-unfurl testing). Fall back to env / localhost only when no `window`.
const baseURL =
  typeof window !== "undefined"
    ? window.location.origin
    : process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

export const authClient = createAuthClient({
  baseURL,
  plugins: [emailOTPClient()],
});

export const { useSession, signIn, signOut, signUp, emailOtp } = authClient;
