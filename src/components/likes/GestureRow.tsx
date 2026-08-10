import { Flower2, Handshake, Heart } from 'lucide-react';

/**
 * GestureRow — respond to a received like/wave/flower right from the card,
 * without opening the profile sheet first. Three affirmative gestures:
 *   Wave 👋 (say hi) · Flower 🌸 (scarce, count badge) · Like 💜 (like back)
 * Every click stops propagation so the card's own "open profile" tap and the
 * long-press quick-action wrapper don't fire alongside the gesture.
 */
export default function GestureRow({
  flowersLeft = null,
  pending = false,
  onWave,
  onFlower,
  onLike,
  name = 'them',
}: {
  /** null hides the count badge (count unknown); 0 disables the flower */
  flowersLeft?: number | null;
  pending?: boolean;
  onWave: () => void;
  onFlower: () => void;
  onLike: () => void;
  /** liker's first name, used only in aria labels */
  name?: string;
}) {
  // Buttons must swallow pointer+click events: cards are themselves tappable
  // (open profile) and the grid tiles sit inside a long-press wrapper.
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();
  return (
    <div
      className="mt-2 flex items-center gap-2"
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
        className="glass flex h-11 w-11 items-center justify-center rounded-full transition-transform duration-fast active:scale-95 disabled:opacity-50"
      >
        <span className="glass-content flex items-center justify-center">
          <Handshake size={18} style={{ color: 'var(--violet)' }} aria-hidden="true" />
        </span>
      </button>
      <button
        type="button"
        disabled={pending || flowersLeft === 0}
        onClick={onFlower}
        aria-label={
          flowersLeft === null ? `Send ${name} a flower` : `Send ${name} a flower — ${flowersLeft} left today`
        }
        title="Send a flower"
        className="glass relative flex h-11 w-11 items-center justify-center rounded-full transition-transform duration-fast active:scale-95 disabled:opacity-50"
      >
        <span className="glass-content flex items-center justify-center">
          <Flower2 size={18} style={{ color: '#e35d7c' }} aria-hidden="true" />
        </span>
        {flowersLeft !== null && (
          <span
            className="t-micro absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-white"
            style={{ background: '#e35d7c' }}
            aria-hidden="true"
          >
            {flowersLeft}
          </span>
        )}
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={onLike}
        aria-label={`Like ${name} back`}
        title="Like back"
        className="shadow-violet-glow flex h-11 flex-1 items-center justify-center gap-1.5 rounded-full bg-violet text-white transition-transform duration-fast active:scale-[0.97] disabled:opacity-50"
      >
        <Heart size={16} fill="currentColor" strokeWidth={0} aria-hidden="true" />
        <span className="t-caption font-bold">Like back</span>
      </button>
    </div>
  );
}
