/**
 * The Update Agent — keeps every registry area's event feed fresh.
 * Runs a full refresh on boot and every 20 minutes, and supports lazy
 * per-request freshness via ensureAreaFresh(). Never crashes the server.
 */
import { AREAS, type Area } from "./locations";
import { areaLastUpdatedAt, areaStats, refreshArea } from "./engine";

const INTERVAL_MS = 20 * 60 * 1000; // 20 minutes
const STALE_AFTER_MS = 30 * 60 * 1000; // 30 minutes

/** slug → last successful refresh timestamp (ms), seeded from areaStats on boot. */
const lastRun = new Map<string, number>();
let seeded = false;
let started = false;

/** Seed the last-run map from existing engine events (max createdAt per area). */
async function seedLastRun(): Promise<void> {
  if (seeded) return;
  seeded = true;
  try {
    const stats = await areaStats();
    for (const stat of stats) {
      if (stat.lastUpdatedAt) {
        lastRun.set(stat.slug, stat.lastUpdatedAt.getTime());
      }
    }
  } catch (err) {
    console.error("[event-agent] failed to seed freshness map", err);
  }
}

async function refreshAll(): Promise<void> {
  let created = 0;
  let expired = 0;
  for (const area of AREAS) {
    try {
      const result = await refreshArea(area);
      created += result.created;
      expired += result.expired;
      lastRun.set(area.slug, Date.now());
    } catch (err) {
      console.error(`[event-agent] refresh failed for ${area.slug}`, err);
    }
  }
  console.log(
    `[event-agent] refreshed ${AREAS.length} areas (${created} created, ${expired} expired)`,
  );
}

/**
 * Boot hook: refresh all areas immediately (fire-and-forget), then every
 * 20 minutes. Errors are caught and logged — the server never crashes.
 */
export function startEventAgent(): void {
  if (started) return;
  started = true;
  void (async () => {
    try {
      await seedLastRun();
      await refreshAll();
    } catch (err) {
      console.error("[event-agent] initial refresh failed", err);
    }
  })();
  const timer = setInterval(() => {
    refreshAll().catch((err) =>
      console.error("[event-agent] scheduled refresh failed", err),
    );
  }, INTERVAL_MS);
  timer.unref();
}

/**
 * Lazy per-request freshness: if the area was never refreshed or is older
 * than 30 minutes, refresh it synchronously before serving the feed.
 */
export async function ensureAreaFresh(area: Area): Promise<void> {
  await seedLastRun();
  let last = lastRun.get(area.slug);
  if (last === undefined) {
    // Unknown to the map (e.g. dynamic custom city) — check the DB once.
    const dbLast = await areaLastUpdatedAt(area);
    last = dbLast?.getTime();
    if (last !== undefined) lastRun.set(area.slug, last);
  }
  if (last === undefined || Date.now() - last > STALE_AFTER_MS) {
    try {
      await refreshArea(area);
      lastRun.set(area.slug, Date.now());
      console.log(`[event-agent] lazily refreshed ${area.slug}`);
    } catch (err) {
      console.error(`[event-agent] lazy refresh failed for ${area.slug}`, err);
    }
  }
}
