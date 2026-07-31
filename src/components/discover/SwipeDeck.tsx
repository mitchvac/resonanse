import { useState } from 'react';
import {
  motion,
  useMotionValue,
  useTransform,
  useReducedMotion,
  AnimatePresence,
} from 'framer-motion';
import GlassCard from '@/components/GlassCard';
import VerifiedBadge from '@/components/discover/VerifiedBadge';
import Chip from '@/components/discover/Chip';
import type { QueueEntry } from '@/components/discover/types';

/**
 * SwipeDeck — discover.md §4 / design.md §7.2 (signature gesture)
 * Full-card stack, 2 cards deep (next card scale 0.96 + translateY 12px).
 * Card follows drag 1:1; rotation = dx * 0.06° capped ±12°. LIKE / NOPE /
 * PULSE stamps fade in at |dx|>48px (opacity = min(1, |dx|/120)) — white
 * stamps sit over the photo scrim in both themes; PULSE is violet.
 * Release beyond 120px or 0.6 velocity → fling 240ms ease-out; otherwise
 * spring back 300ms. Drag-up shows the PULSE stamp; release > 120px up =
 * pulse.
 */
function SwipeCard({
  entry,
  onSwipe,
}: {
  entry: QueueEntry;
  onSwipe: (action: 'like' | 'pass' | 'pulse') => void;
}) {
  const reduced = useReducedMotion();
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotate = useTransform(x, (v) => Math.max(-12, Math.min(12, v * 0.06)));
  const likeOpacity = useTransform(x, [48, 120], [0, 1]);
  const nopeOpacity = useTransform(x, [-120, -48], [1, 0]);
  const pulseOpacity = useTransform(y, [-120, -48], [1, 0]);

  const [gone, setGone] = useState<null | 'like' | 'pass' | 'pulse'>(null);

  const fling = (action: 'like' | 'pass' | 'pulse') => {
    setGone(action);
    // notify parent after the fling has visually committed
    window.setTimeout(() => onSwipe(action), reduced ? 0 : 240);
  };

  return (
    <motion.div
      className="absolute inset-0 touch-none"
      style={{ x, y, rotate, zIndex: 2 }}
      drag
      dragMomentum={false}
      onDragEnd={(_, info) => {
        const dx = info.offset.x;
        const dy = info.offset.y;
        const vx = info.velocity.x;
        if (dy < -120) return fling('pulse');
        if (dx > 120 || vx > 600) return fling('like');
        if (dx < -120 || vx < -600) return fling('pass');
      }}
      animate={
        gone === 'like'
          ? { x: 480, opacity: 0, rotate: 12 }
          : gone === 'pass'
            ? { x: -480, opacity: 0, rotate: -12 }
            : gone === 'pulse'
              ? { y: -560, opacity: 0 }
              : { x: 0, y: 0, rotate: 0 }
      }
      transition={
        gone
          ? { duration: reduced ? 0.2 : 0.24, ease: [0.22, 1, 0.36, 1] }
          : { type: 'spring', duration: reduced ? 0.2 : 0.3, bounce: 0.2 }
      }
    >
      <CardFace entry={entry} />

      {/* stamps — white over the photo scrim is legal in both themes; PULSE violet */}
      <motion.span
        className="t-title pointer-events-none absolute left-5 top-6 z-10 rounded-[24px] border-2 px-4 py-1.5"
        style={{
          opacity: reduced ? 0 : likeOpacity,
          color: '#FFFFFF',
          borderColor: '#FFFFFF',
          transform: 'rotate(-10deg)',
        }}
        aria-hidden="true"
      >
        LIKE
      </motion.span>
      <motion.span
        className="t-title pointer-events-none absolute right-5 top-6 z-10 rounded-[24px] border-2 px-4 py-1.5"
        style={{
          opacity: reduced ? 0 : nopeOpacity,
          color: 'rgba(255,255,255,0.6)',
          borderColor: 'rgba(255,255,255,0.6)',
          transform: 'rotate(10deg)',
        }}
        aria-hidden="true"
      >
        NOPE
      </motion.span>
      <motion.span
        className="t-title pointer-events-none absolute left-1/2 top-1/3 z-10 -translate-x-1/2 rounded-[24px] border-2 px-4 py-1.5"
        style={{
          opacity: reduced ? 0 : pulseOpacity,
          color: 'var(--violet)',
          borderColor: 'var(--violet)',
          background: 'rgba(255,255,255,0.72)',
        }}
        aria-hidden="true"
      >
        PULSE
      </motion.span>
    </motion.div>
  );
}

function CardFace({ entry }: { entry: QueueEntry }) {
  const { profile, compatibility } = entry;
  const photo = profile.photos?.[0] ?? '/avatar-01.jpg';
  const intents = (profile.desires ?? []).slice(0, 3);
  return (
    <article className="relative h-full w-full overflow-hidden rounded-[28px]">
      <img
        src={photo}
        alt={`Photo of ${profile.displayName}`}
        className="absolute inset-0 h-full w-full object-cover"
        draggable={false}
      />
      <div className="photo-scrim absolute inset-0" aria-hidden="true" />
      <div className="absolute inset-x-3 bottom-3">
        <GlassCard edge="none" className="rounded-[24px] p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <h3 className="t-title truncate" style={{ color: 'var(--text)' }}>
                  {profile.displayName}, {profile.age}
                </h3>
                {profile.verified && <VerifiedBadge />}
              </div>
              {profile.city && (
                <p className="t-caption mt-1" style={{ color: 'var(--text-secondary)' }}>
                  {profile.city}
                </p>
              )}
            </div>
            <span className="t-micro shrink-0 pt-1 font-bold" style={{ color: 'var(--text)' }}>
              {compatibility} COMPATIBLE
            </span>
          </div>
          {intents.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {intents.map((intent) => (
                <Chip key={intent}>{intent}</Chip>
              ))}
            </div>
          )}
        </GlassCard>
      </div>
    </article>
  );
}

export default function SwipeDeck({
  entries,
  onSwipe,
}: {
  entries: QueueEntry[];
  onSwipe: (entry: QueueEntry, action: 'like' | 'pass' | 'pulse') => void;
}) {
  const reduced = useReducedMotion();
  const top = entries[0];
  const next = entries[1];

  return (
    <div className="relative aspect-[4/5] w-full">
      <AnimatePresence>
        {next && (
          <motion.div
            key={next.profile.id}
            className="absolute inset-0"
            style={{ zIndex: 1 }}
            initial={false}
            animate={{ scale: 0.96, y: 12 }}
            transition={{ duration: 0.24 }}
          >
            <CardFace entry={next} />
          </motion.div>
        )}
      </AnimatePresence>
      {top && (
        <motion.div
          key={top.profile.id}
          className="absolute inset-0"
          initial={
            reduced ? { opacity: 0 } : { scale: 0.96, y: 28, opacity: 0 }
          }
          animate={{ scale: 1, y: 0, opacity: 1 }}
          transition={
            reduced
              ? { duration: 0.2 }
              : { duration: 0.42, ease: [0.34, 1.56, 0.64, 1] }
          }
        >
          <SwipeCard entry={top} onSwipe={(action) => onSwipe(top, action)} />
        </motion.div>
      )}
    </div>
  );
}
