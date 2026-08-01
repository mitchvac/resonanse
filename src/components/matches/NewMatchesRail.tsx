import { motion } from 'framer-motion';
import LightTrail from '@/components/LightTrail';
import type { MatchEntry } from '@/components/chat/types';

const RING_R = 31;
const RING_C = 2 * Math.PI * RING_R;
const WINDOW_MS = 48 * 60 * 60 * 1000;

function ringPct(matchCreatedAt: Date | string): number {
  const t =
    matchCreatedAt instanceof Date
      ? matchCreatedAt.getTime()
      : new Date(matchCreatedAt).getTime();
  return Math.min(100, Math.max(2, ((Date.now() - t) / WINDOW_MS) * 100));
}

/**
 * ExpiryRing — matches.md §1: violet 2px progress ring; stroke-dash fills
 * 0→100% over 48h (ring draw 600ms on first view). Near-expiry (≥90%) ring
 * switches to --warn with a 1.6s pulse (opacity only).
 */
function ExpiryRing({ pct, index }: { pct: number; index: number }) {
  const nearExpiry = pct >= 90;
  const stroke = nearExpiry ? 'var(--warn)' : 'var(--violet)';
  const target = RING_C * (1 - pct / 100);
  return (
    <svg
      className="absolute inset-0 h-full w-full -rotate-90"
      viewBox="0 0 72 72"
      aria-hidden="true"
    >
      <circle
        cx="36"
        cy="36"
        r={RING_R}
        fill="none"
        stroke="var(--field)"
        strokeWidth="2"
      />
      <motion.circle
        cx="36"
        cy="36"
        r={RING_R}
        fill="none"
        stroke={stroke}
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray={RING_C}
        initial={{ strokeDashoffset: RING_C }}
        whileInView={{ strokeDashoffset: target }}
        viewport={{ once: true, amount: 0.4 }}
        {...(nearExpiry
          ? {
              animate: { opacity: [1, 0.45, 1] },
              transition: { duration: 1.6, repeat: Infinity, ease: 'easeInOut' },
            }
          : {
              transition: { duration: 0.6, delay: 0.06 * index, ease: [0.22, 1, 0.36, 1] },
            })}
      />
    </svg>
  );
}

/**
 * NewMatchesRail — matches.md §1
 * Top horizontal rail: 72px circle avatars of matches with no conversation
 * yet, each with a violet 2px expiry ring. First cell is the "Your turn"
 * count tile. A LightTrail thread links the rail's cells left→right with
 * glowing node dots beneath each avatar. Avatars stagger 60ms scale 0.8→1.
 */
export default function NewMatchesRail({
  entries,
  onOpen,
}: {
  entries: MatchEntry[];
  onOpen: (entry: MatchEntry) => void;
}) {
  const cells = entries.length + 1; // + "Your turn" tile
  const railWidth = cells * 72 + (cells - 1) * 16;

  return (
    <section aria-label="New matches">
      <div className="no-scrollbar overflow-x-auto px-5 pb-1">
        <div className="relative" style={{ width: railWidth }}>
          {/* Light-trail thread beneath the avatars (§1) */}
          <LightTrail
            width={railWidth}
            height={12}
            nodes={Array.from({ length: cells }, (_, i) => ({
              x: i * 88 + 36,
              y: 6,
            }))}
            style={{ left: 0, top: 76 }}
          />
          <div className="flex gap-4">
            {/* "Your turn" count tile — first cell */}
            <motion.div
              className="flex w-[72px] shrink-0 flex-col items-center gap-1.5"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.38, ease: [0.34, 1.56, 0.64, 1] }}
            >
              <div
                className="flex h-[72px] w-[72px] flex-col items-center justify-center rounded-full"
                style={{ background: 'var(--field)' }}
              >
                <span className="t-title" style={{ color: 'var(--text)' }}>
                  {entries.length}
                </span>
                <span className="t-micro" style={{ color: 'var(--text)' }}>
                  YOUR TURN
                </span>
              </div>
              <span className="t-caption" style={{ color: 'var(--text-secondary)' }}>
                Say hi first
              </span>
            </motion.div>

            {entries.map((entry, i) => {
              const profile = entry.otherProfile;
              const photo = profile?.photos?.[0] ?? '/avatar-03.jpg';
              const name = profile?.displayName?.split(' ')[0] ?? 'Match';
              const pct = ringPct(entry.match.createdAt);
              return (
                <motion.button
                  key={entry.match.id}
                  type="button"
                  onClick={() => onOpen(entry)}
                  className="flex w-[72px] shrink-0 flex-col items-center gap-1.5"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{
                    delay: 0.06 * (i + 1),
                    duration: 0.38,
                    ease: [0.34, 1.56, 0.64, 1],
                  }}
                  aria-label={`Say hi to ${name} — ${Math.round(100 - pct)}% of 48 hours left`}
                >
                  <span className="relative h-[72px] w-[72px]">
                    <ExpiryRing pct={pct} index={i + 1} />
                    <img
                      src={photo}
                      alt={name}
                      className="absolute inset-[5px] h-[62px] w-[62px] rounded-full object-cover"
                      loading="lazy"
                    />
                  </span>
                  <span className="t-caption" style={{ color: 'var(--text)' }}>
                    {name}
                  </span>
                </motion.button>
              );
            })}
          </div>
        </div>
      </div>
      <p className="t-caption mt-2 px-5" style={{ color: 'var(--text-secondary)' }}>
        Say hi within 48h — momentum matters
      </p>
    </section>
  );
}
