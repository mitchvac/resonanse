import { motion } from 'framer-motion';
import { Heart, Sparkle, X } from 'lucide-react';
import { LipsIcon, RoseIcon, WaveHandIcon } from '@/components/gestures/icons';

/**
 * ActionDock — design.md §8.8
 * Floating buttons under the card: Pass · Wave (say hi) · Rose (opens the
 * rose popup — one rose or a dozen with a card) · Like (64px center, violet,
 * elevated) · Kiss · Pulse. Remaining-likes micro label above.
 */
export default function ActionDock({
  likesLeft,
  pulsesLeft,
  flowersLeft,
  kissesLeft,
  onPass,
  onWave,
  onRose,
  onLike,
  onKiss,
  onPulse,
  disabled = false,
}: {
  likesLeft?: number | null;
  pulsesLeft?: number | null;
  flowersLeft?: number | null;
  kissesLeft?: number | null;
  onPass: (e?: React.MouseEvent) => void;
  onWave: (e?: React.MouseEvent) => void;
  /** opens the RoseSheet popup — never sends directly */
  onRose: (e?: React.MouseEvent) => void;
  onLike: (e?: React.MouseEvent) => void;
  onKiss: (e?: React.MouseEvent) => void;
  onPulse: (e?: React.MouseEvent) => void;
  disabled?: boolean;
}) {
  const press = {
    whileTap: { scale: 0.92 },
    transition: { duration: 0.12, ease: [0.34, 1.56, 0.64, 1] as [number, number, number, number] },
  };
  const circle =
    'glass relative flex h-11 w-11 items-center justify-center rounded-full disabled:opacity-50';
  const badge = (n: number, bg: string) => (
    <span
      className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-bold leading-none text-white"
      style={{ background: bg }}
      aria-hidden="true"
    >
      {n}
    </span>
  );
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
      <div className="flex items-center gap-3">
        <motion.button
          type="button"
          aria-label="Pass"
          disabled={disabled}
          onClick={onPass}
          className={circle}
          {...press}
        >
          <span className="glass-content flex items-center justify-center">
            <X size={20} strokeWidth={2.4} style={{ color: 'var(--text)' }} aria-hidden="true" />
          </span>
        </motion.button>

        <motion.button
          type="button"
          aria-label="Wave — say hi"
          disabled={disabled}
          onClick={onWave}
          className={circle}
          {...press}
        >
          <span className="glass-content flex items-center justify-center">
            <WaveHandIcon size={20} />
          </span>
        </motion.button>

        <motion.button
          type="button"
          aria-label={
            flowersLeft != null ? `Send roses (${flowersLeft} left)` : 'Send roses'
          }
          disabled={disabled || flowersLeft === 0}
          onClick={onRose}
          className={circle}
          {...press}
        >
          <span className="glass-content flex items-center justify-center">
            <RoseIcon size={20} />
          </span>
          {flowersLeft != null && flowersLeft < 900 && badge(flowersLeft, '#e35d7c')}
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
            kissesLeft != null ? `Send a kiss (${kissesLeft} left)` : 'Send a kiss'
          }
          disabled={disabled || kissesLeft === 0}
          onClick={onKiss}
          className={circle}
          {...press}
        >
          <span className="glass-content flex items-center justify-center">
            <LipsIcon size={20} />
          </span>
          {kissesLeft != null && kissesLeft < 900 && badge(kissesLeft, '#d64070')}
        </motion.button>

        <motion.button
          type="button"
          aria-label={
            pulsesLeft != null ? `Send Pulse (${pulsesLeft} left)` : 'Send Pulse'
          }
          disabled={disabled || pulsesLeft === 0}
          onClick={onPulse}
          className={circle}
          {...press}
        >
          <span className="glass-content flex items-center justify-center">
            <Sparkle size={20} style={{ color: 'var(--violet)', fill: 'var(--violet)' }} aria-hidden="true" />
          </span>
          {pulsesLeft != null && pulsesLeft < 900 && badge(pulsesLeft, 'var(--violet)')}
        </motion.button>
      </div>
    </div>
  );
}
