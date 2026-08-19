import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, useReducedMotion } from 'framer-motion';
import { TrendingUp } from 'lucide-react';
import GlassCard from '@/components/GlassCard';
import TabBar from '@/components/TabBar';
import BrandMark from '@/components/BrandMark';
import { BtnGlass, BtnPrimary } from '@/components/ui/buttons';
import { trpc } from '@/providers/trpc';
import { useAuth } from '@/hooks/useAuth';
import { LOGIN_PATH } from '@/const';
import { cn } from '@/lib/utils';

const REFRESH_MS = 60_000;

const TABS = [
  { key: 'trending', labelKey: 'markets.catTrending', category: undefined },
  { key: 'sports', labelKey: 'markets.catSports', category: 'Sports' },
  { key: 'crypto', labelKey: 'markets.catCrypto', category: 'Crypto' },
  { key: 'politics', labelKey: 'markets.catPolitics', category: 'Politics' },
  { key: 'culture', labelKey: 'markets.catCulture', category: 'Culture' },
  { key: 'economics', labelKey: 'markets.catEconomics', category: 'Economics' },
  { key: 'climate', labelKey: 'markets.catClimate', category: 'Climate' },
  { key: 'tech', labelKey: 'markets.catTech', category: 'Tech' },
] as const;

type TabKey = (typeof TABS)[number]['key'];

interface MarketCardData {
  ticker: string;
  title: string;
  category: string | null;
  yesPrice: number | null;
  volume: number | null;
  closesAt: string | null;
  referralUrl: string;
}

/** $1.2M / $340K / $812 compact volume formatting. */
function fmtVolume(v: number | null): string | null {
  if (v == null || !Number.isFinite(v)) return null;
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
  return `$${Math.round(v)}`;
}

function fmtClose(iso: string | null, locale: string): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' }).format(d);
}

