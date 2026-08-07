import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { MapPin, SlidersHorizontal, X } from 'lucide-react';
import { trpc } from '@/providers/trpc';
import TabBar from '@/components/TabBar';
import BrandMark from '@/components/BrandMark';
import GlassCard from '@/components/GlassCard';
import GlassSheet from '@/components/GlassSheet';
import LightTrail from '@/components/LightTrail';
import AppToast from '@/components/AppToast';
import type { ToastPayload } from '@/components/AppToast';
import { BtnGlass, BtnPrimary } from '@/components/ui/buttons';
import QueueCard from '@/components/discover/QueueCard';
import ActionDock from '@/components/discover/ActionDock';
import SwipeDeck from '@/components/discover/SwipeDeck';
import NearbyFeed from '@/components/discover/NearbyFeed';
import ProfileSheet from '@/components/discover/ProfileSheet';
import CommentComposer from '@/components/discover/CommentComposer';
import FilterSheet, {
  DEFAULT_FILTERS,
  type DiscoverFilters,
} from '@/components/discover/FilterSheet';
import MatchMoment from '@/components/discover/MatchMoment';
import GateCard from '@/components/discover/GateCard';
import SegmentedControl from '@/components/discover/SegmentedControl';
import Chip from '@/components/discover/Chip';
import type { QueueEntry, SwipeAction } from '@/components/discover/types';

/**
 * Discover — /discover (discover.md)
 * The home tab. Default = Daily Resonance Queue; mode switcher unlocks
 * Swipe, Nearby; Travel opens a city-search sheet (Resonance+). TabBar
 * visible. All swipes go through trpc.discover.swipe — seed reciprocity
 * surfaces the match moment (design.md §7.2).
 */

const MODES = ['Queue', 'Swipe', 'Nearby'] as const;
type Mode = (typeof MODES)[number];

const PREFS_KEY = 'resonance-discovery-prefs';

/** Discovery prefs written by Settings — { minAge, maxAge, maxDistance, showMe }.
    Only the age range maps onto discover.queue inputs today. */
function loadFilterDefaults(): DiscoverFilters {
  try {
    const raw = window.localStorage.getItem(PREFS_KEY);
    if (raw) {
      const prefs = JSON.parse(raw) as { minAge?: unknown; maxAge?: unknown };
      const minAge = typeof prefs.minAge === 'number' ? prefs.minAge : NaN;
      const maxAge = typeof prefs.maxAge === 'number' ? prefs.maxAge : NaN;
      if (Number.isFinite(minAge) && Number.isFinite(maxAge) && minAge <= maxAge) {
        return { ...DEFAULT_FILTERS, minAge, maxAge };
      }
    }
  } catch {
    /* malformed prefs — fall through to defaults */
  }
  return DEFAULT_FILTERS;
}

function countdownToNoon(): string {
  const now = new Date();
  const noon = new Date(now);
  noon.setHours(12, 0, 0, 0);
  if (now >= noon) noon.setDate(noon.getDate() + 1);
  const diff = noon.getTime() - now.getTime();
  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  return `${h}H ${String(m).padStart(2, '0')}M`;
}

