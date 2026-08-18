import { TRPCError } from "@trpc/server";
import { and, desc, eq, gt, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { removalAppeals, userStrikes } from "@db/schema";
import { createRouter, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import {
  blockUser,
  createReport,
  deleteAccountData,
  exportUserData,
  listBlocked,
  resetMatchingData,
  unblockUser,
} from "./queries/safety";

export const safetyRouter = createRouter({
  report: authedQuery
    .input(
      z.object({
        targetUserId: z.number().int().positive(),
        reason: z.string().min(1).max(60),
        detail: z.string().max(2000).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (input.targetUserId === ctx.user.id) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "You can't report yourself",
        });
      }
      await createReport({ reporterId: ctx.user.id, ...input });
      return { ok: true as const };
    }),

  block: authedQuery
    .input(z.object({ targetUserId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      if (input.targetUserId === ctx.user.id) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "You can't block yourself",
        });
      }
      await blockUser(ctx.user.id, input.targetUserId);
      return { ok: true as const };
    }),

  unblock: authedQuery
    .input(z.object({ targetUserId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      await unblockUser(ctx.user.id, input.targetUserId);
      return { ok: true as const };
    }),

  blocked: authedQuery.query(async ({ ctx }) => {
    const blocked = await listBlocked(ctx.user.id);
    return { blocked };
  }),

  deleteAccount: authedQuery.mutation(async ({ ctx }) => {
    await deleteAccountData(ctx.user.id);
    return { ok: true as const };
  }),

  exportData: authedQuery.query(async ({ ctx }) => {
    return exportUserData(ctx.user.id);
  }),

  resetMatching: authedQuery.mutation(async ({ ctx }) => {
    await resetMatchingData(ctx.user.id);
    return { ok: true as const };
  }),

  /**
   * V93: Settings → Your standing. Active strikes only (read-time decay:
   * voidedAt IS NULL AND expiresAt > now), the removal tombstone, and the
   * member's own appeals. Nobody is ever surprised by strike 3 (§5.6).
   */
  myStanding: authedQuery.query(async ({ ctx }) => {
    const db = getDb();
    const activeStrikes = await db
      .select({
        id: userStrikes.id,
        category: userStrikes.category,
        ruleRef: userStrikes.ruleRef,
        basis: userStrikes.basis,
        issuedAt: userStrikes.issuedAt,
        expiresAt: userStrikes.expiresAt,
        acknowledgedAt: userStrikes.acknowledgedAt,
      })
      .from(userStrikes)
      .where(
        and(
          eq(userStrikes.userId, ctx.user.id),
          isNull(userStrikes.voidedAt),
          gt(userStrikes.expiresAt, new Date()),
        ),
      )
      .orderBy(desc(userStrikes.issuedAt));
    const appeals = await db
      .select({
        id: removalAppeals.id,
        status: removalAppeals.status,
        createdAt: removalAppeals.createdAt,
        decidedAt: removalAppeals.decidedAt,
      })
      .from(removalAppeals)
      .where(eq(removalAppeals.userId, ctx.user.id))
      .orderBy(desc(removalAppeals.createdAt));
    return {
      activeStrikes,
      removedAt: ctx.user.removedAt,
      appeals,
    };
  }),

  /** Acknowledge ("I've read this") — own strikes only. */
  acknowledgeStrike: authedQuery
    .input(z.object({ strikeId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const rows = await db
        .select({ id: userStrikes.id })
        .from(userStrikes)
        .where(
          and(
            eq(userStrikes.id, input.strikeId),
            eq(userStrikes.userId, ctx.user.id),
          ),
        )
        .limit(1);
      if (rows.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Strike not found" });
      }
      await db
        .update(userStrikes)
        .set({ acknowledgedAt: new Date() })
        .where(
          and(
            eq(userStrikes.id, input.strikeId),
            isNull(userStrikes.acknowledgedAt),
          ),
        );
      return { ok: true as const };
    }),

  /**
   * Appeal a removal (§5.6). Only the strike that actually removed the
   * account can be appealed, and only while the account is removed; one
   * open/in-review appeal per strike.
   */
  submitAppeal: authedQuery
    .input(
      z.object({
        strikeId: z.number().int().positive(),
        body: z.string().min(1).max(4000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user.removedAt || ctx.user.removalStrikeId !== input.strikeId) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only the strike that removed your account can be appealed",
        });
      }
      const db = getDb();
      const existing = await db
        .select({ id: removalAppeals.id })
        .from(removalAppeals)
        .where(
          and(
            eq(removalAppeals.strikeId, input.strikeId),
            inArray(removalAppeals.status, ["open", "in_review"]),
          ),
        )
        .limit(1);
      if (existing.length > 0) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "An appeal for this strike is already in the queue",
        });
      }
      const [{ id: appealId }] = await db
        .insert(removalAppeals)
        .values({
          userId: ctx.user.id,
          strikeId: input.strikeId,
          body: input.body,
          status: "open",
        })
        .returning({ id: removalAppeals.id });
      return { ok: true as const, appealId };
    }),
});
