import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ArrowUpDown, Lock, Sparkle } from 'lucide-react';
import { trpc } from '@/providers/trpc';
import TabBar from '@/components/TabBar';
import BrandMark from '@/components/BrandMark';
import GlassSheet from '@/components/GlassSheet';
import { BtnGlass, BtnPrimary } from '@/components/ui/buttons';
import PulseCard from '@/components/likes/PulseCard';
import LikeTile from '@/components/likes/LikeTile';
import GestureRow from '@/components/likes/GestureRow';
import SortSheet, { type SortMode } from '@/components/likes/SortSheet';
import GateCard from '@/components/discover/GateCard';
import ProfileSheet from '@/components/discover/ProfileSheet';
import MatchMoment from '@/components/discover/MatchMoment';
import SegmentedControl from '@/components/discover/SegmentedControl';
import RoseSheet, { type RoseVariant } from '@/components/gestures/RoseSheet';
import { useGestureFly, type FlyKind } from '@/components/gestures/GestureFly';
import type { ReceivedLike } from '@/components/discover/types';

/**
 * Likes You — /likes (likes-you.md)
 * Two zones: Pulses received (always visible, never hidden) and the Likes
 * grid (blur-locked for free users; full view + sorting for Resonance+).
 * The premium diagonal unblur wave is the signature unlock moment.
 * A labeled Free / + demo preview toggle sits at the bottom of the screen.
 */

const GRID_CAP = 6;

function contextLabel(like: ReceivedLike): string {
  if (like.kind === 'wave') return 'Waved to say hi';
  if (like.kind === 'kiss') return 'Sent you a kiss';
  if (like.kind === 'flower') return like.targetRef === 'dozen' ? 'Sent you a dozen roses' : 'Sent you a rose';
  if (like.targetType === 'prompt' && like.targetRef) {
    const ref = like.targetRef.length > 22 ? `${like.targetRef.slice(0, 22)}…` : like.targetRef;
    return `Liked your answer '${ref}'`;
  }
  if (like.targetType === 'photo') return 'Liked your photo';
  return 'Liked your profile';
}

function pseudoKm(like: ReceivedLike): number {
  return 2 + ((like.id * 3) % 14);
}

