import "dotenv/config";
import { defineConfig } from "drizzle-kit";

// Consolidated Postgres (Supabase) migrations config.
// DATABASE_URL is optional for `drizzle-kit generate` (no DB connection needed);
// it is only required for migrate/push.
const connectionString = process.env.DATABASE_URL;

export default defineConfig({
  schema: "./db/schema.ts",
  out: "./supabase/migrations",
  dialect: "postgresql",
  ...(connectionString ? { dbCredentials: { url: connectionString } } : {}),
});
