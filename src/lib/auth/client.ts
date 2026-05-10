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

const baseURL =
  process.env.NEXT_PUBLIC_APP_URL ||
  (typeof window !== "undefined" ? window.location.origin : "http://localhost:3000");

export const authClient = createAuthClient({
  baseURL,
  plugins: [emailOTPClient()],
});

export const { useSession, signIn, signOut, signUp, emailOtp } = authClient;
