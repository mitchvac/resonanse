import type { MouseEvent } from 'react';
import { Heart } from 'lucide-react';
import { LipsIcon, RoseIcon, WaveHandIcon } from '@/components/gestures/icons';

/**
 * GestureRow — respond to a received like/wave/rose/kiss right from the card,
 * without opening the profile sheet first:
 *   Wave 👋 (say hi) · Rose 🌹 (opens the rose popup) · Kiss 💋 · Like 💜
 * Every click stops propagation so the card's own "open profile" tap and the
 * long-press quick-action wrapper don't fire alongside the gesture.
 */
export default function GestureRow({
  flowersLeft = null,
  kissesLeft = null,
  pending = false,
  onWave,
  onRose,
  onKiss,
  onLike,
  name = 'them',
}: {
  /** null hides the count badge (count unknown); 0 disables */
  flowersLeft?: number | null;
  kissesLeft?: number | null;
  pending?: boolean;
  onWave: (e?: MouseEvent) => void;
  /** opens the RoseSheet popup (one rose / a dozen) — never sends directly */
  onRose: (e?: MouseEvent) => void;
  onKiss: (e?: MouseEvent) => void;
  onLike: (e?: MouseEvent) => void;
  /** liker's first name, used only in aria labels */
  name?: string;
}) {
  // Buttons must swallow pointer+click events: cards are themselves tappable
  // (open profile) and the grid tiles sit inside a long-press wrapper.
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();
  const circle =
    'glass relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-transform duration-fast active:scale-95 disabled:opacity-50';
  return (
    <div
      className="mt-2 flex items-center gap-1.5"
      onPointerDown={stop}
      onClick={stop}
      role="group"
      aria-label={`Respond to ${name}`}
    >
      <button
        type="button"
        disabled={pending}
        onClick={onWave}
        aria-label={`Wave back at ${name} — say hi`}
        title="Wave — say hi"
        className={circle}
      >
        <span className="glass-content flex items-center justify-center">
          <WaveHandIcon size={18} />
        </span>
      </button>
      <button
        type="button"
        disabled={pending || flowersLeft === 0}
        onClick={onRose}
        aria-label={
          flowersLeft === null ? `Send ${name} roses` : `Send ${name} roses — ${flowersLeft} left today`
        }
        title="Send roses"
        className={circle}
      >
        <span className="glass-content flex items-center justify-center">
          <RoseIcon size={18} />
        </span>
        {flowersLeft !== null && flowersLeft < 99 && (
          <span
            className="t-micro absolute -right-1 -top-1 flex h-[16px] min-w-[16px] items-center justify-center rounded-full px-1 text-white"
            style={{ background: '#e35d7c' }}
            aria-hidden="true"
          >
            {flowersLeft}
          </span>
        )}
      </button>
      <button
        type="button"
        disabled={pending || kissesLeft === 0}
        onClick={onKiss}
        aria-label={
          kissesLeft === null ? `Send ${name} a kiss` : `Send ${name} a kiss — ${kissesLeft} left today`
        }
        title="Send a kiss"
        className={circle}
      >
        <span className="glass-content flex items-center justify-center">
          <LipsIcon size={18} />
        </span>
        {kissesLeft !== null && kissesLeft < 99 && (
          <span
            className="t-micro absolute -right-1 -top-1 flex h-[16px] min-w-[16px] items-center justify-center rounded-full px-1 text-white"
            style={{ background: '#d64070' }}
            aria-hidden="true"
          >
            {kissesLeft}
          </span>
        )}
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={onLike}
        aria-label={`Like ${name} back`}
        title="Like back"
        className="shadow-violet-glow flex h-9 min-w-9 flex-1 items-center justify-center gap-1 rounded-full bg-violet text-white transition-transform duration-fast active:scale-[0.97] disabled:opacity-50"
      >
        <Heart size={15} fill="currentColor" strokeWidth={0} aria-hidden="true" />
        <span className="t-micro font-bold">Like back</span>
      </button>
    </div>
  );
}
