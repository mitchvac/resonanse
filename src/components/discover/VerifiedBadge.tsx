import { useTranslation } from 'react-i18next';
import { Check } from 'lucide-react';

/**
 * VerifiedBadge — design.md §8.10
 * 16px violet circle + white check in both themes. Sits after names.
 */
export default function VerifiedBadge({ size = 16 }: { size?: number }) {
  const { t } = useTranslation('discover');
  return (
    <span
      role="img"
      aria-label={t('a11y.verifiedProfile')}
      className="inline-flex shrink-0 items-center justify-center rounded-full"
      style={{
        width: size,
        height: size,
        background: 'var(--violet)',
      }}
    >
      <Check size={size * 0.68} strokeWidth={3.2} color="#FFFFFF" aria-hidden="true" />
    </span>
  );
}
