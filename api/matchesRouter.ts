import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { feedback, matches } from "@db/schema";
import { createRouter, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import {
  findMatchById,
  getConversationContext,
  listMatchesForUser,
  matchIncludesUser,
  setConversationArchived,
  setConversationMuted,
} from "./queries/chat";
import { isBlockedBetween } from "./queries/safety";

export const matchesRouter = createRouter({
  list: authedQuery
    .input(z.object({ includeArchived: z.boolean().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const entries = await listMatchesForUser(ctx.user.id, {
        includeArchived: input?.includeArchived ?? false,
      });
      // Blocked users never appear.
      const visible = [];
      for (const entry of entries) {
        const otherId =
          entry.match.userAId === ctx.user.id
            ? entry.match.userBId
            : entry.match.userAId;
        if (!(await isBlockedBetween(ctx.user.id, otherId))) {
          visible.push(entry);
        }
      }
      return { matches: visible };
    }),

  setArchived: authedQuery
    .input(
      z.object({
        conversationId: z.number().int().positive(),
        archived: z.boolean(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const context = await getConversationContext(
        input.conversationId,
        ctx.user.id,
      );
      if (!context) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Conversation not found",
        });
      }
      const conversation = await setConversationArchived(
        input.conversationId,
        input.archived,
      );
      return { conversation };
    }),

  setMuted: authedQuery
    .input(
      z.object({
        conversationId: z.number().int().positive(),
        muted: z.boolean(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const context = await getConversationContext(
        input.conversationId,
        ctx.user.id,
      );
      if (!context) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Conversation not found",
        });
      }
      const conversation = await setConversationMuted(
        input.conversationId,
        input.muted,
      );
      return { conversation };
    }),

  weMet: authedQuery
    .input(
      z.object({
        matchId: z.number().int().positive(),
        outcome: z.enum(["met", "dated"]),
        rating: z.number().int().min(1).max(5).optional(),
        note: z.string().max(2000).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const match = await findMatchById(input.matchId);
      if (!match || !matchIncludesUser(match, ctx.user.id)) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Match not found" });
      }
      const db = getDb();
      await db
        .update(matches)
        .set({ weMet: input.outcome })
        .where(eq(matches.id, input.matchId));
      await db.insert(feedback).values({
        userId: ctx.user.id,
        matchId: input.matchId,
        kind: "we_met",
        rating: input.rating ?? null,
        note: input.note ?? null,
      });
      return { ok: true as const, weMet: input.outcome };
    }),
});
