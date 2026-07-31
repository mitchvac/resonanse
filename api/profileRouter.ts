import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { RELATIONSHIP_GOALS, type Profile } from "@db/schema";
import { createRouter, authedQuery } from "./middleware";
import {
  ensureEntitlement,
  ensureProfile,
  findProfileById,
  markIdVerified,
  markVerified,
  updateProfileSettings,
  upsertProfile,
} from "./queries/profiles";
import { isBlockedBetween } from "./queries/safety";

const promptSchema = z.object({
  question: z.string().min(1),
  answer: z.string().min(1),
});

const lifestyleSchema = z.object({
  drinking: z.string().optional(),
  smoking: z.string().optional(),
  workout: z.string().optional(),
  pets: z.string().optional(),
  zodiac: z.string().optional(),
});

const profileInput = z.object({
  displayName: z.string().min(1).max(80).optional(),
  age: z.number().int().min(18).max(120).optional(),
  gender: z.string().max(60).optional(),
  pronouns: z.string().max(60).optional(),
  bio: z.string().max(2000).optional(),
  city: z.string().max(120).optional(),
  relationshipGoal: z.enum(RELATIONSHIP_GOALS).optional(),
  relationshipStatus: z.string().max(60).optional(),
  prompts: z.array(promptSchema).max(5).optional(),
  desires: z.array(z.string()).optional(),
  lifestyle: lifestyleSchema.optional(),
  photos: z.array(z.string()).max(6).optional(),
  voiceNoteUrl: z.string().max(512).nullable().optional(),
  heightCm: z.number().int().min(100).max(250).nullable().optional(),
  education: z.string().max(120).nullable().optional(),
  politics: z.string().max(60).nullable().optional(),
  familyPlans: z.string().max(60).nullable().optional(),
});

/** Strip viewer-private fields for other users' eyes. */
function publicProfileView(profile: Profile) {
  // idVerifiedAt stays: it's a public trust badge. idDocType never leaves the server.
  const { hiddenWords, anonymityMode, idDocType, ...rest } = profile;
  // Anonymity mode hides desires from non-matches in the demo build.
  return { ...rest, desires: anonymityMode ? null : profile.desires };
}

export const profileRouter = createRouter({
  me: authedQuery.query(async ({ ctx }) => {
    const profile = await ensureProfile(ctx.user.id, {
      displayName: ctx.user.name ?? "New member",
    });
    const entitlement = await ensureEntitlement(ctx.user.id);
    return { user: ctx.user, profile, entitlement };
  }),

  upsert: authedQuery
    .input(profileInput)
    .mutation(async ({ ctx, input }) => {
      const profile = await upsertProfile(ctx.user.id, input);
      return { profile, onboardingComplete: profile.onboardingComplete };
    }),

  verify: authedQuery.mutation(async ({ ctx }) => {
    const profile = await markVerified(ctx.user.id);
    return { profile };
  }),

  verifyId: authedQuery
    .input(z.object({ docType: z.enum(["state_id", "drivers_license"]) }))
    .mutation(async ({ ctx, input }) => {
      // Ensure a profile row exists before stamping the ID check.
      await ensureProfile(ctx.user.id, {
        displayName: ctx.user.name ?? "New member",
      });
      const profile = await markIdVerified(ctx.user.id, input.docType);
      return { profile };
    }),

  byId: authedQuery
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const profile = await findProfileById(input.id);
      if (!profile) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Profile not found" });
      }
      if (
        profile.userId !== ctx.user.id &&
        (await isBlockedBetween(ctx.user.id, profile.userId))
      ) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Profile unavailable" });
      }
      return { profile: publicProfileView(profile) };
    }),

  updateSettings: authedQuery
    .input(
      z.object({
        anonymityMode: z.boolean().optional(),
        hiddenWords: z.array(z.string().min(1)).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const profile = await updateProfileSettings(ctx.user.id, input);
      return { profile };
    }),
});
