/**
 * Drizzle Postgres client — server-only.
 *
 * Used by better-auth (via the drizzle adapter) and by referral helpers in
 * `src/lib/referrals.ts`. Reads `DATABASE_URL` (direct Postgres connection,
 * typically Supabase's pooler or the session connection string).
 *
 * This module must NOT be imported from client components — `pg` is a Node
 * driver and will fail to bundle for the browser.
 */

import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "../../../drizzle/schema";

let _pool: Pool | null = null;
let _db: NodePgDatabase<typeof schema> | null = null;

function init() {
  if (_db) return _db;
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set — auth/referrals require a Postgres connection.");
  }
  _pool = new Pool({ connectionString: url, max: 5 });
  _db = drizzle(_pool, { schema });
  return _db;
}

/** Lazy-initialized Drizzle DB. Throws if DATABASE_URL is missing. */
export const db = new Proxy({} as NodePgDatabase<typeof schema>, {
  get(_, prop) {
    const real = init();
    const value = real[prop as keyof typeof real];
    return typeof value === "function" ? value.bind(real) : value;
  },
});

export { schema };
