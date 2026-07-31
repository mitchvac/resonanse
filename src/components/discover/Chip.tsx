import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Chip / IntentTag — design.md §8.6
 * Pill 32px, var(--field) fill (no blur inside blurred containers),
 * t-caption in var(--text). Selected: violet 1.5px ring + 700.
 */
export default function Chip({
  children,
  selected = false,
  onClick,
  className,
}: {
  children: ReactNode;
  selected?: boolean;
  onClick?: () => void;
  className?: string;
}) {
  const cls = cn(
    't-caption inline-flex h-8 items-center gap-1.5 rounded-full px-3.5',
    'bg-field text-[var(--text)]',
    selected && 'font-bold ring-[1.5px] ring-inset ring-[var(--violet)]',
    onClick && 'transition-transform duration-fast active:scale-95',
    className,
  );
  if (onClick) {
    return (
      <button type="button" className={cls} onClick={onClick} aria-pressed={selected}>
        {children}
      </button>
    );
  }
  return <span className={cls}>{children}</span>;
}