export default function Discover() {
  const reduced = useReducedMotion();
  const utils = trpc.useUtils();
  const [searchParams, setSearchParams] = useSearchParams();

  const [filters, setFilters] = useState<DiscoverFilters>(loadFilterDefaults);
  const [travelCity, setTravelCity] = useState<string | null>(null);

  /* Filters + travel city are part of the query input — changing them
     refetches discover.queue automatically. */
  const queueInput = useMemo(
    () => ({
      intents: filters.intents.length ? filters.intents : undefined,
      dealbreakerIntents: filters.dealbreakerIntents.length
        ? filters.dealbreakerIntents
        : undefined,
      minAge: filters.minAge,
      maxAge: filters.maxAge,
      verifiedOnly: filters.verifiedOnly || undefined,
      city: travelCity ?? undefined,
    }),
    [filters, travelCity],
  );
  const queueQuery = trpc.discover.queue.useQuery(queueInput);
  const remainingQuery = trpc.likes.remaining.useQuery();
  const receivedQuery = trpc.likes.received.useQuery();
  const entitlementsQuery = trpc.premium.entitlements.useQuery();

  const [mode, setMode] = useState<Mode>('Queue');
  const [queueIndex, setQueueIndex] = useState(0);
  const [swipedIds, setSwipedIds] = useState<Set<number>>(new Set());
  const [match, setMatch] = useState<{ entry: QueueEntry; matchId: number | null } | null>(null);
  const [outOfLikes, setOutOfLikes] = useState(false);
  const [outOfPulses, setOutOfPulses] = useState(false);
  const [outOfFlowers, setOutOfFlowers] = useState(false);
  const [showBanner, setShowBanner] = useState(true);
  const [sheetEntry, setSheetEntry] = useState<QueueEntry | null>(null);
  const [composer, setComposer] = useState<{ entry: QueueEntry; question: string | null } | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [travelOpen, setTravelOpen] = useState(false);
  const [lockedFilterGate, setLockedFilterGate] = useState(false);
  const [toast, setToast] = useState<ToastPayload | null>(null);

  /* Deep link from Settings: /discover?filters=1 opens the FilterSheet */
  useEffect(() => {
    if (searchParams.get('filters') === '1') {
      setFiltersOpen(true);
      setSearchParams({}, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const railRef = useRef<HTMLDivElement>(null);
  const railScrollingRef = useRef(false);
  const railScrollTimer = useRef<number | null>(null);

  // user-driven rail scroll → update index, but don't re-scroll the rail
  const handleRailScrollIndex = (i: number) => {
    railScrollingRef.current = true;
    if (railScrollTimer.current) window.clearTimeout(railScrollTimer.current);
    railScrollTimer.current = window.setTimeout(() => {
      railScrollingRef.current = false;
    }, 180);
    setQueueIndex(i);
  };

  const entries = useMemo(() => queueQuery.data?.entries ?? [], [queueQuery.data]);

  /* Deep link from a shared profile: /discover?profile=<id> opens the
     ProfileSheet for that queue entry once the queue has loaded; a stale id
     gets an honest toast. The param is cleaned either way (same pattern as
     ?filters=1 above). */
  const profileParam = searchParams.get('profile');
  useEffect(() => {
    if (!profileParam || queueQuery.isLoading || queueQuery.isError) return;
    const entry = entries.find((e) => e.profile.id === Number(profileParam));
    if (entry) {
      setSheetEntry(entry);
    } else {
      setToast({ id: Date.now(), message: "That profile isn't in your queue anymore" });
    }
    setSearchParams({}, { replace: true });
  }, [profileParam, queueQuery.isLoading, queueQuery.isError, entries, setSearchParams]);
  const swipeEntries = useMemo(
    () => entries.filter((e) => !swipedIds.has(e.profile.id)),
    [entries, swipedIds],
  );
  const mostCompatible = useMemo(
    () => entries.reduce<QueueEntry | null>((best, e) => (best && best.compatibility >= e.compatibility ? best : e), null),
    [entries],
  );
  const activeEntry = entries[queueIndex] ?? null;
  const likesLeft = remainingQuery.data?.likesLeftToday ?? null;
  const pulsesLeft = remainingQuery.data?.pulses ?? null;
  const flowersLeft = remainingQuery.data?.flowers ?? null;
  const tier = entitlementsQuery.data?.entitlement.tier;
  const isPremium = tier === 'plus' || tier === 'x';
  const likesBadge =
    (receivedQuery.data?.pulses.length ?? 0) +
    (receivedQuery.data?.flowers.length ?? 0) +
    (receivedQuery.data?.likes.length ?? 0);

  const swipeMutation = trpc.discover.swipe.useMutation({
    onSuccess: async (result, input) => {
      /* Only consume the card once the swipe is persisted — on error the
         card stays put so the user can retry. */
      setSwipedIds((prev) => new Set(prev).add(input.toProfileId));
      if (mode === 'Queue') setQueueIndex((i) => i + 1);
      await utils.likes.remaining.invalidate();
      if (result.matched) {
        const entry = entries.find((e) => e.profile.id === input.toProfileId);
        if (entry) setMatch({ entry, matchId: result.matchId });
      }
    },
    onError: (error, input) => {
      if (error.data?.code !== 'FORBIDDEN') return;
      if (input.action === 'pulse') setOutOfPulses(true);
      else if (input.action === 'flower') setOutOfFlowers(true);
      else setOutOfLikes(true);
    },
  });

  const doSwipe = (entry: QueueEntry, action: SwipeAction, comment?: string, targetRef?: string) => {
    if (swipedIds.has(entry.profile.id)) return;
    if (action === 'pulse' && pulsesLeft === 0) {
      setOutOfPulses(true);
      return;
    }
    if (action === 'flower' && flowersLeft === 0) {
      setOutOfFlowers(true);
      return;
    }
    swipeMutation.mutate({
      toProfileId: entry.profile.id,
      action,
      comment,
      targetType: targetRef ? 'prompt' : 'profile',
      targetRef,
    });
  };

  // keep the rail snapped to the active card
  useEffect(() => {
    const rail = railRef.current;
    if (!rail || mode !== 'Queue' || railScrollingRef.current) return;
    const slide = rail.querySelector<HTMLElement>(':scope > div');
    const slideWidth = slide ? slide.offsetWidth + 16 : rail.clientWidth;
    rail.scrollTo({ left: queueIndex * slideWidth, behavior: reduced ? 'auto' : 'smooth' });
  }, [queueIndex, mode, reduced]);

  // keyboard: ← pass, → like, ↑ pulse, F flower, Enter open (design.md §9)
  useEffect(() => {
    const anySheetOpen =
      sheetEntry || composer || filtersOpen || travelOpen || outOfLikes || outOfPulses || outOfFlowers || match || lockedFilterGate;
    if (anySheetOpen || (mode !== 'Queue' && mode !== 'Swipe')) return;
    const onKey = (e: KeyboardEvent) => {
      const entry = mode === 'Queue' ? activeEntry : swipeEntries[0];
      if (!entry) return;
      if (e.key === 'ArrowLeft') doSwipe(entry, 'pass');
      else if (e.key === 'ArrowRight') doSwipe(entry, 'like');
      else if (e.key === 'ArrowUp') doSwipe(entry, 'pulse');
      else if (e.key === 'f' || e.key === 'F') doSwipe(entry, 'flower');
      else if (e.key === 'Enter') setSheetEntry(entry);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const distance = (entry: QueueEntry) => `${2 + ((entry.profile.id * 5) % 18)} km`;

  const sheetOpen = Boolean(
    sheetEntry || composer || filtersOpen || travelOpen || outOfLikes || outOfPulses || lockedFilterGate,
  );

  return (
    <div className="relative flex h-full flex-col">
      {/* ——— Top chrome ——— */}
      <header className="shrink-0 px-5 pt-3">
        <div className="flex items-center justify-between">
          <span className="t-logo" style={{ fontSize: 18, color: 'var(--text-ink)' }}>
            Resonance.
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label="Filters"
              onClick={() => setFiltersOpen(true)}
              className="glass flex h-10 min-h-[44px] w-10 min-w-[44px] items-center justify-center rounded-full"
            >
              <span className="glass-content flex items-center justify-center">
                <SlidersHorizontal size={18} style={{ color: 'var(--text)' }} aria-hidden="true" />
              </span>
            </button>
            <button
              type="button"
              aria-label="Travel mode"
              onClick={() => setTravelOpen(true)}
              className="glass flex h-10 min-h-[44px] w-10 min-w-[44px] items-center justify-center rounded-full"
            >
              <span className="glass-content flex items-center justify-center">
                <MapPin size={18} style={{ color: 'var(--text)' }} aria-hidden="true" />
              </span>
            </button>
          </div>
        </div>
        <SegmentedControl
          options={MODES}
          value={mode}
          onChange={setMode}
          ariaLabel="Discovery mode"
          className="mt-3"
        />
      </header>

      {/* ——— Scrollable content ——— */}
      <div className="no-scrollbar flex-1 overflow-y-auto px-5 pb-32 pt-4">
        {queueQuery.isLoading ? (
          <DiscoverSkeleton />
        ) : queueQuery.isError ? (
          <LoadError onRetry={() => void queueQuery.refetch()} />
        ) : entries.length === 0 ? (
          <EmptyQueue
            countdown={countdownToNoon()}
            onTrySwipe={() => setMode('Swipe')}
            travelCity={travelCity}
            onClearTravel={() => setTravelCity(null)}
          />
        ) : mode === 'Queue' ? (
          <QueueMode
            entries={entries}
            queueIndex={queueIndex}
            railRef={railRef}
            onScrollIndex={handleRailScrollIndex}
            mostCompatible={mostCompatible}
            showBanner={showBanner && !sheetOpen}
            onDismissBanner={() => setShowBanner(false)}
            onOpenEntry={setSheetEntry}
            onComment={(entry, question) => setComposer({ entry, question })}
            distance={distance}
            reduced={!!reduced}
            likesLeft={likesLeft}
            pulsesLeft={pulsesLeft}
            flowersLeft={flowersLeft}
            pending={swipeMutation.isPending}
            onAction={(action) => activeEntry && doSwipe(activeEntry, action)}
            onTrySwipe={() => setMode('Swipe')}
            countdown={countdownToNoon()}
          />
        ) : mode === 'Swipe' ? (
          <section aria-label="Swipe mode">
            {swipeEntries.length > 0 ? (
              <>
                <SwipeDeck
                  entries={swipeEntries}
                  onSwipe={(entry, action) => doSwipe(entry, action)}
                />
                <div className="mt-5">
                  <ActionDock
                    likesLeft={likesLeft}
                    pulsesLeft={pulsesLeft}
                    flowersLeft={flowersLeft}
                    disabled={swipeMutation.isPending}
                    onPass={() => doSwipe(swipeEntries[0], 'pass')}
                    onLike={() => doSwipe(swipeEntries[0], 'like')}
                    onPulse={() => doSwipe(swipeEntries[0], 'pulse')}
                    onFlower={() => doSwipe(swipeEntries[0], 'flower')}
                  />
                </div>
              </>
            ) : (
              <EmptyQueue
                countdown={countdownToNoon()}
                onTrySwipe={() => setMode('Queue')}
                travelCity={travelCity}
                onClearTravel={() => setTravelCity(null)}
              />
            )}
          </section>
        ) : (
          <NearbyFeed entries={swipeEntries.length ? swipeEntries : entries} onOpen={setSheetEntry} />
        )}
      </div>

      {/* travel pill */}
      {travelCity && (
        <motion.div
          className="glass absolute inset-x-0 top-[104px] z-20 mx-auto w-fit rounded-full px-4 py-2"
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <span className="glass-content t-caption flex items-center gap-2" style={{ color: 'var(--text)' }}>
            Browsing {travelCity} · Travel mode
            <button
              type="button"
              className="underline"
              onClick={() => setTravelOpen(true)}
            >
              Change
            </button>
          </span>
        </motion.div>
      )}

      <TabBar likesCount={likesBadge} />

      {/* ——— Sheets & interstitials ——— */}
      <ProfileSheet
        open={!!sheetEntry}
        profile={sheetEntry?.profile ?? null}
        compatibility={sheetEntry?.compatibility ?? 0}
        distance={sheetEntry ? distance(sheetEntry) : undefined}
        pending={swipeMutation.isPending}
        onPass={() => {
          if (sheetEntry) doSwipe(sheetEntry, 'pass');
          setSheetEntry(null);
        }}
        onLike={() => {
          if (sheetEntry) doSwipe(sheetEntry, 'like');
          setSheetEntry(null);
        }}
        onPulse={() => {
          if (sheetEntry) doSwipe(sheetEntry, 'pulse');
          setSheetEntry(null);
        }}
        onClose={() => setSheetEntry(null)}
      />

      <CommentComposer
        open={!!composer}
        profile={composer?.entry.profile ?? null}
        targetQuestion={composer?.question ?? null}
        pulsesLeft={pulsesLeft}
        pending={swipeMutation.isPending}
        onSend={(action, comment) => {
          if (composer) doSwipe(composer.entry, action, comment, composer.question ?? undefined);
          setComposer(null);
        }}
        onClose={() => setComposer(null)}
      />

      <FilterSheet
        open={filtersOpen}
        initial={filters}
        onApply={setFilters}
        onClose={() => setFiltersOpen(false)}
        onLockedTap={() => {
          setFiltersOpen(false);
          setLockedFilterGate(true);
        }}
      />

      {/* Travel city-search sheet — free users see the GateCard state */}
      <GlassSheet open={travelOpen} onClose={() => setTravelOpen(false)} labelledBy="travel-title">
        <div className="px-6 pb-8 pt-2">
          <p className="t-eyebrow">Travel mode</p>
          <h3 id="travel-title" className="t-title-sm mt-1" style={{ color: 'var(--text)' }}>
            Browse another city
          </h3>
          {isPremium ? (
            <div className="mt-4 flex flex-wrap gap-1.5">
              {travelCity && (
                <Chip
                  selected={false}
                  onClick={() => {
                    setTravelCity(null);
                    setTravelOpen(false);
                  }}
                >
                  ← Back to my city
                </Chip>
              )}
              {['Lisbon', 'Tokyo', 'Berlin', 'Mexico City', 'London', 'New York'].map((city) => (
                <Chip
                  key={city}
                  selected={travelCity === city}
                  onClick={() => {
                    setTravelCity(city);
                    setTravelOpen(false);
                  }}
                >
                  {city}
                </Chip>
              ))}
            </div>
          ) : (
            <GateCard
              className="mt-4"
              title="Travel with Resonance+"
              caption="Set your location anywhere before you land. Your queue follows you."
              ctaLabel="Unlock Travel"
            />
          )}
        </div>
      </GlassSheet>

      {/* Out-of-likes gate (swipe mode free limit) */}
      <GlassSheet open={outOfLikes} onClose={() => setOutOfLikes(false)} labelledBy="out-of-likes">
        <div className="px-6 pb-8 pt-2">
          <h3 id="out-of-likes" className="sr-only">
            You're out of likes for today
          </h3>
          <GateCard
            title="You're out of likes for today"
            caption="Resonance+ removes the daily cap — and your queue refreshes at noon."
            ctaLabel="Get Resonance+"
          />
          <div className="mt-3 flex justify-center">
            <button
              type="button"
              className="t-button px-3 py-2 transition-opacity duration-fast active:opacity-70"
              style={{ color: 'var(--text)' }}
              onClick={() => {
                setOutOfLikes(false);
                setMode('Queue');
              }}
            >
              Back to Queue
            </button>
          </div>
        </div>
      </GlassSheet>

      {/* Out-of-flowers gate (flower FORBIDDEN from the server) */}
      <GlassSheet open={outOfFlowers} onClose={() => setOutOfFlowers(false)} labelledBy="out-of-flowers">
        <div className="px-6 pb-8 pt-2">
          <h3 id="out-of-flowers" className="sr-only">
            You're out of flowers for today
          </h3>
          <GateCard
            title="You're out of flowers for today"
            caption="Free members send 3 flowers a day. Resonance+ grows an unlimited garden — and flowers always land unblurred."
            ctaLabel="Get Resonance+"
          />
        </div>
      </GlassSheet>

      {/* Out-of-pulses gate (pulse FORBIDDEN from the server) */}
      <GlassSheet open={outOfPulses} onClose={() => setOutOfPulses(false)} labelledBy="out-of-pulses">
        <div className="px-6 pb-8 pt-2">
          <h3 id="out-of-pulses" className="sr-only">
            You're out of Pulses
          </h3>
          <GateCard
            title="You're out of Pulses"
            caption="A Pulse pins you at the top of their Likes with a note — grab a pack and keep the signal strong."
            ctaLabel="Get Pulses"
          />
          <div className="mt-3 flex justify-center">
            <button
              type="button"
              className="t-button px-3 py-2 transition-opacity duration-fast active:opacity-70"
              style={{ color: 'var(--text)' }}
              onClick={() => setOutOfPulses(false)}
            >
              Not now
            </button>
          </div>
        </div>
      </GlassSheet>

      {/* Locked advanced filter gate popover */}
      <GlassSheet open={lockedFilterGate} onClose={() => setLockedFilterGate(false)} labelledBy="locked-filter">
        <div className="px-6 pb-8 pt-2">
          <h3 id="locked-filter" className="sr-only">
            Advanced filters
          </h3>
          <GateCard
            title="Advanced filters are Resonance+"
            caption="Politics, languages, zodiac and more — zero in on what matters."
            ctaLabel="Unlock advanced filters"
          />
        </div>
      </GlassSheet>

      <MatchMoment
        open={!!match}
        theirPhoto={match?.entry.profile.photos?.[0] ?? '/avatar-01.jpg'}
        theirName={match?.entry.profile.displayName ?? ''}
        matchId={match?.matchId ?? null}
        onClose={() => setMatch(null)}
      />

      {/* stale shared-profile link toast */}
      <AppToast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}

/* ————————————————————————— Queue mode ————————————————————————— */

function QueueMode({
  entries,
  queueIndex,
  railRef,
  onScrollIndex,
  mostCompatible,
  showBanner,
  onDismissBanner,
  onOpenEntry,
  onComment,
  distance,
  reduced,
  likesLeft,
  pulsesLeft,
  flowersLeft,
  pending,
  onAction,
  onTrySwipe,
  countdown,
}: {
  entries: QueueEntry[];
  queueIndex: number;
  railRef: React.RefObject<HTMLDivElement | null>;
  onScrollIndex: (i: number) => void;
  mostCompatible: QueueEntry | null;
  showBanner: boolean;
  onDismissBanner: () => void;
  onOpenEntry: (e: QueueEntry) => void;
  onComment: (e: QueueEntry, question: string) => void;
  distance: (e: QueueEntry) => string;
  reduced: boolean;
  likesLeft: number | null;
  pulsesLeft: number | null;
  flowersLeft: number | null;
  pending: boolean;
  onAction: (a: SwipeAction) => void;
  onTrySwipe: () => void;
  countdown: string;
}) {
  const exhausted = queueIndex >= entries.length;

  return (
    <section aria-label="Daily Resonance Queue">
      {/* §1 header block */}
      <p className="t-eyebrow">Your queue · refreshes at noon</p>
      <div className="mt-1 flex items-baseline justify-between gap-3">
        <h1 className="t-heading" style={{ color: 'var(--text-ink)' }}>
          {entries.length} people. Chosen well.
        </h1>
        <span className="t-micro shrink-0" style={{ color: 'var(--text-secondary)' }}>
          NEW QUEUE IN {countdown}
        </span>
      </div>

      {/* §2 Most Compatible highlight — the viewport's one hero glow surface */}
      <AnimatePresence>
        {mostCompatible && showBanner && !exhausted && (
          <motion.div
            className="relative mt-4"
            initial={reduced ? { opacity: 0 } : { y: -24, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={reduced ? { opacity: 0 } : { y: -24, opacity: 0 }}
            transition={
              reduced ? { duration: 0.16 } : { delay: 0.6, duration: 0.32, ease: [0.22, 1, 0.36, 1] }
            }
          >
            <GlassCard edge="amber" className="edge-energize rounded-[24px] p-4">
              <div className="flex items-center gap-3">
                <img
                  src={mostCompatible.profile.photos?.[0] ?? '/avatar-01.jpg'}
                  alt=""
                  className="h-14 w-14 shrink-0 rounded-full object-cover"
                />
                <div className="min-w-0 flex-1">
                  <p className="t-eyebrow">Most compatible today</p>
                  <p className="t-title-sm mt-0.5" style={{ color: 'var(--text)' }}>
                    {mostCompatible.profile.displayName}, {mostCompatible.profile.age}
                  </p>
                  <p className="t-caption line-clamp-1" style={{ color: 'var(--text-secondary)' }}>
                    {mostCompatible.profile.prompts?.[0]
                      ? `You both answered '${mostCompatible.profile.prompts[0].question.replace(/…$/, '')}' the same way.`
                      : 'Your answers resonate.'}
                  </p>
                </div>
                <BtnPrimary className="h-9 px-4 text-[13px]" onClick={() => onOpenEntry(mostCompatible)}>
                  View
                </BtnPrimary>
                <button
                  type="button"
                  aria-label="Dismiss"
                  onClick={onDismissBanner}
                  className="absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full"
                  style={{ background: 'var(--field)', color: 'var(--text)' }}
                >
                  <X size={12} aria-hidden="true" />
                </button>
              </div>
            </GlassCard>
            {/* the page's light-trail moment: banner avatar → queue card */}
            <LightTrail
              width={60}
              height={28}
              d="M 30 0 C 30 10, 30 18, 30 28"
              nodes={[{ x: 30, y: 0 }, { x: 30, y: 28 }]}
              style={{ left: 40, top: '100%', zIndex: 0 }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {exhausted ? (
        <div className="mt-10">
          <EmptyQueue countdown={countdown} onTrySwipe={onTrySwipe} />
        </div>
      ) : (
        <>
          {/* §1 queue rail — horizontally paged, snap-scrolling */}
          <div
            ref={railRef}
            className="no-scrollbar -mx-5 mt-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-5"
            role="group"
            aria-label="Queue cards"
            onScroll={(e) => {
              const rail = e.currentTarget;
              const slide = rail.querySelector<HTMLElement>(':scope > div');
              if (!slide) return;
              const i = Math.round(rail.scrollLeft / (slide.offsetWidth + 16));
              if (i !== queueIndex && i >= 0 && i < entries.length) onScrollIndex(i);
            }}
          >
            {entries.map((entry, i) => (
              <motion.div
                key={entry.profile.id}
                className="w-full shrink-0 snap-center"
                initial={i === 0 && !reduced ? { scale: 0.96, y: 28, opacity: 0 } : false}
                animate={{ scale: 1, y: 0, opacity: 1 }}
                transition={
                  reduced
                    ? { duration: 0.2 }
                    : { duration: 0.42, ease: [0.34, 1.56, 0.64, 1] }
                }
              >
                <QueueCard
                  profile={entry.profile}
                  compatibility={entry.compatibility}
                  distance={distance(entry)}
                  onOpen={() => onOpenEntry(entry)}
                  onComment={(question) => onComment(entry, question)}
                />
              </motion.div>
            ))}
          </div>

          {/* page dots — active dot stretches 8→20px violet */}
          <div className="mt-3 flex justify-center gap-1.5" aria-hidden="true">
            {entries.map((entry, i) => (
              <span
                key={entry.profile.id}
                className="h-1.5 rounded-full transition-all duration-med"
                style={{
                  width: i === queueIndex ? 20 : 8,
                  background: i === queueIndex ? 'var(--violet)' : 'var(--field-focus)',
                }}
              />
            ))}
          </div>

          <div className="mt-4">
            <ActionDock
              likesLeft={likesLeft}
              pulsesLeft={pulsesLeft}
              flowersLeft={flowersLeft}
              disabled={pending}
              onPass={() => onAction('pass')}
              onLike={() => onAction('like')}
              onPulse={() => onAction('pulse')}
              onFlower={() => onAction('flower')}
            />
          </div>
        </>
      )}
    </section>
  );
}

/* ————————————————————————— States ————————————————————————— */

function EmptyQueue({
  countdown,
  onTrySwipe,
  travelCity,
  onClearTravel,
}: {
  countdown: string;
  onTrySwipe: () => void;
  travelCity?: string | null;
  onClearTravel?: () => void;
}) {
  /* Filters active but nothing matched — say so honestly instead of the
     generic "that's today's queue" (which reads like the app is empty). */
  if (travelCity) {
    return (
      <div className="flex flex-col items-center px-6 py-14 text-center">
        <BrandMark size={56} />
        <h2 className="t-title-sm mt-5" style={{ color: 'var(--text-ink)' }}>
          No one in {travelCity} yet.
        </h2>
        <p className="t-body mt-2" style={{ color: 'var(--text-secondary)' }}>
          This city is still growing. Turn off Travel mode to see people near you.
        </p>
        {onClearTravel && (
          <BtnGlass className="mt-6" onClick={onClearTravel}>
            Turn off Travel mode
          </BtnGlass>
        )}
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      <BrandMark size={56} />
      <h2 className="t-title-sm mt-5" style={{ color: 'var(--text-ink)' }}>
        That's today's queue.
      </h2>
      <p className="t-body mt-2" style={{ color: 'var(--text-secondary)' }}>
        Seven people, chosen well — never a slot machine.
      </p>
      <BtnGlass className="mt-6" onClick={onTrySwipe}>
        Try Swipe mode
      </BtnGlass>
      <span className="t-micro mt-4" style={{ color: 'var(--text-secondary)' }}>
        NEW QUEUE IN {countdown}
      </span>
    </div>
  );
}

function LoadError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      <BrandMark size={56} />
      <h2 className="t-title-sm mt-5" style={{ color: 'var(--text-ink)' }}>
        Couldn't load your queue.
      </h2>
      <p className="t-body mt-2" style={{ color: 'var(--text-secondary)' }}>
        Check your connection and try again.
      </p>
      <BtnGlass className="mt-6" onClick={onRetry}>
        Retry
      </BtnGlass>
    </div>
  );
}

function DiscoverSkeleton() {
  return (
    <div aria-label="Loading your queue" role="status">
      <div className="skeleton-shimmer h-3 w-44 rounded-full bg-field" />
      <div className="skeleton-shimmer mt-2 h-8 w-56 rounded-[12px] bg-field" />
      <div className="skeleton-shimmer mt-4 aspect-[4/5] w-full rounded-[28px] bg-field" />
      <div className="mt-4 flex justify-center gap-6">
        <div className="skeleton-shimmer h-12 w-12 rounded-full bg-field" />
        <div className="skeleton-shimmer h-16 w-16 rounded-full bg-field" />
        <div className="skeleton-shimmer h-12 w-12 rounded-full bg-field" />
      </div>
    </div>
  );
}
