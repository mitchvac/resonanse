import type { ReactNode } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { ChevronLeft } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * FlowChrome — shared top chrome for pushed flow pages (onboarding.md /
 * profile-create.md "Shared chrome"): back chevron (left), segmented step
 * progress (center), right slot ("Save & exit" / "Preview" ghost).
 *
 * Progress: N-segment bar, 2px, --field track; filled segments violet with a
 * 320ms tween per step; the current segment pulses opacity 0.6↔1 (1.6s).
 * Reduced motion: fills render statically.
 */
export function ProgressSegments({
  total,
  current,
  className,
}: {
  total: number;
  /** 0-based index of the active segment */
  current: number;
  className?: string;
}) {
  const reduced = useReducedMotion();
  return (
    <div
      className={cn('flex items-center gap-1.5', className)}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={Math.min(current + 1, total)}
      aria-label={`Step ${Math.min(current + 1, total)} of ${total}`}
    >
      {Array.from({ length: total }, (_, i) => {
        const filled = i < current;
        const isCurrent = i === current;
        return (
          <span
            key={i}
            className="relative h-0.5 flex-1 overflow-hidden rounded-full"
            style={{ background: 'var(--field)' }}
          >
            {(filled || isCurrent) && (
              <motion.span
                className="absolute inset-0 rounded-full"
                style={{ background: 'var(--violet)', transformOrigin: 'left' }}
                initial={reduced ? false : { scaleX: 0 }}
                animate={{ scaleX: 1, opacity: isCurrent && !reduced ? [0.6, 1, 0.6] : 1 }}
                transition={
                  isCurrent && !reduced
                    ? {
                        scaleX: { duration: 0.32, ease: [0.22, 1, 0.36, 1] },
                        opacity: { duration: 1.6, repeat: Infinity, ease: 'easeInOut' },
                      }
                    : { duration: 0.32, ease: [0.22, 1, 0.36, 1] }
                }
              />
            )}
          </span>
        );
      })}
    </div>
  );
}

export default function FlowChrome({
  onBack,
  backLabel = 'Back',
  total,
  current,
  right,
  below,
}: {
  onBack?: () => void;
  backLabel?: string;
  total: number;
  current: number;
  /** right-aligned slot (ghost button) */
  right?: ReactNode;
  /** pinned under the progress bar (e.g. profile strength meter) */
  below?: ReactNode;
}) {
  return (
    <header className="relative z-20 shrink-0 px-5 pt-2">
      <div className="grid h-11 grid-cols-[44px_1fr_auto] items-center gap-2">
        <div className="flex items-center">
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              aria-label={backLabel}
              className="-ml-2 flex h-11 w-11 items-center justify-center rounded-full transition-opacity duration-fast active:opacity-70"
              style={{ color: 'var(--text)' }}
            >
              <ChevronLeft size={24} strokeWidth={2} aria-hidden="true" />
            </button>
          ) : (
            <span className="h-11 w-11" aria-hidden="true" />
          )}
        </div>
        <ProgressSegments total={total} current={current} />
        <div className="flex min-w-11 items-center justify-end">{right}</div>
      </div>
      {below}
    </header>
  );
}
