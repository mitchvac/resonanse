import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createRouter, authedQuery } from "./middleware";
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
});
