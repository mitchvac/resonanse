import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { feedback } from "@db/schema";
import { createRouter, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import {
  findConversationByMatchId,
  findMatchById,
  insertMessage,
  matchIncludesUser,
} from "./queries/chat";
import {
  cancelRsvp,
  findEventById,
  listEventsWithRsvps,
  upsertRsvp,
} from "./queries/events";
import { findProfileByUserId, upsertProfile } from "./queries/profiles";
import { areaLastUpdatedAt, areaStats } from "./lib/eventEngine/engine";
import { normaliseArea, resolveArea } from "./lib/eventEngine/locations";
import { ensureAreaFresh } from "./lib/eventEngine/agent";

const DAY_MS = 24 * 60 * 60 * 1000;

export const eventsRouter = createRouter({
  list: authedQuery.query(async ({ ctx }) => {
    const events = await listEventsWithRsvps(ctx.user.id);
    return { events };
  }),

  rsvp: authedQuery
    .input(
      z.object({
        eventId: z.number().int().positive(),
        status: z.enum(["going", "interested"]).default("going"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await upsertRsvp(input.eventId, ctx.user.id, input.status);
      return { ok: true as const, status: input.status };
    }),

  cancelRsvp: authedQuery
    .input(z.object({ eventId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      await cancelRsvp(input.eventId, ctx.user.id);
      return { ok: true as const };
    }),

  invite: authedQuery
    .input(
      z.object({
        eventId: z.number().int().positive(),
        matchId: z.number().int().positive(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const event = await findEventById(input.eventId);
      if (!event) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Event not found" });
      }
      const match = await findMatchById(input.matchId);
      if (!match || !matchIncludesUser(match, ctx.user.id)) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Match not found" });
      }
      const conversation = await findConversationByMatchId(match.id);
      if (!conversation) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Conversation not found",
        });
      }
      const message = await insertMessage({
        conversationId: conversation.id,
        senderId: ctx.user.id,
        kind: "event_invite",
        content: event.title,
        meta: {
          eventId: event.id,
          title: event.title,
          photo: event.image ?? null,
          startsAt: event.startsAt,
        },
        expiresAt: conversation.ephemeral
          ? new Date(Date.now() + DAY_MS)
          : undefined,
      });
      return { message };
    }),

  feedback: authedQuery
    .input(
      z.object({
        eventId: z.number().int().positive(),
        rating: z.number().int().min(1).max(5),
        metAnyone: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const event = await findEventById(input.eventId);
      if (!event) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Event not found" });
      }
      await getDb()
        .insert(feedback)
        .values({
          userId: ctx.user.id,
          kind: "event",
          rating: input.rating,
          note:
            input.metAnyone === undefined
              ? `eventId:${input.eventId}`
              : `eventId:${input.eventId} metAnyone:${input.metAnyone}`,
        });
      return { ok: true as const };
    }),

  areas: authedQuery.query(async ({ ctx }) => {
    const [stats, profile] = await Promise.all([
      areaStats(),
      findProfileByUserId(ctx.user.id),
    ]);
    return {
      areas: stats.map((s) => ({
        ...s,
        status: (s.lastUpdatedAt ? "live" : "updating") as "live" | "updating",
      })),
      myArea: profile?.eventArea ?? null,
    };
  }),

  setArea: authedQuery
    .input(z.object({ area: z.string().max(120).nullable() }))
    .mutation(async ({ ctx, input }) => {
      const raw = input.area?.trim() ?? "";
      const matched = normaliseArea(input.area);
      // Registry match → slug; unknown custom city → raw string; 'all'/empty → null.
      const value = matched ? matched.slug : raw === "" ? null : raw;
      await upsertProfile(ctx.user.id, { eventArea: value });
      if (!matched && value) {
        // Unknown city: lazily curate a dynamic area with generic venues.
        const dynamic = resolveArea(value);
        if (dynamic) await ensureAreaFresh(dynamic);
      }
      return { ok: true as const, myArea: value };
    }),

  feed: authedQuery
    .input(
      z.object({ area: z.string().max(120).nullable().optional() }),
    )
    .query(async ({ ctx, input }) => {
      const profile = await findProfileByUserId(ctx.user.id);
      const target = input.area ?? profile?.eventArea ?? null;
      const area = resolveArea(target);
      if (!area) {
        const events = await listEventsWithRsvps(ctx.user.id);
        return { area: null, events };
      }
      await ensureAreaFresh(area);
      const [events, lastUpdatedAt] = await Promise.all([
        listEventsWithRsvps(ctx.user.id, area.name),
        areaLastUpdatedAt(area),
      ]);
      return {
        area: {
          slug: area.slug,
          name: area.name,
          country: area.country,
          lastUpdatedAt,
        },
        events,
      };
    }),
});
