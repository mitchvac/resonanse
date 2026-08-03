import { motion } from 'framer-motion';
import { Flower2, Heart, Sparkle, X } from 'lucide-react';

/**
 * ActionDock — design.md §8.8
 * Floating buttons under the queue card: Pass (48px, glass, ✕), Flower
 * (48px, glass, rose — scarce daily gesture), Like (64px center, violet,
 * heart, --violet-glow), Pulse (48px, glass, spark). Like elevated 8px.
 * Remaining-likes micro label above.
 */
export default function ActionDock({
  likesLeft,
  pulsesLeft,
  flowersLeft,
  onPass,
  onLike,
  onPulse,
  onFlower,
  disabled = false,
}: {
  likesLeft?: number | null;
  pulsesLeft?: number | null;
  flowersLeft?: number | null;
  onPass: () => void;
  onLike: () => void;
  onPulse: () => void;
  onFlower: () => void;
  disabled?: boolean;
}) {
  const press = {
    whileTap: { scale: 0.92 },
    transition: { duration: 0.12, ease: [0.34, 1.56, 0.64, 1] as [number, number, number, number] },
  };
  return (
    <div className="flex flex-col items-center gap-2.5">
      {likesLeft != null && (
        <motion.span
          key={likesLeft}
          className="t-micro"
          style={{ color: 'var(--text-secondary)' }}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.16 }}
        >
          {likesLeft >= 900
            ? '∞ LIKES WITH RESONANCE+'
            : `${likesLeft} LIKES LEFT TODAY`}
        </motion.span>
      )}
      <div className="flex items-center gap-5">
        <motion.button
          type="button"
          aria-label="Pass"
          disabled={disabled}
          onClick={onPass}
          className="glass flex h-12 w-12 items-center justify-center rounded-full disabled:opacity-50"
          {...press}
        >
          <span className="glass-content flex items-center justify-center">
            <X size={20} strokeWidth={2.4} style={{ color: 'var(--text)' }} aria-hidden="true" />
          </span>
        </motion.button>

        <motion.button
          type="button"
          aria-label={
            flowersLeft != null ? `Send a flower (${flowersLeft} left)` : 'Send a flower'
          }
          disabled={disabled || flowersLeft === 0}
          onClick={onFlower}
          className="glass relative flex h-12 w-12 items-center justify-center rounded-full disabled:opacity-50"
          {...press}
        >
          <span className="glass-content flex items-center justify-center">
            <Flower2 size={20} style={{ color: '#e35d7c' }} aria-hidden="true" />
          </span>
          {flowersLeft != null && flowersLeft < 900 && (
            <span
              className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-bold leading-none text-white"
              style={{ background: '#e35d7c' }}
              aria-hidden="true"
            >
              {flowersLeft}
            </span>
          )}
        </motion.button>

        <motion.button
          type="button"
          aria-label="Like"
          disabled={disabled}
          onClick={onLike}
          className="shadow-violet-glow -mt-2 flex h-16 w-16 items-center justify-center rounded-full bg-violet text-white disabled:opacity-50"
          {...press}
        >
          <Heart size={26} fill="currentColor" strokeWidth={0} aria-hidden="true" />
        </motion.button>

        <motion.button
          type="button"
          aria-label={
            pulsesLeft != null ? `Send Pulse (${pulsesLeft} left)` : 'Send Pulse'
          }
          disabled={disabled || pulsesLeft === 0}
          onClick={onPulse}
          className="glass relative flex h-12 w-12 items-center justify-center rounded-full disabled:opacity-50"
          {...press}
        >
          <span className="glass-content flex items-center justify-center">
            <Sparkle size={20} style={{ color: 'var(--violet)', fill: 'var(--violet)' }} aria-hidden="true" />
          </span>
          {pulsesLeft != null && pulsesLeft < 900 && (
            <span
              className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-bold leading-none text-white"
              style={{ background: 'var(--violet)' }}
              aria-hidden="true"
            >
              {pulsesLeft}
            </span>
          )}
        </motion.button>
      </div>
    </div>
  );
}
