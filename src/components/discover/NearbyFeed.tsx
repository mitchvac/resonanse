import { motion } from 'framer-motion';
import type { QueueEntry } from '@/components/discover/types';

/**
 * NearbyFeed — discover.md §6
 * Real-time local grid: 2-col masonry of compact photo tiles (radius 16,
 * name t-caption + --ok presence dot + distance). Tiles are NOT glass —
 * the blur budget stays on chrome. Tap → profile sheet.
 */
export default function NearbyFeed({
  entries,
  onOpen,
}: {
  entries: QueueEntry[];
  onOpen: (entry: QueueEntry) => void;
}) {
  return (
    <section aria-label="Nearby">
      <p className="t-micro mb-3" style={{ color: 'var(--text-secondary)' }}>
        HAPPENING NEAR YOU · UPDATED LIVE
      </p>
      <div className="grid grid-cols-2 gap-3">
        {entries.map((entry, i) => {
          const photo = entry.profile.photos?.[0] ?? '/avatar-01.jpg';
          return (
            <motion.button
              key={entry.profile.id}
              type="button"
              onClick={() => onOpen(entry)}
              className="group relative overflow-hidden rounded-[16px] text-left"
              style={{ aspectRatio: i % 3 === 0 ? '3/4' : '4/5' }}
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.04 * i, duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
              aria-label={`Open ${entry.profile.displayName}'s profile`}
            >
              <img
                src={photo}
                alt={`Photo of ${entry.profile.displayName}`}
                className="absolute inset-0 h-full w-full object-cover"
                loading="lazy"
              />
              <div className="photo-scrim absolute inset-0" aria-hidden="true" />
              <div className="absolute inset-x-0 bottom-0 flex items-center gap-1.5 p-2.5">
                <span
                  className="h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ background: 'var(--ok)' }}
                  aria-label="Active now"
                />
                <span className="t-caption font-bold text-white">
                  {entry.profile.displayName}
                </span>
                <span className="t-caption" style={{ color: 'rgba(255,255,255,0.72)' }}>
                  · {2 + ((entry.profile.id * 3) % 14)} km
                </span>
              </div>
            </motion.button>
          );
        })}
      </div>
    </section>
  );
}
