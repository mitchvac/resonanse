import { BadgeCheck } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * VerifiedBadge — design.md §8.10
 * 16px violet circle + white check in both themes. Sits after names everywhere.
 */
export default function VerifiedBadge({
  size = 16,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <BadgeCheck
      size={size}
      className={cn('shrink-0', className)}
      style={{ fill: 'var(--violet)', color: '#FFFFFF' }}
      strokeWidth={2.4}
      aria-label="Verified"
      role="img"
    />
  );
}
