import { useEffect, useMemo, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Check, Search } from 'lucide-react';
import GlassSheet from '@/components/GlassSheet';
import { trpc } from '@/providers/trpc';
import { cn } from '@/lib/utils';

/** "just now" / "5 min ago" / "2 hr ago" / "3 days ago"; null when unknown. */
export function fmtAgo(date: Date | string | null): string | null {
  if (!date) return null;
  const d = date instanceof Date ? date : new Date(date);
  const mins = Math.max(0, Math.round((Date.now() - d.getTime()) / 60000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hr ago`;
  return `${Math.round(hours / 24)} days ago`;
}

type EngineArea = {
  slug: string;
  name: string;
  country: string;
  eventCount: number;
  upcomingCount: number;
  lastUpdatedAt: Date | null;
  status: 'live' | 'updating';
};

/**
 * AreaPickerSheet — engine area picker, available to every user.
 * Tapping a row persists the choice via events.setArea, then refreshes the
 * feed + areas queries and closes.
 */
export default function AreaPickerSheet({
  open,
  onClose,
  currentArea,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  currentArea: string | null;
  onSelect: (area: string | null) => void;
}) {
  const utils = trpc.useUtils();
  const reduced = useReducedMotion();
  const [query, setQuery] = useState('');

  const areasQuery = trpc.events.areas.useQuery(undefined, { enabled: open });
  const setAreaMutation = trpc.events.setArea.useMutation({
    onSuccess: (data) => {
      onSelect(data.myArea);
      utils.events.feed.invalidate();
      utils.events.areas.invalidate();
      onClose();
    },
  });

  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  const areas = useMemo(
    () => (areasQuery.data?.areas ?? []) as EngineArea[],
    [areasQuery.data],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return areas;
    return areas.filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        a.country.toLowerCase().includes(q),
    );
  }, [areas, query]);

  const totalUpcoming = areas.reduce((sum, a) => sum + a.upcomingCount, 0);
  const busy = setAreaMutation.isPending;

  const pick = (area: string | null) => {
    if (busy) return;
    setAreaMutation.mutate({ area });
  };

  const freshness = (a: EngineArea) => {
    const ago = fmtAgo(a.lastUpdatedAt);
    if (ago) {
      return (
        <span className="t-micro block" style={{ color: 'var(--text-secondary)' }}>
          updated {ago}
        </span>
      );
    }
    return (
      <motion.span
        className="t-micro block"
        style={{ color: 'var(--text-secondary)' }}
        animate={reduced ? undefined : { opacity: [0.35, 1, 0.35] }}
        transition={reduced ? undefined : { duration: 1.6, repeat: Infinity }}
      >
        updating…
      </motion.span>
    );
  };

  const rowStyle = (selected: boolean) => ({
    background: 'var(--field)',
    boxShadow: selected ? '0 0 0 1.5px var(--violet)' : undefined,
  });

  return (
    <GlassSheet open={open} onClose={onClose} labelledBy="area-picker-title">
      <div className="px-5 pb-8">
        <h2 id="area-picker-title" className="t-title-sm mt-2">
          Where do you want to go out?
        </h2>
        <p className="t-caption mt-1" style={{ color: 'var(--text-secondary)' }}>
          The event agent keeps every area updated — pick one and the engine
          serves what's on there.
        </p>

        <div
          className="mt-4 flex items-center gap-2 rounded-full px-4"
          style={{ background: 'var(--field)' }}
        >
          <Search
            size={16}
            style={{ color: 'var(--text-secondary)' }}
            aria-hidden="true"
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search cities or countries"
            aria-label="Search areas"
            className="t-body h-11 min-w-0 flex-1 bg-transparent outline-none"
            style={{ color: 'var(--text)' }}
          />
        </div>

        {setAreaMutation.isError && (
          <p className="t-caption mt-2" style={{ color: 'var(--danger)' }}>
            Couldn't switch area — try again.
          </p>
        )}

        <div className="mt-4 flex flex-col gap-2" role="listbox" aria-label="Areas">
          {/* — All cities — */}
          <button
            type="button"
            role="option"
            aria-selected={currentArea === null}
            disabled={busy}
            onClick={() => pick(null)}
            className="flex min-h-[56px] items-center justify-between gap-3 rounded-2xl px-4 py-2.5 text-left disabled:opacity-60"
            style={rowStyle(currentArea === null)}
          >
            <span className="min-w-0">
              <span className="t-value block truncate font-bold" style={{ color: 'var(--text)' }}>
                All cities
              </span>
              <span className="t-caption block" style={{ color: 'var(--text-secondary)' }}>
                Every area the engine covers
              </span>
            </span>
            <span className="flex shrink-0 items-center gap-2 text-right">
              <span className="t-caption" style={{ color: 'var(--text-secondary)' }}>
                {totalUpcoming} upcoming
              </span>
              {currentArea === null && (
                <Check size={16} style={{ color: 'var(--violet)' }} aria-hidden="true" />
              )}
            </span>
          </button>

          {/* — One row per engine area — */}
          {filtered.map((a) => {
            const selected = currentArea === a.slug;
            return (
              <button
                key={a.slug}
                type="button"
                role="option"
                aria-selected={selected}
                disabled={busy}
                onClick={() => pick(a.slug)}
                className={cn(
                  'flex min-h-[56px] items-center justify-between gap-3 rounded-2xl px-4 py-2.5 text-left',
                  busy && 'opacity-60',
                )}
                style={rowStyle(selected)}
              >
                <span className="min-w-0">
                  <span className="t-value block truncate font-bold" style={{ color: 'var(--text)' }}>
                    {a.name}
                  </span>
                  <span className="t-caption block" style={{ color: 'var(--text-secondary)' }}>
                    {a.country}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="flex items-center justify-end gap-2">
                    <span className="t-caption" style={{ color: 'var(--text)' }}>
                      {a.upcomingCount} upcoming
                    </span>
                    {selected && (
                      <Check size={16} style={{ color: 'var(--violet)' }} aria-hidden="true" />
                    )}
                  </span>
                  {freshness(a)}
                </span>
              </button>
            );
          })}

          {areasQuery.isLoading && (
            <div className="flex flex-col gap-2" aria-label="Loading areas">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="skeleton-shimmer h-14 rounded-2xl"
                  style={{ background: 'var(--field)' }}
                />
              ))}
            </div>
          )}

          {!areasQuery.isLoading && filtered.length === 0 && (
            <p className="t-caption px-1 py-3 text-center" style={{ color: 'var(--text-secondary)' }}>
              No areas match "{query}".
            </p>
          )}
        </div>

        <p
          className="t-micro mt-5 text-center"
          style={{ color: 'var(--text-secondary)' }}
        >
          Powered by the Resonance event engine
        </p>
      </div>
    </GlassSheet>
  );
}
