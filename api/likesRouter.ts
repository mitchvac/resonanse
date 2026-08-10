import { createRouter, authedQuery } from "./middleware";
import {
  compatibilityScore,
  countFlowersToday,
  countLikesToday,
  countMatchesForUser,
  countWavesToday,
  FREE_DAILY_FLOWERS,
  FREE_DAILY_WAVES,
  likesReceivedForProfile,
  seedIncomingLikes,
} from "./queries/discovery";
import { findProfileByUserId } from "./queries/profiles";
import { ensureEntitlement } from "./queries/entitlements";

export const likesRouter = createRouter({
  received: authedQuery.query(async ({ ctx }) => {
    const entitlement = await ensureEntitlement(ctx.user.id);
    let myProfile = await findProfileByUserId(ctx.user.id);
    if (!myProfile) {
      return { blurred: true, likes: [], pulses: [], flowers: [], waves: [] };
    }

    // One-time lazy seed: a brand-new caller with zero likes and zero matches
    // gets 5 incoming likes + 2 pulses from seed profiles. Idempotent via the
    // profiles.likesSeededAt marker column.
    if (!myProfile.likesSeededAt) {
      const [existing, matchCount] = await Promise.all([
        likesReceivedForProfile(myProfile.id),
        countMatchesForUser(ctx.user.id),
      ]);
      if (existing.length === 0 && matchCount === 0) {
        await seedIncomingLikes(ctx.user.id, myProfile.id, {
          gender: myProfile.gender,
          showMe: myProfile.showMe,
        });
        myProfile = (await findProfileByUserId(ctx.user.id)) ?? myProfile;
      }
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
      // Paywall integrity: free tier never sees liker photos or bio.
      liker:
        blurred && like.likerProfile
          ? { ...like.likerProfile, photos: [], bio: null }
          : like.likerProfile,
    }));

    return {
      blurred,
      // Pulses, flowers and waves are never hidden and always pinned first —
      // a wave is an explicit "hi", hiding it defeats the gesture.
      pulses: decorated.filter((l) => l.kind === "pulse"),
      flowers: decorated.filter((l) => l.kind === "flower"),
      waves: decorated.filter((l) => l.kind === "wave"),
      likes: decorated.filter((l) => l.kind === "like"),
    };
  }),

  remaining: authedQuery.query(async ({ ctx }) => {
    const entitlement = await ensureEntitlement(ctx.user.id);
    const likesToday = await countLikesToday(ctx.user.id);
    const flowersToday = await countFlowersToday(ctx.user.id);
    const wavesToday = await countWavesToday(ctx.user.id);
    return {
      likesLeftToday: Math.max(0, entitlement.dailyLikeLimit - likesToday),
      dailyLikeLimit: entitlement.dailyLikeLimit,
      pulses: entitlement.pulses,
      // 99 = "unlimited" demo representation for Resonance+, mirrors pulses.
      flowers:
        entitlement.tier === "free"
          ? Math.max(0, FREE_DAILY_FLOWERS - flowersToday)
          : 99,
      waves: Math.max(0, FREE_DAILY_WAVES - wavesToday),
    };
  }),
});
