/**
 * better-auth handler — covers signin/signup/verify/signout under /api/auth/*.
 *
 * Pinned to the Node.js runtime: the drizzle adapter uses the `pg` driver,
 * which is not Edge-compatible. Don't change to `edge`.
 */

import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/lib/auth/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const { GET, POST } = toNextJsHandler(auth);
