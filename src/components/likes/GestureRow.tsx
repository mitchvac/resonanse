import type { MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';
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
  name,
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
  const { t } = useTranslation('discover');
  const displayName = name ?? t('common.them');
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
      aria-label={t('gestures.respondTo', { name: displayName })}
    >
      <button
        type="button"
        disabled={pending}
        onClick={onWave}
        aria-label={t('gestures.waveBackAria', { name: displayName })}
        title={t('gestures.waveSayHi')}
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
          flowersLeft === null
            ? t('gestures.sendRosesTo', { name: displayName })
            : t('gestures.sendRosesToLeft', { name: displayName, count: flowersLeft })
        }
        title={t('gestures.sendRoses')}
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
          kissesLeft === null
            ? t('gestures.sendKissTo', { name: displayName })
            : t('gestures.sendKissToLeft', { name: displayName, count: kissesLeft })
        }
        title={t('gestures.sendKiss')}
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
        aria-label={t('gestures.likeBackTo', { name: displayName })}
        title={t('gestures.likeBack')}
        className="shadow-violet-glow flex h-9 min-w-9 flex-1 items-center justify-center gap-1 rounded-full bg-violet text-white transition-transform duration-fast active:scale-[0.97] disabled:opacity-50"
      >
        <Heart size={15} fill="currentColor" strokeWidth={0} aria-hidden="true" />
        <span className="t-micro font-bold">{t('gestures.likeBack')}</span>
      </button>
    </div>
  );
}
