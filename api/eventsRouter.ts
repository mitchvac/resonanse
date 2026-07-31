import { z } from "zod";
import { createRouter, authedQuery } from "./middleware";
import {
  cancelRsvp,
  listEventsWithRsvps,
  upsertRsvp,
} from "./queries/events";

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
});
