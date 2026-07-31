import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createRouter, authedQuery } from "./middleware";
import {
  countLikesToday,
  findExistingLike,
  getDiscoveryQueue,
  getOrCreateMatch,
  recordLike,
  recordPass,
  seedReciprocates,
} from "./queries/discovery";
import {
  ensureEntitlement,
  ensureProfile,
  findProfileById,
} from "./queries/profiles";
import { decrementPulses } from "./queries/entitlements";
import { isBlockedBetween } from "./queries/safety";

export const discoverRouter = createRouter({
  queue: authedQuery.query(async ({ ctx }) => {
    const profile = await ensureProfile(ctx.user.id, {
      displayName: ctx.user.name ?? "New member",
    });
    const entries = await getDiscoveryQueue(
      ctx.user.id,
      profile.relationshipGoal ?? null,
      8,
    );
    return {
      entries,
      refreshNote: "Your queue refreshes daily",
    };
  }),

  swipe: authedQuery
    .input(
      z.object({
        toProfileId: z.number().int().positive(),
        action: z.enum(["like", "pass", "pulse"]),
        comment: z.string().max(500).optional(),
        targetType: z.enum(["profile", "prompt", "photo"]).optional(),
        targetRef: z.string().max(255).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user.id;
      const target = await findProfileById(input.toProfileId);
      if (!target) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Profile not found" });
      }
      if (target.userId === userId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "You can't swipe on your own profile",
        });
      }
      if (await isBlockedBetween(userId, target.userId)) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Profile unavailable" });
      }

      if (input.action === "pass") {
        await recordPass(userId, input.toProfileId);
        return { matched: false as const, matchId: null };
      }

      const entitlement = await ensureEntitlement(userId);

      if (input.action === "like") {
        const likesToday = await countLikesToday(userId);
        if (likesToday >= entitlement.dailyLikeLimit) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "You're out of likes for today",
          });
        }
      } else {
        // pulse — consumes a Pulse balance
        if (entitlement.pulses <= 0) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "You're out of Pulses",
          });
        }
      }

      const myProfile = await ensureProfile(userId, {
        displayName: ctx.user.name ?? "New member",
      });

      await recordLike({
        fromUserId: userId,
        toProfileId: input.toProfileId,
        kind: input.action === "pulse" ? "pulse" : "like",
        comment: input.comment ?? null,
        targetType: input.targetType ?? "profile",
        targetRef: input.targetRef ?? null,
      });
      if (input.action === "pulse") {
        await decrementPulses(userId);
      }

      // Mutual? (a) they already liked my profile, or
      // (b) deterministic seed auto-reciprocity (~40%) to make the demo sing.
      const reciprocal = await findExistingLike(target.userId, myProfile.id);
      const seedMatch = target.isSeed && seedReciprocates(userId, input.toProfileId);

      if (reciprocal || seedMatch) {
        const { match } = await getOrCreateMatch(userId, target.userId);
        return { matched: true as const, matchId: match.id };
      }

      return { matched: false as const, matchId: null };
    }),
});
