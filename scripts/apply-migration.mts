/**
 * Manually apply a drizzle-generated SQL migration (additive CREATEs/ALTERs).
 * drizzle-kit db:push requires a direct (non-pooler) connection, so we generate
 * the SQL and apply it here directly. Safe to re-run: "already exists" errors
 * are tolerated so a partially-applied migration can be resumed.
 *
 * Usage: npx tsx scripts/apply-migration.mts supabase/migrations/00000000000000_init.sql
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import postgres from "postgres";

const file = process.argv[2];
if (!file) {
  console.error("Usage: npx tsx scripts/apply-migration.mts <sql-file>");
  process.exit(1);
}

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const raw = readFileSync(file, "utf8");
let statements: string[];
if (raw.includes("--> statement-breakpoint")) {
  statements = raw
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
} else {
  // Fallback for hand-written/consolidated files without breakpoints:
  // split on semicolons at line ends.
  statements = raw
    .split(/;\s*\n/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

const sql = postgres(process.env.DATABASE_URL, { prepare: false, max: 1 });
let applied = 0;
let skipped = 0;
for (const stmt of statements) {
  try {
    await sql.unsafe(stmt);
    applied++;
    console.log("OK:", stmt.slice(0, 70).replace(/\n/g, " "));
  } catch (err) {
    const code = (err as { code?: string }).code ?? "";
    const msg = (err as Error).message ?? "";
    if (
      code === "42P07" || // duplicate_table
      code === "42710" || // duplicate_object (types, constraints, policies)
      code === "42P06" || // duplicate_schema
      code === "42701" || // duplicate_column
      code === "42P04" || // duplicate_database
      /already exists/i.test(msg) ||
      /Duplicate key name/i.test(msg)
    ) {
      skipped++;
      console.log("SKIP (exists):", stmt.slice(0, 70).replace(/\n/g, " "));
    } else {
      console.error("FAIL:", stmt);
      console.error(err);
      await sql.end();
      process.exit(1);
    }
  }
}
await sql.end();
console.log(`\nDone. applied=${applied} skipped=${skipped}`);
