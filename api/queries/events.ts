import { and, asc, eq } from "drizzle-orm";
import {
  eventRsvps,
  events,
  type Event,
  type EventRsvp,
} from "@db/schema";
import { getDb } from "./connection";

export type EventWithRsvp = Event & {
  goingCount: number;
  interestedCount: number;
  myRsvp: EventRsvp["status"] | null;
};

export async function findEventById(
  eventId: number,
): Promise<Event | undefined> {
  const rows = await getDb()
    .select()
    .from(events)
    .where(eq(events.id, eventId))
    .limit(1);
  return rows.at(0);
}

export async function listEventsWithRsvps(
  userId: number,
  city?: string,
): Promise<EventWithRsvp[]> {
  const db = getDb();
  const allEvents = await db
    .select()
    .from(events)
    .where(city ? eq(events.city, city) : undefined)
    .orderBy(asc(events.startsAt));

  const rsvpRows = await db.select().from(eventRsvps);

  const now = Date.now();
  const withCounts = allEvents.map((event) => {
    const forEvent = rsvpRows.filter((r) => r.eventId === event.id);
    const mine = forEvent.find((r) => r.userId === userId);
    return {
      ...event,
      goingCount: forEvent.filter((r) => r.status === "going").length,
      interestedCount: forEvent.filter((r) => r.status === "interested").length,
      myRsvp: mine?.status ?? null,
    };
  });

  // Upcoming first (soonest), then past events (most recent).
  return withCounts.sort((a, b) => {
    const aUp = a.startsAt.getTime() >= now ? 0 : 1;
    const bUp = b.startsAt.getTime() >= now ? 0 : 1;
    if (aUp !== bUp) return aUp - bUp;
    return aUp === 0
      ? a.startsAt.getTime() - b.startsAt.getTime()
      : b.startsAt.getTime() - a.startsAt.getTime();
  });
}

export async function upsertRsvp(
  eventId: number,
  userId: number,
  status: EventRsvp["status"],
): Promise<void> {
  await getDb()
    .insert(eventRsvps)
    .values({ eventId, userId, status })
    .onDuplicateKeyUpdate({ set: { status } });
}

export async function cancelRsvp(eventId: number, userId: number): Promise<void> {
  await getDb()
    .delete(eventRsvps)
    .where(and(eq(eventRsvps.eventId, eventId), eq(eventRsvps.userId, userId)));
}