export default function Likes() {
  const reduced = useReducedMotion();
  const utils = trpc.useUtils();
  const receivedQuery = trpc.likes.received.useQuery();
  const meQuery = trpc.profile.me.useQuery(); // V83 — own photo for the match moment
  const remainingQuery = trpc.likes.remaining.useQuery(); // V85 — flower count for the sheet
  const flowersLeft = remainingQuery.data?.flowers ?? null;
  const kissesLeft = remainingQuery.data?.kisses ?? null;
  const dozenLeft = remainingQuery.data?.dozenLeft ?? null;
  const { fly, layer: flyLayer } = useGestureFly();

  const serverBlurred = receivedQuery.data?.blurred ?? true;
  // dev-style Free / + preview toggle (likes-you.md "States & edge cases")
  const [preview, setPreview] = useState<'Auto' | 'Free' | '+'>('Auto');
  const blurred = preview === 'Auto' ? serverBlurred : preview === 'Free';

  const [unlocking, setUnlocking] = useState(false);

  /* Real upgrade moment: server tier flips free → paid (likes.received
     unblurs) — play the same diagonal wave the demo toggle previews. */
  const prevServerBlurred = useRef<boolean | null>(null);
  useEffect(() => {
    const prev = prevServerBlurred.current;
    prevServerBlurred.current = serverBlurred;
    if (prev === true && !serverBlurred && !reduced) {
      setUnlocking(true);
      const t = window.setTimeout(() => setUnlocking(false), 1400);
      return () => window.clearTimeout(t);
    }
    return undefined;
  }, [serverBlurred, reduced]);

  const pulses = useMemo(() => receivedQuery.data?.pulses ?? [], [receivedQuery.data]);
  const flowers = useMemo(() => receivedQuery.data?.flowers ?? [], [receivedQuery.data]);
  const waves = useMemo(() => receivedQuery.data?.waves ?? [], [receivedQuery.data]);
  const kisses = useMemo(() => receivedQuery.data?.kisses ?? [], [receivedQuery.data]);
  const likesAll = useMemo(() => receivedQuery.data?.likes ?? [], [receivedQuery.data]);

  const [viewedPulses, setViewedPulses] = useState<Set<number>>(new Set());
  const [sort, setSort] = useState<SortMode>('Compatibility');
  const [sortOpen, setSortOpen] = useState(false);
  const [teaser, setTeaser] = useState<ReceivedLike | null>(null);
  const [sheetLike, setSheetLike] = useState<ReceivedLike | null>(null);
  const [quickAction, setQuickAction] = useState<ReceivedLike | null>(null);
  const [explainerOpen, setExplainerOpen] = useState(false);
  const [sortGateOpen, setSortGateOpen] = useState(false);
  const [collapsingIds, setCollapsingIds] = useState<Set<number>>(new Set());
  const [passedIds, setPassedIds] = useState<Set<number>>(new Set());
  const [toast, setToast] = useState<string | null>(null);
  const [roseLike, setRoseLike] = useState<ReceivedLike | null>(null); // RoseSheet target
  const [match, setMatch] = useState<{ name: string; photo: string | null; matchId: number | null } | null>(null);

  const likes = useMemo(() => {
    const visible = likesAll.filter((l) => !passedIds.has(l.id));
    const arr = [...visible];
    switch (sort) {
      case 'Compatibility':
        arr.sort((a, b) => b.compatibility - a.compatibility);
        break;
      case 'Most recent':
        arr.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        break;
      case 'Nearby':
        arr.sort((a, b) => pseudoKm(a) - pseudoKm(b));
        break;
      case 'Newest members':
        arr.sort(
          (a, b) =>
            new Date(b.liker?.createdAt ?? 0).getTime() - new Date(a.liker?.createdAt ?? 0).getTime(),
        );
        break;
    }
    return arr;
  }, [likesAll, sort, passedIds]);

  const swipeMutation = trpc.discover.swipe.useMutation({
    onSuccess: async (result, input) => {
      await utils.likes.invalidate();
      if (result.matched) {
        // the matching gesture may live in ANY rail (a wave-back matches a wave)
        const like = [...pulses, ...flowers, ...waves, ...kisses, ...likesAll].find(
          (l) => l.liker?.id === input.toProfileId,
        );
        setMatch({
          name: like?.liker?.displayName ?? 'Them',
          // null → MatchMoment renders their initial disc; NEVER a stock face
          photo: like?.liker?.photos?.[0] ?? null,
          matchId: result.matchId,
        });
        return;
      }
      // quick-gesture feedback (§8.13 toast) — matches take the MatchMoment instead
      if (input.action === 'wave') setToast('You waved — they’ll see it in their Likes.');
      else if (input.action === 'flower')
        setToast(
          input.targetRef === 'dozen'
            ? 'A dozen roses are on their way, card and all.'
            : 'Your rose is on its way — with the card attached.',
        );
      else if (input.action === 'kiss') setToast('Kiss sent — bold move. They’ll see it in their Likes.');
    },
    onError: (err) => {
      // silent failures were the "does nothing" complaint — always say something
      if (err.data?.code === 'FORBIDDEN') {
        setToast(err.message || 'That one’s used up for today.');
      } else {
        setToast("Couldn't send — check your connection and try again.");
      }
    },
  });

  // toast auto-dismiss (§8.13: 2.8s)
  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 2800);
    return () => window.clearTimeout(t);
  }, [toast]);

  const passQuietly = (like: ReceivedLike) => {
    if (!like.liker) return;
    setCollapsingIds((prev) => new Set(prev).add(like.id));
    swipeMutation.mutate({ toProfileId: like.liker.id, action: 'pass' });
    window.setTimeout(() => {
      setPassedIds((prev) => new Set(prev).add(like.id));
      setCollapsingIds((prev) => {
        const next = new Set(prev);
        next.delete(like.id);
        return next;
      });
      setToast("Passed — they won't know.");
    }, 240);
  };

  const likeBack = (like: ReceivedLike) => {
    if (!like.liker) return;
    swipeMutation.mutate({ toProfileId: like.liker.id, action: 'like' });
  };

  // Quick-response gestures straight from a card — wave back at a wave is a
  // match (reciprocation is kind-agnostic), so the MatchMoment may fire here.
  // Every tap gets the flying gesture burst so it never feels dead.
  const gestureBack = (
    like: ReceivedLike,
    action: 'wave' | 'kiss' | 'like',
    e?: { clientX: number; clientY: number },
  ) => {
    if (!like.liker) return;
    const kind: FlyKind = action === 'wave' ? 'wave' : action === 'kiss' ? 'kiss' : 'like';
    fly(kind, e);
    swipeMutation.mutate({ toProfileId: like.liker.id, action });
  };

  const gesturesFor = (like: ReceivedLike) =>
    like.liker ? (
      <GestureRow
        flowersLeft={flowersLeft}
        kissesLeft={kissesLeft}
        pending={swipeMutation.isPending}
        name={like.liker.displayName.split(' ')[0]}
        onWave={(e) => gestureBack(like, 'wave', e)}
        onRose={() => setRoseLike(like)}
        onKiss={(e) => gestureBack(like, 'kiss', e)}
        onLike={(e) => gestureBack(like, 'like', e)}
      />
    ) : null;

  const switchPreview = (v: 'Auto' | 'Free' | '+') => {
    const nextBlurred = v === 'Auto' ? serverBlurred : v === 'Free';
    if (!nextBlurred && blurred && !reduced) {
      setUnlocking(true);
      window.setTimeout(() => setUnlocking(false), 1400);
    }
    setPreview(v);
  };

  const totalCount = pulses.length + flowers.length + waves.length + kisses.length + likesAll.length;
  const shownLikes = blurred ? likes.slice(0, GRID_CAP) : likes;
  const collapsed = blurred ? likes.length - shownLikes.length : 0;

  // first UNVIEWED pulse earns the hero edge glow
  const heroPulseId = pulses.find((p) => !viewedPulses.has(p.id))?.id ?? null;

  const sheetProfile = sheetLike?.liker ?? null;

  return (
    <div className="relative flex h-full flex-col">
      {/* ——— Header ——— */}
      <header className="flex shrink-0 items-start justify-between px-5 pt-4">
        <div>
          <h1 className="t-heading" style={{ color: 'var(--text-ink)' }}>
            Likes You
          </h1>
          <p className="t-micro mt-1" style={{ color: 'var(--text-secondary)' }}>
            {totalCount} PEOPLE · {pulses.length} PULSES
            {flowers.length > 0 ? ` · ${flowers.length} ROSES` : ''}
            {waves.length > 0 ? ` · ${waves.length} WAVES` : ''}
            {kisses.length > 0 ? ` · ${kisses.length} KISSES` : ''}
          </p>
        </div>
        {blurred ? (
          <button
            type="button"
            onClick={() => setSortGateOpen(true)}
            className="t-micro flex min-h-[44px] items-center gap-1 rounded-full px-3"
            style={{ background: 'var(--field)', color: 'var(--text)' }}
            aria-label="Sort — Resonance+ feature"
          >
            <Lock size={12} aria-hidden="true" /> Sort
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setSortOpen(true)}
            className="glass flex h-10 min-h-[44px] w-10 min-w-[44px] items-center justify-center rounded-full"
            aria-label="Sort likes"
          >
            <span className="glass-content flex items-center justify-center">
              <ArrowUpDown size={18} style={{ color: 'var(--text)' }} aria-hidden="true" />
            </span>
          </button>
        )}
      </header>

      {/* ——— Scrollable content ——— */}
      <div className="no-scrollbar flex-1 overflow-y-auto px-5 pb-32 pt-4">
        {receivedQuery.isLoading ? (
          <LikesSkeleton />
        ) : receivedQuery.isError ? (
          <div className="flex flex-col items-center px-6 py-16 text-center">
            <BrandMark size={56} />
            <h2 className="t-title-sm mt-5" style={{ color: 'var(--text-ink)' }}>
              Couldn't load your likes.
            </h2>
            <p className="t-body mt-2" style={{ color: 'var(--text-secondary)' }}>
              Check your connection and try again.
            </p>
            <BtnGlass className="mt-6" onClick={() => void receivedQuery.refetch()}>
              Retry
            </BtnGlass>
          </div>
        ) : totalCount === 0 ? (
          /* zero likes — EmptyState */
          <div className="flex flex-col items-center px-6 py-16 text-center">
            <BrandMark size={56} />
            <h2 className="t-title-sm mt-5" style={{ color: 'var(--text-ink)' }}>
              Your first like is on its way.
            </h2>
            <p className="t-body mt-2" style={{ color: 'var(--text-secondary)' }}>
              Likes never expire — when someone resonates, they'll land here.
            </p>
            <BtnGlass to="/premium" className="mt-6">
              Boost your profile
            </BtnGlass>
          </div>
        ) : (
          <>
            {/* §1 Pulses received — always visible, never hidden */}
            {pulses.length > 0 && (
              <section aria-label="Pulses received">
                <p className="t-eyebrow mb-3">Pulses received</p>
                <div className="no-scrollbar -mx-5 flex gap-3 overflow-x-auto px-5 pb-1">
                  {pulses.map((pulse, i) => (
                    <PulseCard
                      key={pulse.id}
                      pulse={pulse}
                      hero={pulse.id === heroPulseId}
                      index={i}
                      onOpen={() => {
                        setViewedPulses((prev) => new Set(prev).add(pulse.id));
                        if (pulse.liker) setSheetLike(pulse);
                      }}
                      gestures={gesturesFor(pulse)}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* §1b Roses received — scarce gesture, never blurred; the realistic
                rose art sits on the card so a dozen looks like a dozen */}
            {flowers.length > 0 && (
              <section aria-label="Roses received" className="mt-6">
                <p className="t-eyebrow mb-3">Roses received</p>
                <div className="no-scrollbar -mx-5 flex gap-3 overflow-x-auto px-5 pb-1">
                  {flowers.map((flower, i) => (
                    <PulseCard
                      key={flower.id}
                      pulse={flower}
                      index={i}
                      label={flower.targetRef === 'dozen' ? 'A DOZEN ROSES' : 'A ROSE'}
                      accent="#e35d7c"
                      art={flower.targetRef === 'dozen' ? '/gestures/roses-dozen.png' : '/gestures/rose-single.png'}
                      onOpen={() => {
                        if (flower.liker) setSheetLike(flower);
                      }}
                      gestures={gesturesFor(flower)}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* §1c Waves received — the "say hi" gesture, never blurred */}
            {waves.length > 0 && (
              <section aria-label="Waves received" className="mt-6">
                <p className="t-eyebrow mb-3">Waved to say hi</p>
                <div className="no-scrollbar -mx-5 flex gap-3 overflow-x-auto px-5 pb-1">
                  {waves.map((wave, i) => (
                    <PulseCard
                      key={wave.id}
                      pulse={wave}
                      index={i}
                      label="WAVE"
                      accent="#c98a2d"
                      onOpen={() => {
                        if (wave.liker) setSheetLike(wave);
                      }}
                      gestures={gesturesFor(wave)}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* §1d Kisses received — the bold gesture, never blurred */}
            {kisses.length > 0 && (
              <section aria-label="Kisses received" className="mt-6">
                <p className="t-eyebrow mb-3">Kisses received</p>
                <div className="no-scrollbar -mx-5 flex gap-3 overflow-x-auto px-5 pb-1">
                  {kisses.map((kiss, i) => (
                    <PulseCard
                      key={kiss.id}
                      pulse={kiss}
                      index={i}
                      label="KISS"
                      accent="#d64070"
                      onOpen={() => {
                        if (kiss.liker) setSheetLike(kiss);
                      }}
                      gestures={gesturesFor(kiss)}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* §2/§3 Likes grid */}
            {likes.length > 0 && (
              <section aria-label="People who liked you" className="mt-6">
                <p className="t-eyebrow mb-3">
                  {blurred && likes[0]
                    ? `Someone liked your ${likes[0].targetType === 'prompt' ? `prompt '${(likes[0].targetRef ?? '').slice(0, 18)}…'` : likes[0].targetType === 'photo' ? 'photo #2' : 'profile'}`
                    : 'People who liked you'}
                </p>
                <div className="relative">
                  <div className="grid grid-cols-2 gap-3">
                    {shownLikes.map((like, i) => {
                      const col = i % 2;
                      const row = Math.floor(i / 2);
                      return (
                        <LongPressTile
                          key={like.id}
                          like={like}
                          blurred={blurred}
                          unlocking={unlocking}
                          unlockDelay={(col + row) * 0.05}
                          collapsing={collapsingIds.has(like.id)}
                          contextLabel={contextLabel(like)}
                          onTap={() => (blurred ? setTeaser(like) : like.liker && setSheetLike(like))}
                          onLongPress={() => !blurred && setQuickAction(like)}
                          gestures={blurred ? undefined : gesturesFor(like)}
                        />
                      );
                    })}
                    {collapsed > 0 && (
                      <a
                        href="/premium"
                        className="relative block aspect-[4/5] w-full overflow-hidden rounded-[16px]"
                        style={{ background: 'var(--field)' }}
                        aria-label={`${collapsed} more likes — unlock to see them`}
                      >
                        <span className="t-title flex h-full w-full items-center justify-center" style={{ color: 'var(--text)' }}>
                          +{collapsed}
                        </span>
                      </a>
                    )}
                  </div>
                  {/* one grid-wide light sweep on unlock */}
                  {unlocking && !reduced && (
                    <motion.div
                      className="pointer-events-none absolute inset-0 z-10"
                      aria-hidden="true"
                      style={{
                        background:
                          'linear-gradient(115deg, transparent 30%, rgba(255,255,255,0.5) 50%, transparent 70%)',
                      }}
                      initial={{ x: '-110%' }}
                      animate={{ x: '110%' }}
                      transition={{ duration: 0.56, ease: 'linear' }}
                    />
                  )}
                </div>
              </section>
            )}

            {/* §2 gate — sticky bottom GateCard (allowed second glow surface) */}
            {blurred && likes.length > 0 && (
              <motion.div
                className="sticky bottom-2 z-20 mt-6"
                initial={reduced ? { opacity: 0 } : { y: 24, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ duration: 0.32, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
              >
                <GateCard
                  title="See who's already into you"
                  caption="Unblur every like, sort by compatibility, and never miss a Pulse."
                  ctaLabel="Unlock with Resonance+"
                />
              </motion.div>
            )}
          </>
        )}

        {/* §4 footer note */}
        {totalCount > 0 && (
          <div className="mt-8 flex flex-col items-center gap-1 text-center">
            <p className="t-micro" style={{ color: 'var(--text-secondary)' }}>
              Likes never expire. Pulse senders always appear at the top.
            </p>
            <button
              type="button"
              className="t-button px-3 py-2 transition-opacity duration-fast active:opacity-70"
              style={{ color: 'var(--text)' }}
              onClick={() => setExplainerOpen(true)}
            >
              How Pulses work
            </button>
          </div>
        )}

        {/* demo preview toggle (labeled, unobtrusive) */}
        <div className="mt-6 flex flex-col items-center gap-1.5">
          <span className="t-micro" style={{ color: 'var(--text-secondary)' }}>
            DEMO PREVIEW
          </span>
          <SegmentedControl
            options={['Auto', 'Free', '+'] as const}
            value={preview}
            onChange={switchPreview}
            ariaLabel="Tier preview"
            className="w-56"
          />
        </div>
      </div>

      <TabBar likesCount={totalCount} />

      {/* ——— Toast (§8.13) ——— */}
      <AnimatePresence>
        {toast && (
          <motion.div
            className="glass absolute inset-x-0 top-3 z-50 mx-auto w-fit rounded-full px-4 py-2"
            initial={{ opacity: 0, y: -16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
            role="status"
          >
            <span className="glass-content t-caption" style={{ color: 'var(--text)' }}>
              {toast}
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ——— Sheets ——— */}

      {/* blurred tile teaser (§2): teaser line + unlock CTA, no identity */}
      <GlassSheet open={!!teaser} onClose={() => setTeaser(null)} labelledBy="teaser-title">
        <div className="px-6 pb-8 pt-2">
          <p className="t-eyebrow">Someone likes you</p>
          <h3 id="teaser-title" className="t-title-sm mt-1" style={{ color: 'var(--text)' }}>
            {teaser
              ? `${contextLabel(teaser)} · ${pseudoKm(teaser)} km away · ${teaser.compatibility} compatible`
              : ''}
          </h3>
          <p className="t-body mt-2" style={{ color: 'var(--text-secondary)' }}>
            Resonance+ unblurs every like — including this one.
          </p>
          <BtnPrimary to="/premium" className="mt-5 w-full">
            Unlock with Resonance+
          </BtnPrimary>
        </div>
      </GlassSheet>

      {/* full profile sheet (tap unblurred tile / pulse card) with Like-back */}
      <ProfileSheet
        open={!!sheetLike}
        profile={sheetProfile}
        compatibility={sheetLike?.compatibility ?? 0}
        distance={sheetLike ? `${pseudoKm(sheetLike)} km` : undefined}
        pending={swipeMutation.isPending}
        flowersLeft={flowersLeft}
        kissesLeft={kissesLeft}
        onPass={() => {
          if (sheetLike) passQuietly(sheetLike);
          setSheetLike(null);
        }}
        onLike={(e) => {
          if (sheetLike) gestureBack(sheetLike, 'like', e);
          setSheetLike(null);
        }}
        onPulse={() => {
          if (sheetLike?.liker) {
            swipeMutation.mutate({ toProfileId: sheetLike.liker.id, action: 'pulse' });
          }
          setSheetLike(null);
        }}
        onRose={() => {
          // open the rose popup (single vs dozen) — never sends directly
          if (sheetLike) setRoseLike(sheetLike);
          setSheetLike(null);
        }}
        onKiss={(e) => {
          if (sheetLike) gestureBack(sheetLike, 'kiss', e);
          setSheetLike(null);
        }}
        onWave={(e) => {
          if (sheetLike) gestureBack(sheetLike, 'wave', e);
          setSheetLike(null);
        }}
        onClose={() => setSheetLike(null)}
      />

      {/* rose popup — one rose with a card, or a dozen with a card */}
      <RoseSheet
        open={!!roseLike}
        name={roseLike?.liker?.displayName.split(' ')[0] ?? 'them'}
        flowersLeft={flowersLeft}
        dozenLeft={dozenLeft}
        pending={swipeMutation.isPending}
        onSend={(variant: RoseVariant) => {
          if (roseLike?.liker) {
            swipeMutation.mutate({
              toProfileId: roseLike.liker.id,
              action: 'flower',
              targetType: 'profile',
              targetRef: variant === 'dozen' ? 'dozen' : undefined,
            });
          }
        }}
        onClose={() => setRoseLike(null)}
      />

      {/* long-press quick actions (§3) */}
      <GlassSheet open={!!quickAction} onClose={() => setQuickAction(null)} labelledBy="quick-actions">
        <div className="px-6 pb-8 pt-2">
          <h3 id="quick-actions" className="t-title-sm" style={{ color: 'var(--text)' }}>
            {quickAction?.liker?.displayName ?? 'Quick actions'}
          </h3>
          <div className="mt-4 flex flex-col gap-2.5">
            <BtnPrimary
              onClick={() => {
                if (quickAction) likeBack(quickAction);
                setQuickAction(null);
              }}
            >
              Like back
            </BtnPrimary>
            <BtnGlass
              onClick={() => {
                if (quickAction) passQuietly(quickAction);
                setQuickAction(null);
              }}
            >
              Pass quietly
            </BtnGlass>
          </div>
        </div>
      </GlassSheet>

      {/* sort is a Resonance+ feature — free sees the gate */}
      <GlassSheet open={sortGateOpen} onClose={() => setSortGateOpen(false)} labelledBy="sort-gate">
        <div className="px-6 pb-8 pt-2">
          <h3 id="sort-gate" className="sr-only">
            Sort by compatibility
          </h3>
          <GateCard
            title="Sort by what matters"
            caption="Compatibility, recency, distance — sorting is a Resonance+ feature."
            ctaLabel="Unlock with Resonance+"
          />
        </div>
      </GlassSheet>

      {/* How Pulses work — explainer sheet (§4) */}
      <GlassSheet open={explainerOpen} onClose={() => setExplainerOpen(false)} labelledBy="pulse-explainer">
        <div className="px-6 pb-8 pt-2">
          <div className="flex items-center gap-2">
            <Sparkle size={18} style={{ color: 'var(--violet)', fill: 'var(--violet)' }} aria-hidden="true" />
            <h3 id="pulse-explainer" className="t-title-sm" style={{ color: 'var(--text)' }}>
              How Pulses work
            </h3>
          </div>
          <p className="t-body mt-3" style={{ color: 'var(--text)' }}>
            A Pulse is a like with a note attached — the highest-signal way to
            say "this specific thing about you." Pulses are never blurred and
            always pin to the top of this page.
          </p>
          <p className="t-body mt-2" style={{ color: 'var(--text-secondary)' }}>
            Send them from a profile's Pulse button. Liking a Pulse back is an
            instant match.
          </p>
        </div>
      </GlassSheet>

      <SortSheet
        open={sortOpen}
        value={sort}
        onChange={setSort}
        onClose={() => setSortOpen(false)}
      />

      {/* flying gesture bursts — optimistic feedback on every tap */}
      {flyLayer}

      <MatchMoment
        open={!!match}
        theirPhoto={match?.photo ?? null}
        theirName={match?.name ?? ''}
        myPhoto={meQuery.data?.profile?.photos?.filter(Boolean)[0] ?? null}
        myName={meQuery.data?.profile?.displayName ?? ''}
        matchId={match?.matchId ?? null}
        onClose={() => setMatch(null)}
      />
    </div>
  );
}

/* long-press wrapper: 500ms hold → quick actions (§3) */
function LongPressTile({
  onTap,
  onLongPress,
  ...tileProps
}: {
  like: ReceivedLike;
  blurred: boolean;
  unlocking: boolean;
  unlockDelay: number;
  collapsing: boolean;
  contextLabel: string;
  onTap: () => void;
  onLongPress: () => void;
  gestures?: React.ReactNode;
}) {
  const timer = useRef<number | null>(null);
  const fired = useRef(false);
  const start = () => {
    fired.current = false;
    timer.current = window.setTimeout(() => {
      fired.current = true;
      onLongPress();
    }, 500);
  };
  const cancel = () => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = null;
  };
  return (
    <div
      onPointerDown={start}
      onPointerUp={cancel}
      onPointerLeave={cancel}
      onClick={() => {
        if (!fired.current) onTap();
        fired.current = false;
      }}
    >
      <LikeTile {...tileProps} onTap={() => { /* handled by wrapper */ }} />
    </div>
  );
}

function LikesSkeleton() {
  return (
    <div aria-label="Loading likes" role="status">
      <div className="flex gap-3">
        <div className="skeleton-shimmer h-44 w-[248px] shrink-0 rounded-[24px] bg-field" />
        <div className="skeleton-shimmer h-44 w-[248px] shrink-0 rounded-[24px] bg-field" />
      </div>
      <div className="mt-6 grid grid-cols-2 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="skeleton-shimmer aspect-[4/5] rounded-[16px] bg-field" />
        ))}
      </div>
    </div>
  );
}
