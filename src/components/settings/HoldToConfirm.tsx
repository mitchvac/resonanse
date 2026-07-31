import { useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';

/**
 * HoldToConfirm — settings.md §4: destructive flows use a 400ms
 * hold-to-confirm with a fill sweep to prevent accidents. Presentational:
 * fires `onConfirm` when the hold completes.
 */
export default function HoldToConfirm({
  label,
  holdingLabel,
  onConfirm,
  holdMs = 400,
  className,
}: {
  label: string;
  holdingLabel?: string;
  onConfirm: () => void;
  holdMs?: number;
  className?: string;
}) {
  const [holding, setHolding] = useState(false);
  const timer = useRef<number | null>(null);
  const reduced = useReducedMotion();

  const start = () => {
    setHolding(true);
    timer.current = window.setTimeout(() => {
      setHolding(false);
      onConfirm();
    }, reduced ? 0 : holdMs);
  };
  const cancel = () => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
    setHolding(false);
  };

  return (
    <button
      type="button"
      className={cn(
        't-button relative h-[52px] w-full overflow-hidden rounded-full ring-1 ring-inset',
        className,
      )}
      style={{ color: 'var(--danger)', ['--tw-ring-color' as never]: 'var(--danger)' }}
      onPointerDown={start}
      onPointerUp={cancel}
      onPointerLeave={cancel}
      onKeyDown={(e) => {
        if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) start();
      }}
      onKeyUp={cancel}
      aria-label={`${label} — press and hold to confirm`}
    >
      <motion.span
        className="absolute inset-0"
        style={{ background: 'var(--danger)', transformOrigin: 'left center' }}
        initial={false}
        animate={{ scaleX: holding ? 1 : 0 }}
        transition={
          holding
            ? { duration: (reduced ? 0 : holdMs) / 1000, ease: 'linear' }
            : { duration: 0.16 }
        }
        aria-hidden="true"
      />
      <span
        className="relative z-10 transition-colors duration-150"
        style={{ color: holding ? '#FFFFFF' : 'var(--danger)' }}
      >
        {holding ? holdingLabel ?? label : label}
      </span>
    </button>
  );
}
