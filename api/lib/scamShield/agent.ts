/**
 * Scam Shield agent (V93-P1) — keeps the blocked-domain cache fresh.
 * Boot+interval pattern identical to startEventAgent: immediate run on boot,
 * then every 6 hours, timer.unref(), errors caught and logged — the agent
 * never crashes the server.
 *
 * Tasks per run:
 *  1. If URLHAUS_AUTH_KEY is set, download the URLhaus text feed and upsert
 *     new domains into blocked_domains (source 'urlhaus'), bounded batch.
 *     Missing env → log + skip (URLhaus mirroring is env-gated OFF by default).
 *  2. Refresh the in-memory blocked-domain Set from blocked_domains — the
 *     only thing the chat.send hot path reads.
 */
import { sql } from "drizzle-orm";
import { blockedDomains } from "@db/schema";
import { getDb } from "../../queries/connection";
import { refreshBlockedDomains } from "./domainCache";

const INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours
const URLHAUS_FEED_URL = "https://urlhaus.abuse.ch/downloads/text/";
/** Bound per run — the feed is large; we mirror a bounded batch each pass. */
const URLHAUS_BATCH_LIMIT = 1000;
const INSERT_CHUNK = 100;
const FETCH_TIMEOUT_MS = 30_000;

let started = false;

function extractDomain(line: string): string | null {
  try {
    const host = new URL(line.trim()).hostname.toLowerCase();
    return host === "" ? null : host.replace(/^www\./, "");
  } catch {
    return null;
  }
}

/** Download the URLhaus text feed and upsert domains. Env-gated. */
async function syncUrlhaus(): Promise<number> {
  const authKey = process.env.URLHAUS_AUTH_KEY ?? "";
  if (authKey === "") {
    console.log("[scam-shield] URLHAUS_AUTH_KEY not set — skipping URLhaus sync");
    return 0;
  }
  const res = await fetch(URLHAUS_FEED_URL, {
    headers: { "Auth-Key": authKey },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`URLhaus feed HTTP ${res.status}`);
  const body = await res.text();

  const domains: string[] = [];
  const seen = new Set<string>();
  for (const line of body.split("\n")) {
    if (domains.length >= URLHAUS_BATCH_LIMIT) break;
    if (line.startsWith("#") || line.trim() === "") continue;
    const domain = extractDomain(line);
    if (domain && !seen.has(domain)) {
      seen.add(domain);
      domains.push(domain);
    }
  }

  let upserted = 0;
  const db = getDb();
  for (let i = 0; i < domains.length; i += INSERT_CHUNK) {
    const chunk = domains.slice(i, i + INSERT_CHUNK);
    await db
      .insert(blockedDomains)
      .values(chunk.map((domain) => ({ domain, source: "urlhaus" as const })))
      .onDuplicateKeyUpdate({ set: { domain: sql`values(domain)` } });
    upserted += chunk.length;
  }
  return upserted;
}

async function runOnce(): Promise<void> {
  try {
    const upserted = await syncUrlhaus();
    if (upserted > 0) {
      console.log(`[scam-shield] upserted ${upserted} URLhaus domains`);
    }
  } catch (err) {
    console.error("[scam-shield] URLhaus sync failed", err);
  }
  try {
    const count = await refreshBlockedDomains();
    console.log(`[scam-shield] blocked-domain cache refreshed (${count} domains)`);
  } catch (err) {
    console.error("[scam-shield] blocked-domain cache refresh failed", err);
  }
}

/**
 * Boot hook: run immediately (fire-and-forget), then every 6 hours.
 * Errors are caught and logged — the server never crashes.
 */
export function startScamShieldAgent(): void {
  if (started) return;
  started = true;
  void runOnce();
  const timer = setInterval(() => {
    runOnce().catch((err) =>
      console.error("[scam-shield] scheduled run failed", err),
    );
  }, INTERVAL_MS);
  timer.unref();
}
