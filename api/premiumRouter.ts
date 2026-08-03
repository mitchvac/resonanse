import { z } from "zod";
import { createRouter, authedQuery } from "./middleware";
import {
  addBoosts,
  addPulses,
  beginTrial,
  cancelSubscription,
  effectiveEntitlement,
  ensureEntitlementRow,
  setTier,
  trialState,
} from "./queries/entitlements";
import { TRPCError } from "@trpc/server";

export const premiumRouter = createRouter({
  entitlements: authedQuery.query(async ({ ctx }) => {
    const raw = await ensureEntitlementRow(ctx.user.id);
    return { entitlement: effectiveEntitlement(raw), trial: trialState(raw) };
  }),

  startTrial: authedQuery.mutation(async ({ ctx }) => {
    const raw = await ensureEntitlementRow(ctx.user.id);
    const state = trialState(raw);
    if (raw.tier !== "free" || state.active) {
      return { entitlement: effectiveEntitlement(raw), trial: state };
    }
    if (!state.eligible) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Your free trial was already used.",
      });
    }
    const entitlement = await beginTrial(ctx.user.id);
    const updatedRaw = await ensureEntitlementRow(ctx.user.id);
    return { entitlement, trial: trialState(updatedRaw) };
  }),

  subscribe: authedQuery
    .input(z.object({ tier: z.enum(["plus", "x"]) }))
    .mutation(async ({ ctx, input }) => {
      const entitlement = await setTier(ctx.user.id, input.tier);
      return { entitlement };
    }),

  buyPulses: authedQuery
    .input(z.object({ count: z.number().int().min(1).max(50) }))
    .mutation(async ({ ctx, input }) => {
      const entitlement = await addPulses(ctx.user.id, input.count);
      return { entitlement };
    }),

  buyBoost: authedQuery
    .input(z.object({ count: z.number().int().min(1).max(10) }))
    .mutation(async ({ ctx, input }) => {
      const entitlements = await addBoosts(ctx.user.id, input.count);
      return { entitlements };
    }),

  cancel: authedQuery.mutation(async ({ ctx }) => {
    const entitlements = await cancelSubscription(ctx.user.id);
    return { entitlements };
  }),
});
