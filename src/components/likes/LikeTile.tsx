import { useTranslation } from 'react-i18next';
import { motion, useReducedMotion } from 'framer-motion';
import { Lock } from 'lucide-react';
import CompatibilityArc from '@/components/discover/CompatibilityArc';
import Chip from '@/components/discover/Chip';
import type { ReceivedLike } from '@/components/discover/types';

/**
 * LikeTile — likes-you.md §2/§3
 * 2-col grid photo tile (radius 16 — NOT glass; photos only).
 * Free: blur-locked — photo at filter:blur(18px) + scrim, overlaid LockChip
 * + compatibility % (visible teaser signal). Resonance+: photo, name
 * t-caption 700, age, intent chip, compatibility arc, context label under.
 * The unlock transition (blur 18→0 + scrim fade) is driven by the parent
 * with a per-tile diagonal-wave delay.
 */
export default function LikeTile({
  like,
  blurred,
  unlockDelay = 0,
  unlocking = false,
  collapsing = false,
  contextLabel,
  onTap,
  gestures,
}: {
  like: ReceivedLike;
  blurred: boolean;
  /** diagonal-wave stagger delay (s) for the unlock transition */
  unlockDelay?: number;
  unlocking?: boolean;
  collapsing?: boolean;
  contextLabel: string;
  onTap: () => void;
  /** quick-response gesture row (wave/flower/like-back), rendered under the
      context label — unblurred tiles only */
  gestures?: React.ReactNode;
}) {
  const { t } = useTranslation('discover');
  const liker = like.liker;
  // Never a stock face: a photo-less liker gets a violet initial disc —
  // a stranger's photo here reads as "this is who liked you" (V83 bug class).
  const photo = liker?.photos?.[0] ?? null;
  const intent = liker?.desires?.[0] ?? liker?.relationshipGoal ?? null;
  const reduced = useReducedMotion();
  const blurDuration = reduced ? 0.2 : 0.6;

  return (
    <motion.div
      layout
      animate={collapsing ? { height: 0, opacity: 0, marginBottom: 0 } : { height: 'auto', opacity: 1 }}
      transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
      className="overflow-hidden"
    >
      <button
        type="button"
        onClick={onTap}
        className="block w-full text-left"
        aria-label={
          blurred
            ? t('likeTile.blurredAria', { value: like.compatibility })
            : t('common.openProfile', { name: liker?.displayName ?? t('common.profile') })
        }
      >
        <div className="relative aspect-[4/5] w-full overflow-hidden rounded-[16px]">
          <motion.div
            className="absolute inset-0"
            initial={false}
            animate={
              unlocking
                ? { filter: 'blur(0px)' }
                : blurred
                  ? { filter: 'blur(18px)' }
                  : { filter: 'blur(0px)' }
            }
            transition={{ delay: unlocking ? unlockDelay : 0, duration: blurDuration, ease: [0.22, 1, 0.36, 1] }}
            style={{ transform: 'scale(1.12)' /* hide blur fringe */ }}
          >
            {photo ? (
              <img
                src={photo}
                alt={blurred ? '' : t('common.photoOf', { name: liker?.displayName ?? t('common.member') })}
                className="h-full w-full object-cover"
                loading="lazy"
              />
            ) : (
              <div
                className="t-heading flex h-full w-full items-center justify-center text-white"
                style={{ background: 'linear-gradient(150deg, var(--violet), var(--violet-deep, var(--violet)))' }}
                aria-label={blurred ? '' : t('common.noPhoto', { name: liker?.displayName ?? t('common.member') })}
              >
                <span aria-hidden="true">
                  {(liker?.displayName?.trim()[0] ?? '♥').toUpperCase()}
                </span>
              </div>
            )}
          </motion.div>
          {/* scrim — fades out with the unblur wave */}
          <motion.div
            className="photo-scrim absolute inset-0"
            aria-hidden="true"
            initial={false}
            animate={{ opacity: blurred ? 1 : unlocking ? 0 : 1 }}
            transition={{ delay: unlocking ? unlockDelay : 0, duration: blurDuration }}
          />
          {blurred ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5">
              <span
                className="flex h-9 w-9 items-center justify-center rounded-full"
                style={{ background: 'rgba(255,255,255,0.85)' }}
              >
                <Lock size={14} style={{ color: 'var(--violet)' }} aria-hidden="true" />
              </span>
              <span className="t-caption font-bold text-white">
                {t('common.compatible', { value: like.compatibility })}
              </span>
            </div>
          ) : (
            <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 p-2.5">
              <div className="min-w-0">
                <p className="t-caption truncate font-bold text-white">
                  {liker?.displayName ?? 'Someone'}
                  {liker ? `, ${liker.age}` : ''}
                </p>
                {intent && (
                  <span className="mt-1 inline-block">
                    <Chip className="h-6 px-2 text-[10px]">{intent}</Chip>
                  </span>
                )}
              </div>
              <span className="shrink-0 rounded-full" style={{ background: 'rgba(255,255,255,0.9)' }}>
                <CompatibilityArc value={like.compatibility} size={34} animateKey={like.id} />
              </span>
            </div>
          )}
        </div>
      </button>
      {!blurred && (
        <>
          <p className="t-micro mt-1.5 truncate" style={{ color: 'var(--text-secondary)' }}>
            {contextLabel}
          </p>
          {gestures}
        </>
      )}
    </motion.div>
  );
}
