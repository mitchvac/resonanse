import { useState } from 'react';
import { motion } from 'framer-motion';
import GlassCard from '@/components/GlassCard';
import CompatibilityArc from '@/components/discover/CompatibilityArc';
import type { ReceivedLike } from '@/components/discover/types';

/**
 * PulseCard — likes-you.md §1
 * Horizontal rail card. The FIRST unviewed Pulse card is .glass-edge
 * (edge:amber / edge:hud — the viewport's hero glow surface; glow breathes
 * 0.45↔1 over 2.4s until viewed); all other Pulse cards stay edge:none.
 * 64px avatar, name t-title-sm, compatibility arc, Pulse note t-value
 * italic, truncated 2 lines with expand.
 */
export default function PulseCard({
  pulse,
  hero = false,
  index = 0,
  onOpen,
  label = 'PULSE',
  accent = 'var(--violet)',
}: {
  pulse: ReceivedLike;
  hero?: boolean;
  index?: number;
  onOpen: () => void;
  /** 'FLOWER' + rose accent for the flower rail */
  label?: string;
  accent?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const liker = pulse.liker;
  // Never fall back to a stock face: a blurred (free-tier) or photo-less
  // liker gets a violet initial disc — a random stranger's photo here reads
  // as "this is who waved at you", which is a lie (same V83/V84 bug class).
  const photo = liker?.photos?.[0] ?? null;

  return (
    <motion.div
      className="w-[248px] shrink-0"
      initial={{ opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: 0.08 * index, duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
    >
      <GlassCard
        edge={hero ? 'amber' : 'none'}
        className="rounded-[24px] p-4"
        onClick={onOpen}
      >
        <div className="flex items-center gap-3">
          {photo ? (
            <img
              src={photo}
              alt={liker ? `Photo of ${liker.displayName}` : ''}
              className="h-16 w-16 shrink-0 rounded-full object-cover"
            />
          ) : (
            <span
              role="img"
              aria-label={liker ? `${liker.displayName} (photo hidden)` : 'Someone'}
              className="t-title flex h-16 w-16 shrink-0 items-center justify-center rounded-full text-white"
              style={{ background: 'var(--violet)' }}
            >
              <span aria-hidden="true">
                {(liker?.displayName?.trim()[0] ?? '♥').toUpperCase()}
              </span>
            </span>
          )}
          <div className="flex min-w-0 flex-1 items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="t-micro" style={{ color: accent }}>
                {label}
              </p>
              <p className="t-title-sm truncate" style={{ color: 'var(--text)' }}>
                {liker?.displayName ?? 'Someone'}
                {liker ? `, ${liker.age}` : ''}
              </p>
            </div>
            <CompatibilityArc value={pulse.compatibility} size={36} animateKey={pulse.id} />
          </div>
        </div>
        {pulse.comment && (
          <p
            className={`t-value mt-3 italic ${expanded ? '' : 'line-clamp-2'}`}
            style={{ color: 'var(--text)' }}
          >
            “{pulse.comment}”
          </p>
        )}
        {pulse.comment && pulse.comment.length > 90 && (
          <button
            type="button"
            className="t-micro mt-1 underline"
            style={{ color: 'var(--text-secondary)' }}
            onClick={(e) => {
              e.stopPropagation();
              setExpanded((v) => !v);
            }}
          >
            {expanded ? 'Less' : 'More'}
          </button>
        )}
      </GlassCard>
    </motion.div>
  );
}
