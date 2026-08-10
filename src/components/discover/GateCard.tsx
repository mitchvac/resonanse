import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import GlassCard from '@/components/GlassCard';
import { BtnPrimary } from '@/components/ui/buttons';
import { cn } from '@/lib/utils';

/**
 * GateCard — design.md §8.11
 * Glass card with edge:amber (Warm Glass) / edge:hud (Night HUD) + violet
 * CTA. Premium gates are the one non-hero surface allowed an edge glow, as
 * the tier signal. Used for every premium gate (no full-screen takeovers
 * except /premium).
 */
export default function GateCard({
  title,
  caption,
  ctaLabel,
  ctaTo = '/premium',
  className,
  children,
}: {
  title: string;
  caption?: string;
  ctaLabel?: string;
  ctaTo?: string;
  className?: string;
  children?: ReactNode;
}) {
  const { t } = useTranslation('discover');
  return (
    <GlassCard edge="amber" className={cn('edge-energize rounded-[24px] p-5', className)}>
      <p className="t-title-sm" style={{ color: 'var(--text)' }}>
        {title}
      </p>
      {caption && (
        <p className="t-caption mt-1.5" style={{ color: 'var(--text-secondary)' }}>
          {caption}
        </p>
      )}
      {children}
      <BtnPrimary to={ctaTo} className="mt-4 h-11 w-full text-[14px]">
        {ctaLabel ?? t('gates.unlockWithPlus')}
      </BtnPrimary>
    </GlassCard>
  );
}