function MarketCard({ market, index }: { market: MarketCardData; index: number }) {
  const { t, i18n } = useTranslation('markets');
  const reduced = useReducedMotion();
  const volume = fmtVolume(market.volume);
  const closes = fmtClose(market.closesAt, i18n.language);
  return (
    <motion.div
      initial={reduced ? { opacity: 0 } : { opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ amount: 0.2, once: true }}
      transition={{
        duration: 0.38,
        delay: reduced ? 0 : Math.min(index, 8) * 0.05,
        ease: [0.22, 1, 0.36, 1],
      }}
    >
      <GlassCard className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            {market.category && (
              <span
                className="t-micro inline-flex items-center rounded-full px-2 py-0.5"
                style={{ background: 'var(--field-focus)', color: 'var(--text-secondary)' }}
              >
                {market.category}
              </span>
            )}
            <h3
              className="t-value mt-1.5 font-bold"
              style={{ color: 'var(--text)' }}
            >
              {market.title}
            </h3>
            <p className="t-micro mt-1" style={{ color: 'var(--text-secondary)' }}>
              {[
                volume ? t('markets.volume', { value: volume }) : null,
                closes ? t('markets.closes', { date: closes }) : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
          </div>
          {market.yesPrice != null && (
            <div className="shrink-0 text-right" aria-label={t('markets.yesAria', { pct: Math.round(market.yesPrice) })}>
              <p className="t-title-sm font-bold" style={{ color: 'var(--ok)' }}>
                {Math.round(market.yesPrice)}%
              </p>
              <p className="t-micro" style={{ color: 'var(--text-secondary)' }}>
                {t('markets.yesLabel')}
              </p>
            </div>
          )}
        </div>
        <a
          href={market.referralUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="t-caption mt-3 inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-full px-5 font-bold text-white"
          style={{ background: 'var(--ok)' }}
          aria-label={t('markets.tradeAria', { title: market.title })}
        >
          {t('markets.trade')}
          <span aria-hidden="true">→</span>
        </a>
      </GlassCard>
    </motion.div>
  );
}

export default function Markets() {
  const { t } = useTranslation('markets');
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const reduced = useReducedMotion();
  const [tab, setTab] = useState<TabKey>('trending');

  const activeCategory = useMemo(
    () => TABS.find((c) => c.key === tab)?.category,
    [tab],
  );

  const trendingQuery = trpc.kalshi.trending.useQuery(undefined, {
    enabled: isAuthenticated && tab === 'trending',
    refetchInterval: REFRESH_MS,
  });
  const listQuery = trpc.kalshi.list.useQuery(
    { category: activeCategory },
    {
      enabled: isAuthenticated && tab !== 'trending',
      refetchInterval: REFRESH_MS,
    },
  );

  const activeQuery = tab === 'trending' ? trendingQuery : listQuery;
  const markets = useMemo<MarketCardData[]>(
    () =>
      (tab === 'trending'
        ? (trendingQuery.data?.markets ?? [])
        : (listQuery.data?.markets ?? [])) as MarketCardData[],
    [tab, trendingQuery.data, listQuery.data],
  );

  const loading =
    authLoading || (isAuthenticated && activeQuery.isLoading);
  const unavailable =
    isAuthenticated && !loading && (activeQuery.isError || markets.length === 0);

  const retry = () => {
    if (tab === 'trending') trendingQuery.refetch();
    else listQuery.refetch();
  };

  return (
    <div className="relative h-full overflow-hidden">
      <div className="h-full overflow-y-auto pb-44">
        {/* — Header — */}
        <header className="flex items-start justify-between px-5 pt-4">
          <div>
            <h1 className="t-heading" style={{ color: 'var(--text-ink)' }}>
              {t('markets.header')}
            </h1>
            <p className="t-micro mt-0.5" style={{ color: 'var(--text-secondary)' }}>
              {t('markets.subtitle')}
            </p>
          </div>
          <span
            className="flex min-h-[44px] min-w-[44px] items-center justify-center"
            style={{ color: 'var(--text-ink)' }}
            aria-hidden="true"
          >
            <TrendingUp size={20} />
          </span>
        </header>

        {/* — Category tabs rail — */}
        <div
          className="no-scrollbar mt-3 flex gap-2 overflow-x-auto px-5"
          role="tablist"
          aria-label={t('markets.categoriesAria')}
        >
          {TABS.map((c, i) => {
            const selected = tab === c.key;
            return (
              <motion.button
                key={c.key}
                type="button"
                role="tab"
                aria-selected={selected}
                initial={reduced ? false : { opacity: 0, x: 24 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{
                  duration: 0.32,
                  delay: reduced ? 0 : i * 0.04,
                  ease: [0.22, 1, 0.36, 1],
                }}
                onClick={() => setTab(c.key)}
                className={cn(
                  't-caption flex h-8 shrink-0 items-center rounded-full px-4',
                  selected && 'font-bold',
                )}
                style={{
                  background: 'var(--field)',
                  color: 'var(--text)',
                  boxShadow: selected
                    ? '0 0 0 1.5px var(--violet), 0 4px 14px rgba(123,73,245,0.25)'
                    : undefined,
                }}
              >
                {t(c.labelKey)}
              </motion.button>
            );
          })}
        </div>

        {/* — Loading skeleton — */}
        {loading && (
          <div
            className="mt-5 flex flex-col gap-4 px-5"
            aria-label={t('markets.loading')}
          >
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className="skeleton-shimmer h-32 rounded-[20px]"
                style={{ background: 'var(--field)' }}
              />
            ))}
          </div>
        )}

        {/* — Market cards — */}
        {!loading && markets.length > 0 && (
          <section
            className="mt-5 flex flex-col gap-3 px-5"
            aria-label={t('markets.listAria')}
          >
            {markets.map((m, i) => (
              <MarketCard key={m.ticker} market={m} index={i} />
            ))}
          </section>
        )}

        {/* — Friendly empty / error state — */}
        {unavailable && (
          <section className="mt-16 flex flex-col items-center gap-3 px-8 text-center">
            <BrandMark size={56} />
            <h2 className="t-title-sm" style={{ color: 'var(--text-ink)' }}>
              {t('markets.unavailable')}
            </h2>
            <BtnGlass onClick={retry}>{t('markets.retry')}</BtnGlass>
          </section>
        )}

        {/* — Auth prompt (demo-mode visitors) — */}
        {!authLoading && !isAuthenticated && (
          <section className="mt-16 flex flex-col items-center gap-4 px-8 text-center">
            <BrandMark size={56} />
            <h2 className="t-title-sm" style={{ color: 'var(--text-ink)' }}>
              {t('markets.authTitle')}
            </h2>
            <BtnPrimary to={LOGIN_PATH}>{t('markets.signIn')}</BtnPrimary>
          </section>
        )}
      </div>

      {/* — Fixed disclosure — */}
      <p
        className="t-micro absolute inset-x-6 z-20 text-center"
        style={{
          bottom: 'calc(max(12px, env(safe-area-inset-bottom, 0px)) + 80px)',
          color: 'var(--text-secondary)',
        }}
      >
        {t('markets.disclosure')}
      </p>

      <TabBar />
    </div>
  );
}
