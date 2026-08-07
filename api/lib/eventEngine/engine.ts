/**
 * The Event Engine — curates location-aware events in the shared `events`
 * table. Engine-owned events are identified by hostName
 * `Resonance Events · {area.name}`.
 */
import { and, asc, eq, inArray, type SQL } from "drizzle-orm";
import {
  EVENT_CATEGORIES,
  eventRsvps,
  events,
  type Event,
  type InsertEvent,
} from "@db/schema";
import { getDb } from "../../queries/connection";
import { AREAS, type Area } from "./locations";

const DAY_MS = 24 * 60 * 60 * 1000;
const EXPIRE_AFTER_MS = 7 * DAY_MS;
const CURATE_WINDOW_DAYS = 14;
const MIN_UPCOMING = 8;
const MAX_UPCOMING = 10;

export function engineHost(area: Area): string {
  return `Resonance Events · ${area.name}`;
}

// ── Deterministic-ish PRNG (seeded per area + current week) ────────────

function hashString(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function weekNumber(now: Date): number {
  return Math.floor(now.getTime() / (7 * DAY_MS));
}

// ── Title / description templates ──────────────────────────────────────

const TITLES: Record<(typeof EVENT_CATEGORIES)[number], string[]> = {
  mixer: [
    "Sunset Singles Mixer",
    "Rooftop Social Hour",
    "New Faces Happy Hour",
    "Slow Dating Evening",
    "The Welcome Mixer",
    "Cocktails & Conversation",
  ],
  active: [
    "Morning Run Club & Coffee",
    "Sunrise Yoga in the Park",
    "City Bike Crawl",
    "Bouldering Social Night",
    "Park Bootcamp & Brunch",
    "Kayak & Chill Meetup",
  ],
  creative: [
    "Life Drawing & Wine",
    "Pottery Night for Two",
    "Open Mic Storytelling",
    "Photo Walk Golden Hour",
    "Collage & Chill Workshop",
    "Poetry & Espresso Evening",
  ],
  food: [
    "Street Food Safari",
    "Sunday Brunch Club",
    "Natural Wine Tasting",
    "Ramen Night Crawl",
    "Farmers Market Picnic",
    "Chef's Table Social",
  ],
  culture: [
    "Gallery Hop & Wine",
    "Museum After Dark",
    "Indie Film Night",
    "Hidden History Walking Tour",
    "Jazz & Vinyl Evening",
    "Architecture Stroll & Aperitivo",
  ],
  nightlife: [
    "Vinyl Listening Bar Night",
    "Speakeasy Crawl",
    "Disco Roller Party",
    "Late Night Jazz Sessions",
    "Karaoke & Cocktails",
    "Rooftop DJ Social",
  ],
};

const DESCRIPTIONS = [
  (area: Area, venue: string) =>
    `A relaxed Resonance gathering at ${venue} — come solo, leave with new faces in ${area.name}.`,
  (area: Area, venue: string) =>
    `Meet other ${area.name} singles at ${venue}. Low pressure, good conversation, curated by Resonance.`,
];

/** Plausible local evening / weekend-brunch start times. */
const START_TIMES = [
  { hour: 18, minute: 0 },
  { hour: 19, minute: 30 },
  { hour: 20, minute: 0 },
  { hour: 12, minute: 0 },
];

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

async function engineEventsForCity(area: Area): Promise<Event[]> {
  return getDb()
    .select()
    .from(events)
    .where(and(eq(events.city, area.name), eq(events.hostName, engineHost(area))))
    .orderBy(asc(events.startsAt));
}

/**
 * Expire stale engine events and top up upcoming ones for the area.
 * NEVER deletes an event with any RSVP — those stay for 'recently' history.
 */
export async function refreshArea(
  area: Area,
): Promise<{ created: number; expired: number }> {
  const db = getDb();
  const now = new Date();
  const host = engineHost(area);

  const existing = await engineEventsForCity(area);

  // (a) EXPIRE — engine-owned, >7 days past, ZERO rsvps.
  const cutoff = new Date(now.getTime() - EXPIRE_AFTER_MS);
  const candidates = existing.filter((e) => e.startsAt.getTime() < cutoff.getTime());
  let expired = 0;
  if (candidates.length > 0) {
    const rsvpRows = await db
      .select({ eventId: eventRsvps.eventId })
      .from(eventRsvps)
      .where(
        inArray(
          eventRsvps.eventId,
          candidates.map((e) => e.id),
        ),
      );
    const rsvpEventIds = new Set(rsvpRows.map((r) => r.eventId));
    const deletable = candidates
      .filter((e) => !rsvpEventIds.has(e.id))
      .map((e) => e.id);
    if (deletable.length > 0) {
      await db.delete(events).where(inArray(events.id, deletable));
      expired = deletable.length;
    }
  }

  // (b) CURATE — top up to 8–10 upcoming engine events over the next 14 days.
  const upcoming = existing.filter(
    (e) => e.startsAt.getTime() >= now.getTime() && !isExpired(e, now),
  );
  let created = 0;
  if (upcoming.length < MIN_UPCOMING) {
    const rand = mulberry32(hashString(area.slug) ^ weekNumber(now));
    const target =
      MIN_UPCOMING + Math.floor(rand() * (MAX_UPCOMING - MIN_UPCOMING + 1));
    const needed = target - upcoming.length;

    // Avoid near-duplicates: skip title+date combos that already exist.
    const taken = new Set(
      existing.map((e) => `${e.title.toLowerCase()}|${dayKey(e.startsAt)}`),
    );

    const rows: InsertEvent[] = [];
    const windowMs = CURATE_WINDOW_DAYS * DAY_MS;
    for (let i = 0; i < needed; i++) {
      const category = EVENT_CATEGORIES[i % EVENT_CATEGORIES.length];
      const templates = TITLES[category];
      const title = templates[Math.floor(rand() * templates.length)];
      const venue = area.venues[Math.floor(rand() * area.venues.length)];

      // Spread evenly across the window, jittered a few hours.
      const slotMs =
        now.getTime() + ((i + 0.5) / needed) * windowMs + (rand() - 0.5) * 6 * 3600 * 1000;
      const startsAt = new Date(slotMs);
      const time = START_TIMES[Math.floor(rand() * START_TIMES.length)];
      startsAt.setHours(time.hour, time.minute, 0, 0);
      if (startsAt.getTime() < now.getTime() + 3600 * 1000) {
        startsAt.setTime(startsAt.getTime() + DAY_MS);
      }

      const key = `${title.toLowerCase()}|${dayKey(startsAt)}`;
      if (taken.has(key)) continue;
      taken.add(key);

      const capacity = 16 + Math.floor(rand() * 25); // 16–40
      const image = `/event-0${(i % 6) + 1}.jpg`;
      const description = DESCRIPTIONS[i % DESCRIPTIONS.length](area, venue);

      rows.push({
        title,
        category,
        description,
        image,
        city: area.name,
        venue,
        startsAt,
        capacity,
        hostName: host,
      });
    }

    if (rows.length > 0) {
      await db.insert(events).values(rows);
      created = rows.length;
    }
  }

  return { created, expired };
}

function isExpired(event: Event, now: Date): boolean {
  return event.startsAt.getTime() < now.getTime() - EXPIRE_AFTER_MS;
}

export type AreaStat = {
  slug: string;
  name: string;
  country: string;
  eventCount: number;
  upcomingCount: number;
  lastUpdatedAt: Date | null;
};

/** Stats for every registry area — areas with no events yet are still listed. */
export async function areaStats(): Promise<AreaStat[]> {
  const db = getDb();
  const rows = await db
    .select({
      city: events.city,
      hostName: events.hostName,
      startsAt: events.startsAt,
      createdAt: events.createdAt,
    })
    .from(events);
  const now = Date.now();
  return AREAS.map((area) => {
    const host = engineHost(area);
    const mine = rows.filter((r) => r.city === area.name && r.hostName === host);
    const lastUpdatedAt = mine.reduce<Date | null>(
      (max, r) => (max === null || r.createdAt > max ? r.createdAt : max),
      null,
    );
    return {
      slug: area.slug,
      name: area.name,
      country: area.country,
      eventCount: mine.length,
      upcomingCount: mine.filter((r) => r.startsAt.getTime() >= now).length,
      lastUpdatedAt,
    };
  });
}

/** Freshness info for a single area (registry slug). */
export async function areaFreshness(
  slug: string,
): Promise<{ slug: string; lastUpdatedAt: Date | null } | null> {
  const area = AREAS.find((a) => a.slug === slug);
  if (!area) return null;
  const db = getDb();
  const clauses: SQL[] = [
    eq(events.city, area.name),
    eq(events.hostName, engineHost(area)),
  ];
  const rows = await db
    .select({ startsAt: events.startsAt, createdAt: events.createdAt })
    .from(events)
    .where(and(...clauses))
    .orderBy(asc(events.createdAt));
  const last = rows.at(-1);
  return { slug: area.slug, lastUpdatedAt: last?.createdAt ?? null };
}

/** Freshness for any area (registry or dynamic) — used by the agent. */
export async function areaLastUpdatedAt(area: Area): Promise<Date | null> {
  const rows = await getDb()
    .select({ createdAt: events.createdAt })
    .from(events)
    .where(and(eq(events.city, area.name), eq(events.hostName, engineHost(area))))
    .orderBy(asc(events.createdAt));
  return rows.at(-1)?.createdAt ?? null;
}
