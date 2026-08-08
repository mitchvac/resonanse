/**
 * sanctions/screener — screens customer names against the cached watchlist
 * and persists PII-free verdicts.
 *
 * PII CONTRACT (do not weaken):
 * - The plaintext query name exists only in memory for the duration of a
 *   screen call. At rest we store ONLY: customerRef (pseudonymous), a
 *   SHA-256 hash of the normalized name, the matched entry id (public
 *   watchlist data), the score and the verdict.
 * - Never log the plaintext name; never return matched names to callers.
 *
 * Phase-1 integration seam: the identity-vault upsert hook calls
 * `screenCustomerRef` directly with the vault's legalName.
 */

import { createHash } from "node:crypto";
import {
  sanctionsEntries,
  sanctionsResults,
  type SanctionsEntry,
} from "@db/schema";
import { getDb } from "../../queries/connection";
import { normalizeName, scoreName, verdictForScore } from "./matcher";
import { refreshEntries } from "./ofacFetcher";

export interface ScreenOutcome {
  score: number;
  verdict: "CLEAR" | "REVIEW" | "MATCH";
  /** Best-scoring watchlist entry (public data), regardless of verdict. */
  matchedEntry: SanctionsEntry | null;
}

/** Narrow the untyped json column to a clean string list. */
function altNameList(entry: SanctionsEntry): string[] {
  if (!Array.isArray(entry.altNames)) return [];
  return entry.altNames.filter(
    (n): n is string => typeof n === "string" && n.trim().length > 0,
  );
}

/** Score a query name against primaryName + all altNames; keep the best hit. */
export function screenName(
  queryName: string,
  entries: SanctionsEntry[],
): ScreenOutcome {
  let bestScore = 0;
  let bestEntry: SanctionsEntry | null = null;

  for (const entry of entries) {
    const candidates = [entry.primaryName, ...altNameList(entry)];
    for (const candidate of candidates) {
      const score = scoreName(queryName, candidate);
      if (score > bestScore) {
        bestScore = score;
        bestEntry = entry;
        if (bestScore >= 100) break;
      }
    }
    if (bestScore >= 100) break;
  }

  return {
    score: bestScore,
    verdict: verdictForScore(bestScore),
    matchedEntry: bestEntry,
  };
}

/** SHA-256 hex of the normalized query name — the only name-derived value
 * ever persisted. */
function hashQueryName(queryName: string): string {
  return createHash("sha256")
    .update(normalizeName(queryName), "utf8")
    .digest("hex");
}

/**
 * Screen one customer (by pseudonymous customerRef) and persist the verdict.
 * Lazily seeds the watchlist table on first use.
 */
export async function screenCustomerRef(
  customerRef: string,
  queryName: string,
): Promise<{
  score: number;
  verdict: "CLEAR" | "REVIEW" | "MATCH";
  matchedEntryId: number | null;
}> {
  const db = getDb();

  let entries = await db.select().from(sanctionsEntries);
  if (entries.length === 0) {
    // Lazy seed: first-ever screen populates the cache (seed fallback if the
    // live OFAC fetch is unavailable).
    await refreshEntries();
    entries = await db.select().from(sanctionsEntries);
  }

  const { score, verdict, matchedEntry } = screenName(queryName, entries);
  // Only REVIEW/MATCH rows keep a pointer to the (public) matched entry.
  const matchedEntryId =
    verdict === "CLEAR" ? null : (matchedEntry?.id ?? null);

  await db.insert(sanctionsResults).values({
    customerRef,
    queryNameHash: hashQueryName(queryName),
    matchedEntryId,
    score,
    verdict,
  });

  return { score, verdict, matchedEntryId };
}
