import { env } from "./env";

/**
 * Thin read-only client for Kalshi's PUBLIC market-data API.
 *
 * The endpoints used here are UNAUTHENTICATED — there is intentionally no
 * API key, no signing, and no key material anywhere in this module. We only
 * ever read open market metadata; Resonance never places trades.
 *
 * Resilience contract (the router leans on this):
 *  - Every function resolves; nothing here throws over Kalshi downtime.
 *  - 8s hard timeout per upstream request.
 *  - In-memory cache, 60s TTL, keyed by query. Stale-while-error: on a fetch
 *    failure we serve the last good payload (even if expired). Failures are
 *    only "cached" for 15s so a recovering Kalshi is picked up quickly
 *    without hammering them while they are down.
 *  - All field parsing is defensive: missing/renamed fields degrade to null
 *    and are omitted by callers, never crash.
 */

const FETCH_TIMEOUT_MS = 8_000;
const CACHE_TTL_MS = 60_000;
const FAILURE_TTL_MS = 15_000;

/** Static category catalogue surfaced by the `categories` procedure. */
export const KALSHI_CATEGORIES = [
  "Sports",
  "Crypto",
  "Politics",
  "Culture",
  "Economics",
  "Climate",
  "Tech",
] as const;

export interface KalshiMarketSummary {
  ticker: string;
  eventTicker: string | null;
  title: string;
  subtitle: string | null;
  category: string | null;
  /** YES price as a 0–100 probability number; null when unknown. */
  yesPrice: number | null;
  volume: number | null;
  volume24h: number | null;
  opensAt: string | null;
  closesAt: string | null;
  status: string | null;
}

export interface KalshiMarketPage {
  markets: KalshiMarketSummary[];
  nextCursor: string | null;
}

interface CacheEntry<T> {
  value: T;
  /** Serve without refetching until this timestamp. */
  freshUntil: number;
}

const cache = new Map<string, CacheEntry<unknown>>();

async function cached<T>(key: string, empty: T, fetcher: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const entry = cache.get(key) as CacheEntry<T> | undefined;
  if (entry && entry.freshUntil > now) return entry.value;
  try {
    const value = await fetcher();
    cache.set(key, { value, freshUntil: Date.now() + CACHE_TTL_MS });
    return value;
  } catch {
    // Stale-while-error: prefer last good data; otherwise the empty fallback.
    // Either way the failure is only held for FAILURE_TTL_MS before we retry.
    const fallback = entry?.value ?? empty;
    cache.set(key, { value: fallback, freshUntil: Date.now() + FAILURE_TTL_MS });
    return fallback;
  }
}

async function kalshiGet(path: string): Promise<unknown> {
  const res = await fetch(`${env.kalshiApiBase}${path}`, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Kalshi responded ${res.status}`);
  return res.json();
}

type Raw = Record<string, unknown>;

function toNum(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number.parseFloat(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function toStr(v: unknown): string | null {
  return typeof v === "string" && v !== "" ? v : null;
}

function clampProb(n: number): number {
  return Math.min(100, Math.max(0, n));
}

/**
 * YES price as a 0–100 probability. Prefers the newer *_dollars string
 * fields (e.g. "0.62" → 62), falls back to legacy cent integers
 * (62 → 62), then last_price variants. Defends against either scale.
 */
function normalizeYesPrice(m: Raw): number | null {
  const dollars = toNum(m.yes_bid_dollars) ?? toNum(m.last_price_dollars);
  if (dollars != null) return clampProb(dollars <= 1 ? dollars * 100 : dollars);
  const cents = toNum(m.yes_bid) ?? toNum(m.last_price);
  if (cents != null) return clampProb(cents <= 1 ? cents * 100 : cents);
  return null;
}

function normalizeVolume(m: Raw): { volume: number | null; volume24h: number | null } {
  return {
    volume: toNum(m.volume) ?? toNum(m.volume_dollars),
    volume24h: toNum(m.volume_24h) ?? toNum(m.volume_24h_dollars),
  };
}

function normalizeMarket(raw: unknown): KalshiMarketSummary | null {
  if (!raw || typeof raw !== "object") return null;
  const m = raw as Raw;
  const ticker = toStr(m.ticker);
  const title = toStr(m.title);
  if (!ticker || !title) return null; // unusable without identity
  const { volume, volume24h } = normalizeVolume(m);
  return {
    ticker,
    eventTicker: toStr(m.event_ticker),
    title,
    subtitle: toStr(m.subtitle),
    category: toStr(m.category),
    yesPrice: normalizeYesPrice(m),
    volume,
    volume24h,
    opensAt: toStr(m.open_time),
    closesAt: toStr(m.close_time),
    status: toStr(m.status),
  };
}

export async function listMarkets(opts: {
  category?: string;
  cursor?: string;
  limit?: number;
}): Promise<KalshiMarketPage> {
  const limit = Math.min(Math.max(opts.limit ?? 100, 1), 200);
  const params = new URLSearchParams({ status: "open", limit: String(limit) });
  if (opts.category) params.set("category", opts.category);
  if (opts.cursor) params.set("cursor", opts.cursor);
  const key = `list:${params.toString()}`;
  return cached<KalshiMarketPage>(key, { markets: [], nextCursor: null }, async () => {
    const body = (await kalshiGet(`/markets?${params.toString()}`)) as Raw;
    const rawList = Array.isArray(body?.markets) ? (body.markets as unknown[]) : [];
    const markets = rawList
      .map(normalizeMarket)
      .filter((m): m is KalshiMarketSummary => m !== null);
    const cursor = toStr(body?.cursor);
    return { markets, nextCursor: cursor };
  });
}

export async function getMarket(ticker: string): Promise<KalshiMarketSummary | null> {
  const key = `market:${ticker}`;
  return cached<KalshiMarketSummary | null>(key, null, async () => {
    const body = (await kalshiGet(`/markets/${encodeURIComponent(ticker)}`)) as Raw;
    return normalizeMarket(body?.market);
  });
}

/** Top open markets by recent trading activity. */
export async function trendingMarkets(limit = 12): Promise<KalshiMarketSummary[]> {
  const { markets } = await listMarkets({ limit: 100 });
  return markets
    .slice()
    .sort((a, b) => (b.volume24h ?? 0) - (a.volume24h ?? 0) || (b.volume ?? 0) - (a.volume ?? 0))
    .slice(0, limit);
}
