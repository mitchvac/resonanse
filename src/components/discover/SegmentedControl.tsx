import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

/**
 * SegmentedControl — design.md §8.12 / discover.md top chrome
 * Glass pill container with sliding indicator (Warm Glass: white 0.7 slab +
 * mini studio shadow; Night HUD: --field fill + 1px --viz-stroke underline).
 * Indicator slides 240ms, transform only.
 */
export default function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  labelFor,
  className,
}: {
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
  ariaLabel: string;
  /** Optional display-label mapper — option values stay data, labels get
      translated by the caller. Defaults to rendering the raw option. */
  labelFor?: (option: T) => string;
  className?: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn('glass flex rounded-full p-1', className)}
    >
      <div className="glass-content grid w-full grid-flow-col auto-cols-fr">
        {options.map((option) => {
          const active = option === value;
          return (
            <button
              key={option}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onChange(option)}
              className="t-button relative flex h-9 items-center justify-center rounded-full"
            >
              {active && (
                <motion.span
                  layoutId={`seg-${ariaLabel}`}
                  className="seg-indicator absolute inset-0 rounded-full"
                  style={{
                    background: 'rgba(255,255,255,0.7)',
                    boxShadow: '0 6px 16px -8px rgba(90,70,40,0.3)',
                  }}
                  transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
                  aria-hidden="true"
                />
              )}
              <span
                className="relative"
                style={{ color: active ? 'var(--text)' : 'var(--text-secondary)' }}
              >
                {labelFor ? labelFor(option) : option}
              </span>
            </button>
          );
        })}
      </div>
      <style>{`[data-theme="dark"] .seg-indicator { background: var(--field); box-shadow: inset 0 -1px 0 var(--viz-stroke); }`}</style>
    </div>
  );
}
