import { TRPCError } from "@trpc/server";
import { and, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import * as schema from "@db/schema";
import { createRouter, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";

/**
 * adsRouter — rewarded-ad game passes (V78).
 *
 * One completed, server-verified ad watch grants ONE community game pass
 * (e.g. a Spades table). Passes are game ACCESS only: never Date-Coin,
 * never cash value, never transferable. v1 serves house ads; a real ad
 * network (AdMob/Unity) plugs its reward callback into the same
 * startWatch/completeWatch pair — the server remains the source of truth
 * for watch duration and grants.
 */
export const MIN_WATCH_SECONDS = 15; // server-enforced minimum watch time
export const AD_LENGTH_SECONDS = 20; // client countdown length
export const MAX_BANKED_PASSES = 5; // cap on unspent passes per member
const START_COOLDOWN_MS = 30_000; // minimum gap between watch starts

async function openPassCount(db: ReturnType<typeof getDb>, userId: number) {
  const rows = await db
    .select({ id: schema.gamePasses.id })
    .from(schema.gamePasses)
    .where(and(eq(schema.gamePasses.userId, userId), isNull(schema.gamePasses.consumedAt)));
  return rows.length;
}

export const adsRouter = createRouter({
  /** Pass balance + display constants for the gate UI. */
  passes: authedQuery.query(async ({ ctx }) => {
    const db = getDb();
    return {
      passes: await openPassCount(db, ctx.user.id),
      maxBanked: MAX_BANKED_PASSES,
      adLengthSeconds: AD_LENGTH_SECONDS,
    };
  }),

  /**
   * Begin a rewarded watch. Returns the session id the client completes
   * after the ad finishes. Rate-limited; refuses when the bank is full.
   */
  startWatch: authedQuery.mutation(async ({ ctx }) => {
    const db = getDb();
    const recent = await db
      .select({ startedAt: schema.adWatchSessions.startedAt })
      .from(schema.adWatchSessions)
      .where(eq(schema.adWatchSessions.userId, ctx.user.id))
      .orderBy(desc(schema.adWatchSessions.startedAt))
      .limit(1);
    if (recent[0] && Date.now() - new Date(recent[0].startedAt).getTime() < START_COOLDOWN_MS) {
      throw new TRPCError({
        code: "TOO_MANY_REQUESTS",
        message: "Give it a few seconds before starting another ad.",
      });
    }
    const banked = await openPassCount(db, ctx.user.id);
    if (banked >= MAX_BANKED_PASSES) {
      throw new TRPCError({
        code: "CONFLICT",
        message: `You already have ${MAX_BANKED_PASSES} games banked — play one before watching more.`,
      });
    }
    const res = await db.insert(schema.adWatchSessions).values({ userId: ctx.user.id });
    return { watchId: Number(res[0].insertId), adLengthSeconds: AD_LENGTH_SECONDS };
  }),

  /**
   * Complete a watch → grant one pass. Server-verified: the session must
   * belong to the member, be ungranted, and have run at least
   * MIN_WATCH_SECONDS. Grants are idempotent per session.
   */
  completeWatch: authedQuery
    .input(z.object({ watchId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const rows = await db
        .select()
        .from(schema.adWatchSessions)
        .where(eq(schema.adWatchSessions.id, input.watchId))
        .limit(1);
      const s = rows[0];
      if (!s || s.userId !== ctx.user.id) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Watch session not found." });
      }
      if (s.grantedAt) {
        throw new TRPCError({ code: "CONFLICT", message: "This ad already granted its game." });
      }
      if (Date.now() - new Date(s.startedAt).getTime() < MIN_WATCH_SECONDS * 1000) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "The ad has not finished yet." });
      }
      const banked = await openPassCount(db, ctx.user.id);
      if (banked >= MAX_BANKED_PASSES) {
        throw new TRPCError({
          code: "CONFLICT",
          message: `You already have ${MAX_BANKED_PASSES} games banked — play one before watching more.`,
        });
      }
      await db
        .update(schema.adWatchSessions)
        .set({ grantedAt: new Date() })
        .where(eq(schema.adWatchSessions.id, s.id));
      await db.insert(schema.gamePasses).values({ userId: ctx.user.id, source: "ad" });
      return { ok: true as const, passes: banked + 1 };
    }),

  /**
   * Consume the oldest open pass when a game actually begins (first bid).
   * CONFLICT when the bank is empty — the client then shows the ad gate.
   */
  consumePass: authedQuery.mutation(async ({ ctx }) => {
    const db = getDb();
    const open = await db
      .select({ id: schema.gamePasses.id })
      .from(schema.gamePasses)
      .where(and(eq(schema.gamePasses.userId, ctx.user.id), isNull(schema.gamePasses.consumedAt)))
      .orderBy(schema.gamePasses.id)
      .limit(1);
    if (!open[0]) {
      throw new TRPCError({
        code: "CONFLICT",
        message: "No games left — watch an ad to keep playing.",
      });
    }
    await db
      .update(schema.gamePasses)
      .set({ consumedAt: new Date() })
      .where(eq(schema.gamePasses.id, open[0].id));
    const remaining = await openPassCount(db, ctx.user.id);
    return { ok: true as const, remaining };
  }),
});
