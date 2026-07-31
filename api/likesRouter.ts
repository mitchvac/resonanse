import { createRouter, authedQuery } from "./middleware";
import {
  compatibilityScore,
  countLikesToday,
  likesReceivedForProfile,
} from "./queries/discovery";
import { ensureEntitlement, findProfileByUserId } from "./queries/profiles";

export const likesRouter = createRouter({
  received: authedQuery.query(async ({ ctx }) => {
    const entitlement = await ensureEntitlement(ctx.user.id);
    const myProfile = await findProfileByUserId(ctx.user.id);
    if (!myProfile) {
      return { blurred: true, likes: [], pulses: [] };
    }

    const blurred = entitlement.tier === "free";
    const rows = await likesReceivedForProfile(myProfile.id);

    const decorated = rows.map((like) => ({
      id: like.id,
      kind: like.kind,
      comment: like.comment,
      targetType: like.targetType,
      targetRef: like.targetRef,
      createdAt: like.createdAt,
      blurred,
      compatibility: compatibilityScore(like.fromUserId, myProfile.id),
      liker: like.likerProfile,
    }));

    return {
      blurred,
      // Pulses are never hidden and always pinned first.
      pulses: decorated.filter((l) => l.kind === "pulse"),
      likes: decorated.filter((l) => l.kind === "like"),
    };
  }),

  remaining: authedQuery.query(async ({ ctx }) => {
    const entitlement = await ensureEntitlement(ctx.user.id);
    const likesToday = await countLikesToday(ctx.user.id);
    return {
      likesLeftToday: Math.max(0, entitlement.dailyLikeLimit - likesToday),
      dailyLikeLimit: entitlement.dailyLikeLimit,
      pulses: entitlement.pulses,
    };
  }),
});
