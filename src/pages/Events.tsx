import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { UIEvent } from 'react';
import {
  AnimatePresence,
  motion,
  useMotionValue,
  useReducedMotion,
} from 'framer-motion';
import {
  BadgeCheck,
  SlidersHorizontal,
  Star,
  Users,
} from 'lucide-react';
import GlassCard from '@/components/GlassCard';
import GlassSheet from '@/components/GlassSheet';
import TabBar from '@/components/TabBar';
import BrandMark from '@/components/BrandMark';
import AppToast from '@/components/AppToast';
import type { ToastPayload } from '@/components/AppToast';
import { BtnGlass, BtnPrimary } from '@/components/ui/buttons';
import RsvpButton from '@/components/events/RsvpButton';
import EventDetailSheet from '@/components/events/EventDetailSheet';
import AreaPickerSheet, { fmtAgo } from '@/components/events/AreaPickerSheet';
import {
  eventDate,
  fmtEyebrowDate,
  fmtListDate,
  type EventItem,
} from '@/components/events/types';
import { trpc } from '@/providers/trpc';
import { useAuth } from '@/hooks/useAuth';
import { LOGIN_PATH } from '@/const';
import { cn } from '@/lib/utils';

const CATEGORIES = [
  { key: 'all', labelKey: 'events.catAll' },
  { key: 'tonight', labelKey: 'events.catTonight' },
  { key: 'mixers', labelKey: 'events.catMixers' },
  { key: 'classes', labelKey: 'events.catClasses' },
  { key: 'outdoors', labelKey: 'events.catOutdoors' },
  { key: 'culture', labelKey: 'events.catCulture' },
  { key: 'food', labelKey: 'events.catFood' },
] as const;

type CategoryKey = (typeof CATEGORIES)[number]['key'];

const ATTENDEE_AVATARS = [
  '/avatar-02.jpg',
  '/avatar-04.jpg',
  '/avatar-06.jpg',
  '/avatar-08.jpg',
  '/avatar-10.jpg',
];

function matchesCategory(e: EventItem, filter: CategoryKey): boolean {
  if (filter === 'all') return true;
  if (filter === 'tonight') {
    const d = eventDate(e);
    const now = new Date();
    return d.toDateString() === now.toDateString();
  }
  const map: Record<string, string[]> = {
    mixers: ['mixer'],
    classes: ['creative'],
    outdoors: ['active'],
    culture: ['culture', 'nightlife'],
    food: ['food'],
  };
  return map[filter]?.includes(e.category) ?? true;
}

