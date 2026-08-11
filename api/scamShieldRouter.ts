/**
 * scamShieldRouter (V93-P1).
 *
 * Member-facing: victim-warning inbox. Warnings are recipient-side ONLY —
 * rows are filtered by recipientId = caller, so the sender of a flagged
 * message can never see or acknowledge them (the sender never learns anything).
 *
 * Admin-facing: the detector review queue. 'confirmed' sets disposition +
 * reviewedBy on the scam_signals row itself — that row IS the corroboration
 * trail referenced later when a strike is issued with basis 'detector_human'
 * (user_strikes.signalRefs points at scam_signals IDs). Rules and models
 * propose; humans dispose.
 *
 * Registered in api/router.ts as `scamShield`.
 */
import { TRPCError } from "@trpc/server";
import { and, asc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { scamSignals, victimWarnings } from "@db/schema";
import { adminQuery, authedQuery, createRouter } from "./middleware";
import { getDb } from "./queries/connection";

const QUEUE_LIMIT = 100;

export const scamShieldRouter = createRouter({
  /** My unacknowledged victim warnings in one conversation (id, level, shownAt). */
  unackedWarnings: authedQuery
    .input(z.object({ conversationId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const rows = await getDb()
        .select({
          id: victimWarnings.id,
          level: victimWarnings.level,
          shownAt: victimWarnings.shownAt,
        })
        .from(victimWarnings)
        .where(
          and(
            eq(victimWarnings.recipientId, ctx.user.id),
            eq(victimWarnings.conversationId, input.conversationId),
            isNull(victimWarnings.acknowledgedAt),
          ),
        )
        .orderBy(asc(victimWarnings.shownAt));
      return { warnings: rows };
    }),

  /** Acknowledge one of MY warnings ("Got it"). Own rows only. */
  ackWarning: authedQuery
    .input(z.object({ warningId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const rows = await db
        .select({ id: victimWarnings.id, recipientId: victimWarnings.recipientId })
        .from(victimWarnings)
        .where(eq(victimWarnings.id, input.warningId))
        .limit(1);
      const warning = rows.at(0);
      if (!warning || warning.recipientId !== ctx.user.id) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Warning not found" });
      }
      await db
        .update(victimWarnings)
        .set({ acknowledgedAt: new Date() })
        .where(
          and(
            eq(victimWarnings.id, input.warningId),
            isNull(victimWarnings.acknowledgedAt),
          ),
        );
      return { ok: true as const };
    }),

  /** Admin: detector signals awaiting human review, oldest first. */
  signalQueue: adminQuery.query(async () => {
    const rows = await getDb()
      .select({
        id: scamSignals.id,
        conversationId: scamSignals.conversationId,
        senderId: scamSignals.senderId,
        messageId: scamSignals.messageId,
        patterns: scamSignals.patterns,
        score: scamSignals.score,
        createdAt: scamSignals.createdAt,
      })
      .from(scamSignals)
      .where(eq(scamSignals.disposition, "queued_review"))
      .orderBy(asc(scamSignals.createdAt))
      .limit(QUEUE_LIMIT);
    return { signals: rows };
  }),

  /**
   * Admin: confirm or dismiss a queued signal. 'confirmed' leaves the
   * detector_human corroboration trail on the row (disposition + reviewedBy).
   */
  reviewSignal: adminQuery
    .input(
      z.object({
        signalId: z.number().int().positive(),
        disposition: z.enum(["confirmed", "dismissed"]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const rows = await db
        .select({ id: scamSignals.id, disposition: scamSignals.disposition })
        .from(scamSignals)
        .where(eq(scamSignals.id, input.signalId))
        .limit(1);
      const signal = rows.at(0);
      if (!signal) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Signal not found" });
      }
      await db
        .update(scamSignals)
        .set({ disposition: input.disposition, reviewedBy: ctx.user.id })
        .where(eq(scamSignals.id, input.signalId));
      return { ok: true as const };
    }),
});
