import { z } from "zod";
import { createRouter, authedQuery } from "./middleware";
import {
  addBoosts,
  addPulses,
  cancelSubscription,
  ensureEntitlement,
  setTier,
} from "./queries/entitlements";

export const premiumRouter = createRouter({
  entitlements: authedQuery.query(async ({ ctx }) => {
    const entitlement = await ensureEntitlement(ctx.user.id);
    return { entitlement };
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