export default function Events() {
  const { t } = useTranslation('connect');
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const utils = trpc.useUtils();
  const reduced = useReducedMotion();

  const [filter, setFilter] = useState<CategoryKey>('all');
  const [selectedArea, setSelectedArea] = useState<string | null>(null);
  const areaInitialised = useRef(false);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [areaSheetOpen, setAreaSheetOpen] = useState(false);
  const [detail, setDetail] = useState<EventItem | null>(null);
  const [consentEvent, setConsentEvent] = useState<EventItem | null>(null);
  const [consented, setConsented] = useState<Set<number>>(new Set());
  const [ratings, setRatings] = useState<Record<number, number>>({});
  const [metAnyone, setMetAnyone] = useState<Record<number, boolean>>({});
  const [toast, setToast] = useState<ToastPayload | null>(null);

  const showToast = useCallback((message: string, icon?: ToastPayload['icon']) => {
    setToast({ id: Date.now(), message, icon });
  }, []);

  const areasQuery = trpc.events.areas.useQuery(undefined, {
    enabled: isAuthenticated,
  });
  const feedQuery = trpc.events.feed.useQuery(
    { area: selectedArea },
    { enabled: isAuthenticated },
  );
  const profileQuery = trpc.profile.me.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  /* — Initialise the picked area from the engine's saved myArea (once) — */
  useEffect(() => {
    if (!areaInitialised.current && areasQuery.data) {
      areaInitialised.current = true;
      setSelectedArea(areasQuery.data.myArea);
    }
  }, [areasQuery.data]);

  const events = useMemo<EventItem[]>(
    () => (feedQuery.data?.events ?? []) as EventItem[],
    [feedQuery.data],
  );

  const selectedAreaName = useMemo(() => {
    if (!selectedArea) return null;
    return (
      areasQuery.data?.areas.find((a) => a.slug === selectedArea)?.name ??
      selectedArea
    );
  }, [areasQuery.data, selectedArea]);

  const rsvpMutation = trpc.events.rsvp.useMutation({
    onMutate: async ({ eventId }) => {
      const input = { area: selectedArea };
      await utils.events.feed.cancel();
      const prev = utils.events.feed.getData(input);
      utils.events.feed.setData(input, (data) =>
        data
          ? {
              ...data,
              events: data.events.map((e) =>
                e.id === eventId
                  ? {
                      ...e,
                      myRsvp: 'going' as const,
                      goingCount: e.goingCount + (e.myRsvp ? 0 : 1),
                    }
                  : e,
              ),
            }
          : data,
      );
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev)
        utils.events.feed.setData({ area: selectedArea }, ctx.prev);
    },
    onSuccess: () =>
      showToast(
        t('events.toastRsvp'),
        <BadgeCheck size={14} style={{ color: 'var(--ok)' }} aria-hidden="true" />,
      ),
    onSettled: () => utils.events.feed.invalidate(),
  });

  const cancelMutation = trpc.events.cancelRsvp.useMutation({
    onMutate: async ({ eventId }) => {
      const input = { area: selectedArea };
      await utils.events.feed.cancel();
      const prev = utils.events.feed.getData(input);
      utils.events.feed.setData(input, (data) =>
        data
          ? {
              ...data,
              events: data.events.map((e) =>
                e.id === eventId
                  ? {
                      ...e,
                      myRsvp: null,
                      goingCount: Math.max(e.goingCount - (e.myRsvp === 'going' ? 1 : 0), 0),
                    }
                  : e,
              ),
            }
          : data,
      );
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev)
        utils.events.feed.setData({ area: selectedArea }, ctx.prev);
    },
    onSuccess: () => showToast(t('events.toastRsvpRemoved')),
    onSettled: () => utils.events.feed.invalidate(),
  });

  const feedbackMutation = trpc.events.feedback.useMutation({
    onSuccess: () => showToast(t('events.toastFeedback')),
    onError: () => showToast(t('events.toastSaveError')),
  });

  const submitFeedback = useCallback(
    (event: EventItem) => {
      const rating = ratings[event.id];
      if (!rating || feedbackMutation.isPending) return;
      feedbackMutation.mutate({
        eventId: event.id,
        rating,
        metAnyone: metAnyone[event.id],
      });
    },
    [ratings, metAnyone, feedbackMutation],
  );

  const toggleRsvp = useCallback(
    (event: EventItem) => {
      if (event.myRsvp === 'going') {
        cancelMutation.mutate({ eventId: event.id });
        return;
      }
      const anonymity = profileQuery.data?.profile.anonymityMode ?? false;
      if (anonymity && !consented.has(event.id)) {
        setConsentEvent(event);
        return;
      }
      rsvpMutation.mutate({ eventId: event.id });
    },
    [cancelMutation, rsvpMutation, profileQuery.data, consented],
  );

  /* — Derived lists — */
  const now = Date.now();
  const upcoming = events.filter((e) => eventDate(e).getTime() >= now);
  const past = events.filter((e) => eventDate(e).getTime() < now);
  const filtered = upcoming.filter((e) => matchesCategory(e, filter));
  const heroEvent: EventItem | null =
    filter === 'all' ? (filtered[0] ?? null) : null;
  const listEvents = heroEvent ? filtered.slice(1) : filtered;
  const myRsvps = upcoming.filter((e) => e.myRsvp === 'going');

  /* — Hero photo parallax (−8% over scroll-through, transform only) — */
  const heroPhotoY = useMotionValue(0);
  const onScroll = (e: UIEvent<HTMLDivElement>) => {
    if (reduced) return;
    heroPhotoY.set(Math.max(e.currentTarget.scrollTop * -0.08, -28));
  };

  const loading = authLoading || (isAuthenticated && feedQuery.isLoading);

  const feedArea = feedQuery.data?.area ?? null;
  const feedFreshness = feedArea ? fmtAgo(feedArea.lastUpdatedAt, t) : null;

  return (
    <div className="relative h-full overflow-hidden">
      <div className="h-full overflow-y-auto pb-32" onScroll={onScroll}>
        {/* — Header — */}
        <header className="flex items-start justify-between px-5 pt-4">
          <div>
            <h1 className="t-heading" style={{ color: 'var(--text-ink)' }}>
              {t('events.header')}
            </h1>
            <button
              type="button"
              className="t-micro -mx-2 mt-0.5 flex min-h-[36px] items-center px-2"
              style={{ color: 'var(--text-secondary)' }}
              onClick={() => setAreaSheetOpen(true)}
              aria-label={t('events.changeArea')}
            >
              {selectedAreaName ? selectedAreaName.toUpperCase() : t('events.allCities')}
            </button>
            {/* — Engine freshness line — */}
            {feedArea && (
              <p
                className="t-micro mt-0.5"
                style={{ color: 'var(--text-secondary)' }}
              >
                {feedFreshness
                  ? t('events.freshnessUpdated', { ago: feedFreshness })
                  : t('events.freshnessUpdating')}
              </p>
            )}
          </div>
          <button
            type="button"
            aria-label={t('events.filterAria')}
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full"
            style={{ color: 'var(--text-ink)' }}
            onClick={() => setFilterSheetOpen(true)}
          >
            <SlidersHorizontal size={20} aria-hidden="true" />
          </button>
        </header>

        {/* — Category chips rail — */}
        <div
          className="no-scrollbar mt-3 flex gap-2 overflow-x-auto px-5"
          role="tablist"
          aria-label={t('events.categoriesAria')}
        >
          {CATEGORIES.map((c, i) => {
            const selected = filter === c.key;
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
                onClick={() => setFilter(c.key)}
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

        {/* — §4 My RSVPs strip — */}
        <AnimatePresence>
          {myRsvps.length > 0 && (
            <motion.section
              key="my-rsvps"
              initial={reduced ? { opacity: 0 } : { opacity: 0, y: -16, height: 0 }}
              animate={reduced ? { opacity: 1 } : { opacity: 1, y: 0, height: 'auto' }}
              exit={reduced ? { opacity: 0 } : { opacity: 0, y: -16, height: 0 }}
              transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
              className="mt-4 overflow-hidden px-5"
              aria-label={t('events.myRsvps')}
            >
              <GlassCard className="p-4">
                <p className="t-micro" style={{ color: 'var(--text)' }}>
                  {t('events.goingCount', { count: myRsvps.length })}
                </p>
                <div className="no-scrollbar mt-2 flex gap-2 overflow-x-auto">
                  {myRsvps.map((e) => (
                    <button
                      key={e.id}
                      type="button"
                      onClick={() => setDetail(e)}
                      className="flex w-44 shrink-0 items-center gap-2 rounded-2xl p-1.5 text-left"
                      style={{ background: 'var(--field)' }}
                    >
                      <img
                        src={e.image ?? '/event-01.jpg'}
                        alt=""
                        className="h-10 w-10 rounded-xl object-cover"
                      />
                      <span className="min-w-0">
                        <span className="t-caption block truncate font-bold" style={{ color: 'var(--text)' }}>
                          {e.title}
                        </span>
                        <span className="t-micro block" style={{ color: 'var(--text-secondary)' }}>
                          {fmtListDate(eventDate(e))}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              </GlassCard>
            </motion.section>
          )}
        </AnimatePresence>

        {/* — Loading skeleton — */}
        {loading && (
          <div className="mt-5 flex flex-col gap-4 px-5" aria-label={t('events.loading')}>
            <div className="glass skeleton-shimmer h-72 rounded-[28px]" />
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="skeleton-shimmer h-28 rounded-[20px]"
                style={{ background: 'var(--field)' }}
              />
            ))}
          </div>
        )}

        {/* — §1 Featured event hero — */}
        {!loading && heroEvent && (
          <motion.section
            key={heroEvent.id}
            className="mt-5 px-5"
            initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.97, y: 24 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{
              duration: 0.42,
              ease: [0.34, 1.56, 0.64, 1],
            }}
            aria-label={t('events.featured')}
          >
            <div className="relative aspect-[3/2] overflow-hidden rounded-[28px]">
              <motion.img
                src={heroEvent.image ?? '/event-01.jpg'}
                alt={heroEvent.title}
                className="absolute inset-0 h-full w-full object-cover"
                style={{ y: heroPhotoY, scale: 1.12 }}
              />
              <div className="photo-scrim absolute inset-0" aria-hidden="true" />
              <div className="absolute right-4 top-4">
                <BrandMark size={40} tone="onAccent" />
              </div>
            </div>
            <GlassCard edge="amber" className="relative z-10 mx-3 -mt-20 p-5">
              <p className="t-eyebrow">
                {t('events.featuredEyebrow', { date: fmtEyebrowDate(eventDate(heroEvent)) })}
              </p>
              <h2 className="t-title-sm mt-1.5">{heroEvent.title}</h2>
              <p className="t-caption mt-1" style={{ color: 'var(--text-secondary)' }}>
                {t('events.attendees', { count: heroEvent.goingCount })}
                {heroEvent.hostName ? ` · ${t('events.hostedBy', { name: heroEvent.hostName })}` : ''}
              </p>
              <div className="mt-4 flex items-center justify-between gap-3">
                <div className="flex items-center" aria-label={t('events.attendeePreview')}>
                  {ATTENDEE_AVATARS.map((src, i) => (
                    <motion.img
                      key={src}
                      src={src}
                      alt=""
                      loading="lazy"
                      className="-ml-2 h-7 w-7 rounded-full border-2 object-cover first:ml-0"
                      style={{ borderColor: 'rgba(255,255,255,0.75)' }}
                      initial={reduced ? false : { scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{
                        duration: 0.24,
                        delay: reduced ? 0 : 0.3 + i * 0.05,
                        ease: [0.34, 1.56, 0.64, 1],
                      }}
                    />
                  ))}
                  {heroEvent.goingCount > ATTENDEE_AVATARS.length && (
                    <span
                      className="t-caption -ml-2 flex h-7 w-7 items-center justify-center rounded-full border-2"
                      style={{
                        background: 'var(--field-focus)',
                        borderColor: 'rgba(255,255,255,0.75)',
                        color: 'var(--text)',
                      }}
                    >
                      +{heroEvent.goingCount - ATTENDEE_AVATARS.length}
                    </span>
                  )}
                </div>
                <RsvpButton
                  variant="primary"
                  label={t('events.rsvpFree')}
                  going={heroEvent.myRsvp === 'going'}
                  pending={rsvpMutation.isPending || cancelMutation.isPending}
                  onToggle={() => toggleRsvp(heroEvent)}
                />
              </div>
            </GlassCard>
          </motion.section>
        )}

        {/* — §2 Event list — */}
        {!loading && listEvents.length > 0 && (
          <section className="mt-5 flex flex-col gap-3 px-5" aria-label={t('events.upcomingEvents')}>
            {listEvents.map((e, i) => (
              <motion.button
                key={e.id}
                type="button"
                onClick={() => setDetail(e)}
                className="flex items-center gap-3 rounded-[20px] p-2.5 text-left"
                style={{ background: 'var(--field)' }}
                initial={reduced ? { opacity: 0 } : { opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ amount: 0.2, once: true }}
                transition={{
                  duration: 0.38,
                  delay: reduced ? 0 : i * 0.07,
                  ease: [0.22, 1, 0.36, 1],
                }}
              >
                <img
                  src={e.image ?? '/event-01.jpg'}
                  alt=""
                  loading="lazy"
                  className="h-24 w-24 shrink-0 rounded-2xl object-cover"
                />
                <span className="min-w-0 flex-1">
                  <span className="t-value block truncate font-bold" style={{ color: 'var(--text)' }}>
                    {e.title}
                  </span>
                  <span className="t-micro mt-0.5 block" style={{ color: 'var(--text-secondary)' }}>
                    {fmtListDate(eventDate(e))}
                    {e.venue ? ` · ${e.venue}` : ''}
                  </span>
                  <span className="mt-2 flex flex-wrap items-center gap-1.5">
                    <span
                      className="t-caption inline-flex items-center gap-1 rounded-full px-2 py-1"
                      style={{ background: 'var(--field-focus)', color: 'var(--text)' }}
                    >
                      <Users size={12} aria-hidden="true" />
                      {t('events.attending', { count: e.goingCount })}
                    </span>
                    <span
                      className="t-caption inline-flex items-center rounded-full px-2 py-1"
                      style={{ background: 'var(--field-focus)', color: 'var(--text)' }}
                    >
                      {t('events.intentMatch')}
                    </span>
                  </span>
                </span>
                <RsvpButton
                  going={e.myRsvp === 'going'}
                  pending={rsvpMutation.isPending || cancelMutation.isPending}
                  onToggle={() => toggleRsvp(e)}
                />
              </motion.button>
            ))}
          </section>
        )}

        {/* — Empty state — */}
        {!loading && filtered.length === 0 && selectedArea && (
          <section className="mt-16 flex flex-col items-center gap-3 px-8 text-center">
            <BrandMark size={56} />
            <h2 className="t-title-sm" style={{ color: 'var(--text-ink)' }}>
              {t('events.emptyAgentTitle', { area: selectedAreaName ?? t('events.thisArea') })}
            </h2>
            <BtnGlass
              onClick={() => {
                feedQuery.refetch();
                areasQuery.refetch();
              }}
            >
              {t('events.refresh')}
            </BtnGlass>
          </section>
        )}
        {!loading && filtered.length === 0 && !selectedArea && (
          <section className="mt-16 flex flex-col items-center gap-3 px-8 text-center">
            <BrandMark size={56} />
            <h2 className="t-title-sm" style={{ color: 'var(--text-ink)' }}>
              {t('events.emptyTitle')}
            </h2>
            <p className="t-body" style={{ color: 'var(--text-secondary)' }}>
              {t('events.emptyBody')}
            </p>
            <BtnGlass onClick={() => showToast(t('events.notifyToast'))}>
              {t('events.getNotified')}
            </BtnGlass>
          </section>
        )}

        {/* — Recently (past events collapse, subdued) — */}
        {!loading && past.length > 0 && (
          <section className="mt-8 px-5 opacity-70" aria-label={t('events.recentlyAria')}>
            <p className="t-micro mb-2" style={{ color: 'var(--text-secondary)' }}>
              {t('events.recently')}
            </p>
            <div className="flex flex-col gap-3">
              {past.map((e) => (
                <div
                  key={e.id}
                  className="flex flex-col gap-2 rounded-[20px] p-3"
                  style={{ background: 'var(--field)' }}
                >
                  <div className="flex items-center gap-3">
                    <img
                      src={e.image ?? '/event-01.jpg'}
                      alt=""
                      loading="lazy"
                      className="h-12 w-12 rounded-xl object-cover"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="t-value truncate font-bold" style={{ color: 'var(--text)' }}>
                        {e.title}
                      </p>
                      <p className="t-micro" style={{ color: 'var(--text-secondary)' }}>
                        {fmtListDate(eventDate(e))} · {t('events.went', { count: e.goingCount })}
                      </p>
                    </div>
                  </div>
                  {e.myRsvp === 'going' && (
                    <div>
                      <p className="t-caption" style={{ color: 'var(--text)' }}>
                        {t('events.howWas', { title: e.title })}
                      </p>
                      <div className="mt-1.5 flex items-center gap-1">
                        {[1, 2, 3, 4, 5].map((star, i) => (
                          <motion.button
                            key={star}
                            type="button"
                            aria-label={t('events.stars', { count: star })}
                            className="flex min-h-[44px] min-w-[44px] items-center justify-center"
                            initial={reduced ? false : { opacity: 0, scale: 0.6 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ delay: reduced ? 0 : i * 0.04 }}
                            onClick={() => setRatings((r) => ({ ...r, [e.id]: star }))}
                          >
                            <Star
                              size={18}
                              aria-hidden="true"
                              style={{
                                color: 'var(--warn)',
                                fill:
                                  (ratings[e.id] ?? 0) >= star
                                    ? 'var(--warn)'
                                    : 'transparent',
                              }}
                            />
                          </motion.button>
                        ))}
                        <button
                          type="button"
                          aria-pressed={!!metAnyone[e.id]}
                          className="t-caption ml-2 rounded-full px-3 py-1.5"
                          style={{
                            background: 'var(--field-focus)',
                            color: 'var(--text)',
                            boxShadow: metAnyone[e.id]
                              ? '0 0 0 1.5px var(--violet)'
                              : undefined,
                          }}
                          onClick={() =>
                            setMetAnyone((m) => ({ ...m, [e.id]: !m[e.id] }))
                          }
                        >
                          {t('events.metAnyone')}
                        </button>
                        <button
                          type="button"
                          disabled={!ratings[e.id] || feedbackMutation.isPending}
                          className="t-caption ml-auto rounded-full px-3 py-1.5 font-bold text-white disabled:opacity-50"
                          style={{ background: 'var(--violet)' }}
                          onClick={() => submitFeedback(e)}
                        >
                          {feedbackMutation.isPending ? t('events.saving') : t('events.submit')}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* — Auth prompt — */}
        {!authLoading && !isAuthenticated && (
          <section className="mt-16 flex flex-col items-center gap-4 px-8 text-center">
            <BrandMark size={56} />
            <h2 className="t-title-sm" style={{ color: 'var(--text-ink)' }}>
              {t('events.authTitle')}
            </h2>
            <BtnPrimary to={LOGIN_PATH}>{t('events.signIn')}</BtnPrimary>
          </section>
        )}
      </div>

      <TabBar />
      <AppToast toast={toast} onDismiss={() => setToast(null)} />

      {/* — §3 Event detail sheet — */}
      <EventDetailSheet
        event={detail}
        rsvpPending={rsvpMutation.isPending || cancelMutation.isPending}
        onClose={() => setDetail(null)}
        onToggleRsvp={toggleRsvp}
        onToast={(m) => showToast(m)}
      />

      {/* — Category sheet (filter icon) — */}
      <GlassSheet
        open={filterSheetOpen}
        onClose={() => setFilterSheetOpen(false)}
        labelledBy="event-filter-title"
      >
        <div className="px-5 pb-8">
          <h2 id="event-filter-title" className="t-title-sm mt-2">
            {t('events.categories')}
          </h2>
          <div className="mt-4 flex flex-wrap gap-2">
            {CATEGORIES.map((c) => {
              const selected = filter === c.key;
              return (
                <button
                  key={c.key}
                  type="button"
                  className={cn(
                    't-caption flex h-8 items-center rounded-full px-4',
                    selected && 'font-bold',
                  )}
                  style={{
                    background: 'var(--field)',
                    color: 'var(--text)',
                    boxShadow: selected
                      ? '0 0 0 1.5px var(--violet), 0 4px 14px rgba(123,73,245,0.25)'
                      : undefined,
                  }}
                  onClick={() => {
                    setFilter(c.key);
                    setFilterSheetOpen(false);
                  }}
                >
                  {t(c.labelKey)}
                </button>
              );
            })}
          </div>
        </div>
      </GlassSheet>

      {/* — Engine area picker (all users) — */}
      <AreaPickerSheet
        open={areaSheetOpen}
        onClose={() => setAreaSheetOpen(false)}
        currentArea={selectedArea}
        onSelect={setSelectedArea}
      />

      {/* — Anonymity-mode consent step — */}
      <GlassSheet
        open={!!consentEvent}
        onClose={() => setConsentEvent(null)}
        labelledBy="rsvp-consent-title"
      >
        <div className="px-5 pb-8">
          <h2 id="rsvp-consent-title" className="t-title-sm mt-2">
            {t('events.consentTitle')}
          </h2>
          <p className="t-body mt-2" style={{ color: 'var(--text)' }}>
            {t('events.consentBody')}
          </p>
          <div className="mt-5 flex gap-2">
            <BtnGlass className="flex-1" onClick={() => setConsentEvent(null)}>
              {t('events.notNow')}
            </BtnGlass>
            <BtnPrimary
              className="flex-1"
              onClick={() => {
                if (consentEvent) {
                  setConsented((s) => new Set(s).add(consentEvent.id));
                  rsvpMutation.mutate({ eventId: consentEvent.id });
                }
                setConsentEvent(null);
              }}
            >
              {t('events.consentRsvp')}
            </BtnPrimary>
          </div>
        </div>
      </GlassSheet>
    </div>
  );
}
