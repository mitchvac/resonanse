import { z } from "zod";
import { createRouter, authedQuery } from "./middleware";
import { env } from "./lib/env";
import {
  KALSHI_CATEGORIES,
  getMarket,
  listMarkets,
  trendingMarkets,
  type KalshiMarketSummary,
} from "./lib/kalshi";

/**
 * Prediction Markets — read-only Kalshi market data for logged-in members.
 *
 * Kalshi's market-data API is public and unauthenticated; lib/kalshi never
 * throws over upstream downtime (stale-while-error cache, empty fallbacks),
 * so no raw Kalshi error can ever reach the client. Resonance never places
 * trades and never holds funds — every market carries the outbound referral
 * link to kalshi.com.
 */

interface MarketCard {
  ticker: string;
  title: string;
  category: string | null;
  /** YES probability 0–100; null when Kalshi didn't provide a price. */
  yesPrice: number | null;
  volume: number | null;
  closesAt: string | null;
  referralUrl: string;
}

function toCard(m: KalshiMarketSummary): MarketCard {
  return {
    ticker: m.ticker,
    title: m.title,
    category: m.category,
    yesPrice: m.yesPrice,
    volume: m.volume24h ?? m.volume,
    closesAt: m.closesAt,
    referralUrl: env.kalshiReferralUrl,
  };
}

export const kalshiRouter = createRouter({
  trending: authedQuery.query(async () => {
    const markets = await trendingMarkets(12);
    return { markets: markets.map(toCard) };
  }),

  list: authedQuery
    .input(
      z.object({
        category: z.string().max(80).optional(),
        cursor: z.string().max(500).optional(),
      }),
    )
    .query(async ({ input }) => {
      const page = await listMarkets({
        category: input.category,
        cursor: input.cursor,
        limit: 100,
      });
      return { markets: page.markets.map(toCard), nextCursor: page.nextCursor };
    }),

  detail: authedQuery
    .input(z.object({ ticker: z.string().min(1).max(128) }))
    .query(async ({ input }) => {
      const market = await getMarket(input.ticker);
      if (!market) return { market: null };
      return { market: { ...market, referralUrl: env.kalshiReferralUrl } };
    }),

  categories: authedQuery.query(() => ({ categories: [...KALSHI_CATEGORIES] })),
});
