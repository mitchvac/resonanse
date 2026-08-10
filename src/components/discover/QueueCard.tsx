import { useTranslation } from 'react-i18next';
import { MapPin } from 'lucide-react';
import GlassCard from '@/components/GlassCard';
import VerifiedBadge from '@/components/discover/VerifiedBadge';
import Chip from '@/components/discover/Chip';
import CompatibilityArc from '@/components/discover/CompatibilityArc';
import type { QueueProfile } from '@/components/discover/types';

/**
 * QueueCard — design.md §8.7 / discover.md §1
 * Full-bleed photo (4:5), --photo-scrim bottom 45%, glass info panel
 * overlapping the bottom (edge:none, full slab stack). Contents: name+age
 * (t-title) + VerifiedBadge, distance/neighborhood (t-caption secondary),
 * intent chips (≤3), first prompt excerpt (t-value), compatibility
 * micro-label with thin violet arc. The info panel is the card's only
 * blurred surface.
 */
export default function QueueCard({
  profile,
  compatibility,
  distance,
  onOpen,
  onComment,
}: {
  profile: QueueProfile;
  compatibility: number;
  /** e.g. "2 km · Brooklyn" */
  distance?: string;
  onOpen?: () => void;
  /** Tap a specific prompt → like-with-comment composer */
  onComment?: (targetRef: string) => void;
}) {
  const { t } = useTranslation('discover');
  const photo = profile.photos?.[0] ?? '/avatar-01.jpg';
  const prompt = profile.prompts?.[0];
  const intents = (profile.desires ?? []).slice(0, 3);

  return (
    <article className="relative aspect-[4/5] w-full overflow-hidden rounded-[28px]">
      <img
        src={photo}
        alt={t('common.photoOf', { name: profile.displayName })}
        className="absolute inset-0 h-full w-full object-cover"
        loading="lazy"
      />
      <div className="photo-scrim absolute inset-0" aria-hidden="true" />

      {/* tap zone: open full profile */}
      <button
        type="button"
        className="absolute inset-0 z-[1] cursor-pointer"
        aria-label={t('common.openProfile', { name: profile.displayName })}
        onClick={onOpen}
      />

      <div className="absolute inset-x-3 bottom-3 z-[2]">
        <GlassCard edge="none" className="rounded-[24px] p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <h3 className="t-title truncate" style={{ color: 'var(--text)' }}>
                  {profile.displayName}, {profile.age}
                </h3>
                {profile.verified && <VerifiedBadge />}
              </div>
              {(distance || profile.city) && (
                <p
                  className="t-caption mt-1 flex items-center gap-1"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  <MapPin size={12} aria-hidden="true" />
                  {[distance, profile.city].filter(Boolean).join(' · ')}
                </p>
              )}
            </div>
            <div className="flex shrink-0 flex-col items-center gap-0.5">
              <CompatibilityArc value={compatibility} animateKey={profile.id} />
              <span className="t-micro" style={{ color: 'var(--text)' }}>
                {t('common.compatibleWord')}
              </span>
            </div>
          </div>

          {intents.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {intents.map((intent) => (
                <Chip key={intent}>{intent}</Chip>
              ))}
            </div>
          )}

          {prompt && (
            <button
              type="button"
              className="mt-3 block w-full rounded-[16px] p-3 text-left transition-colors duration-fast"
              style={{ background: 'var(--field)' }}
              onClick={() => onComment?.(prompt.question)}
              aria-label={t('queue.likeCommentAria', { question: prompt.question })}
            >
              <span className="t-micro block" style={{ color: 'var(--text-secondary)' }}>
                {prompt.question}
              </span>
              <span className="t-value mt-1 line-clamp-2 block" style={{ color: 'var(--text)' }}>
                {prompt.answer}
              </span>
            </button>
          )}
        </GlassCard>
      </div>
    </article>
  );
}
