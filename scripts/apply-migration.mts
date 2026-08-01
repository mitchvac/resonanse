/**
 * Manually apply a drizzle-generated SQL migration (additive CREATEs/ALTERs).
 * drizzle-kit db:push is broken against this TiDB endpoint, so we generate the
 * SQL and apply it here directly. Safe to re-run: "already exists" errors are
 * tolerated so a partially-applied migration can be resumed.
 *
 * Usage: npx tsx scripts/apply-migration.mts db/migrations/0004_xxx.sql
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import mysql from "mysql2/promise";

const file = process.argv[2];
if (!file) {
  console.error("Usage: npx tsx scripts/apply-migration.mts <sql-file>");
  process.exit(1);
}

const raw = readFileSync(file, "utf8");
const statements = raw
  .split("--> statement-breakpoint")
  .map((s) => s.trim())
  .filter((s) => s.length > 0);

const conn = await mysql.createConnection(process.env.DATABASE_URL!);
let applied = 0;
let skipped = 0;
for (const stmt of statements) {
  try {
    await conn.query(stmt);
    applied++;
    console.log("OK:", stmt.slice(0, 70).replace(/\n/g, " "));
  } catch (err) {
    const code = (err as { code?: string }).code ?? "";
    const msg = (err as Error).message ?? "";
    if (
      code === "ER_TABLE_EXISTS_ERROR" ||
      code === "ER_DUP_KEYNAME" ||
      /already exists/i.test(msg) ||
      /Duplicate key name/i.test(msg)
    ) {
      skipped++;
      console.log("SKIP (exists):", stmt.slice(0, 70).replace(/\n/g, " "));
    } else {
      console.error("FAIL:", stmt);
      console.error(err);
      await conn.end();
      process.exit(1);
    }
  }
}
await conn.end();
console.log(`\nDone. applied=${applied} skipped=${skipped}`);
