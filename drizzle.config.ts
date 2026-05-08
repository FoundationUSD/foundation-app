import { defineConfig } from "drizzle-kit";

const url = process.env.DATABASE_URL;
if (!url) {
  // Don't throw at import — drizzle-kit needs to be invocable from CI without a DB.
  // The CLI commands themselves will fail clearly when DATABASE_URL is missing.
  console.warn("DATABASE_URL not set — drizzle-kit commands that touch the DB will fail.");
}

export default defineConfig({
  schema: "./drizzle/schema.ts",
  out: "./drizzle/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: url ?? "",
  },
  strict: true,
  verbose: true,
});
