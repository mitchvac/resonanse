/**
 * sanctionsRouter — Phase 3 of the self-hosted KYC program.
 *
 * In-process sanctions screening (OFAC SDN + consolidated list cached in
 * `sanctions_entries`; moov-io/watchman is the long-term sidecar that will
 * replace the in-process matcher behind the same module boundary).
 *
 * PII CONTRACT (do not weaken):
 * - No procedure EVER returns a plaintext customer name or a matched
 *   watchlist name. Callers get { verdict, score, screenedAt } only.
 * - `sanctions_results` stores only customerRef + SHA-256(normalized name).
 */

import { TRPCError } from "@trpc/server";
import { count, desc, eq } from "drizzle-orm";
import { z } from "zod";
import {
  sanctionsEntries,
  sanctionsResults,
  walletKeys,
  type SanctionsResult,
} from "@db/schema";
import { createRouter, authedQuery } from "./middleware";
import { refreshEntries } from "./lib/sanctions/ofacFetcher";
import { screenCustomerRef } from "./lib/sanctions/screener";
import { getDb } from "./queries/connection";

/** Cheap refresh throttle: refuse to re-pull the lists more than once / 6h. */
const REFRESH_MIN_INTERVAL_MS = 6 * 60 * 60 * 1000;

const screenSelfInput = z.object({
  legalName: z.string().min(2).max(200),
});

type CallerLatest = Pick<SanctionsResult, "verdict" | "score" | "screenedAt">;

/** Resolve the caller's pseudonymous customer number via their wallet key. */
async function customerRefForUser(userId: number): Promise<string | null> {
  const rows = await getDb()
    .select({ customerRef: walletKeys.customerRef })
    .from(walletKeys)
    .where(eq(walletKeys.userId, userId))
    .limit(1);
  return rows.at(0)?.customerRef ?? null;
}

async function latestResultForRef(
  customerRef: string,
): Promise<CallerLatest | null> {
  const rows = await getDb()
    .select({
      verdict: sanctionsResults.verdict,
      score: sanctionsResults.score,
      screenedAt: sanctionsResults.screenedAt,
    })
    .from(sanctionsResults)
    .where(eq(sanctionsResults.customerRef, customerRef))
    .orderBy(desc(sanctionsResults.screenedAt), desc(sanctionsResults.id))
    .limit(1);
  return rows.at(0) ?? null;
}

export const sanctionsRouter = createRouter({
  /**
   * Watchlist cache status + the caller's own latest verdict.
   * NEVER includes matched names or plaintext query names.
   */
  status: authedQuery.query(async ({ ctx }) => {
    const db = getDb();

    const [countRows, latestFetchRows] = await Promise.all([
      db.select({ value: count() }).from(sanctionsEntries),
      db
        .select({ fetchedAt: sanctionsEntries.fetchedAt })
        .from(sanctionsEntries)
        .orderBy(desc(sanctionsEntries.fetchedAt))
        .limit(1),
    ]);

    const customerRef = await customerRefForUser(ctx.user.id);
    const callerLatest = customerRef
      ? await latestResultForRef(customerRef)
      : null;

    return {
      entryCount: countRows.at(0)?.value ?? 0,
      lastFetchedAt: latestFetchRows.at(0)?.fetchedAt ?? null,
      callerLatest,
    };
  }),

  /**
   * Re-pull the OFAC lists into the cache. Failure-isolated: on any network
   * failure the fetcher falls back to the bundled seed list.
   *
   * TODO(phase-4): gate this behind adminQuery once roles are wired up;
   * the 6h throttle below is the interim guard.
   */
  refresh: authedQuery.mutation(async () => {
    const db = getDb();
    const latestFetchRows = await db
      .select({ fetchedAt: sanctionsEntries.fetchedAt })
      .from(sanctionsEntries)
      .orderBy(desc(sanctionsEntries.fetchedAt))
      .limit(1);
    const lastFetchedAt = latestFetchRows.at(0)?.fetchedAt ?? null;

    if (
      lastFetchedAt !== null &&
      Date.now() - lastFetchedAt.getTime() < REFRESH_MIN_INTERVAL_MS
    ) {
      return { skipped: true as const, lastFetchedAt };
    }

    const result = await refreshEntries();
    return { skipped: false as const, ...result };
  }),

  /**
   * Screen the caller's legal name against the cached watchlist and persist
   * a PII-free verdict row. This is the Phase-1 integration seam: the
   * identity-vault upsert hook calls `screenCustomerRef` directly with the
   * vault's legalName.
   */
  screenSelf: authedQuery.input(screenSelfInput).mutation(async ({ ctx, input }) => {
    const customerRef = await customerRefForUser(ctx.user.id);
    if (!customerRef) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Set up your wallet first",
      });
    }

    try {
      const result = await screenCustomerRef(customerRef, input.legalName);
      return {
        verdict: result.verdict,
        score: result.score,
        screenedAt: new Date(),
      };
    } catch (err) {
      // Non-PII message only — never echo the name or internals to clients.
      console.error(
        "[sanctions] screenSelf failed:",
        err instanceof Error ? err.message : err,
      );
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Sanctions screening is temporarily unavailable",
      });
    }
  }),
});
