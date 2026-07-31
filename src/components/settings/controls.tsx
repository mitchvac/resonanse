import type { CSSProperties, ReactNode } from 'react';
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight, Lock, X } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Settings controls — design.md §8.12 / settings.md
 * Rows use var(--field) fills (16px radius, no blur — rows never blur
 * individually per the blurred-surface budget, §9).
 */

/* ------------------------------------------------------------------ */
/* Section wrapper + eyebrow header                                    */
/* ------------------------------------------------------------------ */
export function Section({
  eyebrow,
  children,
  className,
}: {
  eyebrow?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <motion.section
      className={cn('px-5', className)}
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.15 }}
      transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
    >
      {eyebrow && <h2 className="t-eyebrow mb-3 mt-8 first:mt-0">{eyebrow}</h2>}
      <div className="flex flex-col gap-2">{children}</div>
    </motion.section>
  );
}

/* ------------------------------------------------------------------ */
/* SettingRow — var(--field) fill, 16px radius, label + caption + slot */
/* ------------------------------------------------------------------ */
export function SettingRow({
  icon,
  title,
  caption,
  right,
  onClick,
  chevron = false,
  danger = false,
  className,
}: {
  icon?: ReactNode;
  title: ReactNode;
  caption?: ReactNode;
  right?: ReactNode;
  onClick?: () => void;
  chevron?: boolean;
  danger?: boolean;
  className?: string;
}) {
  const body = (
    <>
      {icon && (
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
          style={{ background: 'var(--field-focus)', color: 'var(--text)' }}
          aria-hidden="true"
        >
          {icon}
        </span>
      )}
      <span className="min-w-0 flex-1 text-left">
        <span
          className="block font-bold"
          style={{
            color: danger ? 'var(--danger)' : 'var(--text)',
            fontSize: 15,
            lineHeight: '20px',
          }}
        >
          {title}
        </span>
        {caption && (
          <span
            className="t-caption mt-0.5 block"
            style={{ color: 'var(--text-secondary)' }}
          >
            {caption}
          </span>
        )}
      </span>
      {right}
      {chevron && (
        <ChevronRight
          size={18}
          style={{ color: 'var(--text-secondary)' }}
          aria-hidden="true"
        />
      )}
    </>
  );

  const cls = cn(
    'flex w-full items-center gap-3 rounded-[16px] px-4 py-3 transition-colors duration-150',
    className,
  );
  const style: CSSProperties = { background: 'var(--field)', minHeight: 44 };

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={cls} style={style}>
        {body}
      </button>
    );
  }
  return (
    <div className={cls} style={style}>
      {body}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Toggle — §8.12: 48×28 pill, 22px knob, on = violet, spring 240ms    */
/* ------------------------------------------------------------------ */
export function Toggle({
  checked,
  onChange,
  ariaLabel,
  disabled = false,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  ariaLabel: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        onChange(!checked);
      }}
      className="relative h-7 w-12 shrink-0 rounded-full transition-colors duration-200"
      style={{
        background: checked ? 'var(--violet)' : 'var(--field-focus)',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <motion.span
        className="absolute top-[3px] h-[22px] w-[22px] rounded-full bg-white"
        style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.25)' }}
        animate={{ x: checked ? 23 : 3 }}
        transition={{ duration: 0.24, ease: [0.34, 1.56, 0.64, 1] }}
      />
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* SegmentedControl — §8.12: glass pill container, sliding indicator   */
/* ------------------------------------------------------------------ */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  id,
}: {
  options: { value: T; label: string; icon?: ReactNode }[];
  value: T;
  onChange: (v: T) => void;
  ariaLabel: string;
  /** unique layoutId scope for the sliding indicator */
  id: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className="glass flex p-1"
      style={{ borderRadius: 999 }}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(opt.value)}
            className="t-button relative flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-full"
            style={{ color: 'var(--text)', fontSize: 13 }}
          >
            {active && (
              <motion.span
                layoutId={`seg-${id}`}
                className="absolute inset-0 rounded-full"
                style={{
                  background: 'var(--field)',
                  boxShadow: 'var(--glass-shadow)',
                }}
                transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
              />
            )}
            <span className="relative z-10 inline-flex items-center gap-1.5">
              {opt.icon}
              {opt.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* RangeSlider — §8.12: 2px track (--field), violet fill, 24px knob    */
/* ------------------------------------------------------------------ */
export function RangeSlider({
  min,
  max,
  value,
  onChange,
  ariaLabel,
  format = (v: number) => `${v}`,
}: {
  min: number;
  max: number;
  value: number;
  onChange: (v: number) => void;
  ariaLabel: string;
  format?: (v: number) => string;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className="flex items-center gap-3">
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        aria-label={ariaLabel}
        onChange={(e) => onChange(Number(e.target.value))}
        className="resonance-range flex-1"
        style={{
          background: `linear-gradient(90deg, var(--violet) ${pct}%, var(--field) ${pct}%)`,
        }}
      />
      <span
        className="t-caption flex h-7 min-w-14 items-center justify-center rounded-full px-2 font-bold"
        style={{ background: 'var(--field)', color: 'var(--text)' }}
        aria-live="polite"
      >
        {format(value)}
      </span>
    </div>
  );
}

/** Dual-thumb range (age range). Two overlapped native inputs. */
export function DualRangeSlider({
  min,
  max,
  value,
  onChange,
  ariaLabel,
  format = (v: number) => `${v}`,
}: {
  min: number;
  max: number;
  value: [number, number];
  onChange: (v: [number, number]) => void;
  ariaLabel: string;
  format?: (v: number) => string;
}) {
  const [lo, hi] = value;
  const loPct = ((lo - min) / (max - min)) * 100;
  const hiPct = ((hi - min) / (max - min)) * 100;
  return (
    <div>
      <div className="relative h-6">
        <div
          className="absolute top-1/2 h-0.5 w-full -translate-y-1/2 rounded-full"
          style={{
            background: `linear-gradient(90deg, var(--field) ${loPct}%, var(--violet) ${loPct}%, var(--violet) ${hiPct}%, var(--field) ${hiPct}%)`,
          }}
          aria-hidden="true"
        />
        <input
          type="range"
          min={min}
          max={max}
          value={lo}
          aria-label={`${ariaLabel} minimum`}
          onChange={(e) => onChange([Math.min(Number(e.target.value), hi), hi])}
          className="resonance-range dual absolute inset-0 w-full"
        />
        <input
          type="range"
          min={min}
          max={max}
          value={hi}
          aria-label={`${ariaLabel} maximum`}
          onChange={(e) => onChange([lo, Math.max(Number(e.target.value), lo)])}
          className="resonance-range dual absolute inset-0 w-full"
        />
      </div>
      <div className="mt-2 flex justify-end">
        <span
          className="t-caption flex h-7 items-center justify-center rounded-full px-3 font-bold"
          style={{ background: 'var(--field)', color: 'var(--text)' }}
          aria-live="polite"
        >
          {format(lo)} – {format(hi)}
        </span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Chip — §8.6: pill 32px, --field fill, t-caption                     */
/* ------------------------------------------------------------------ */
export function Chip({
  children,
  selected = false,
  onClick,
  onRemove,
  glyph,
}: {
  children: ReactNode;
  selected?: boolean;
  onClick?: () => void;
  onRemove?: () => void;
  glyph?: ReactNode;
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      className="t-caption flex h-8 items-center gap-1.5 rounded-full px-3"
      style={{
        background: 'var(--field)',
        color: 'var(--text)',
        boxShadow: selected
          ? '0 0 0 1.5px var(--violet), 0 4px 14px rgba(123,73,245,0.25)'
          : undefined,
        fontWeight: selected ? 700 : 400,
      }}
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ duration: 0.24, ease: [0.34, 1.56, 0.64, 1] }}
      whileTap={{ scale: 0.96 }}
      aria-pressed={selected}
    >
      {glyph}
      {children}
      {onRemove && (
        <span
          role="button"
          tabIndex={-1}
          aria-label={`Remove ${typeof children === 'string' ? children : 'chip'}`}
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="-mr-1 flex h-4 w-4 items-center justify-center rounded-full"
          style={{ color: 'var(--text-secondary)' }}
        >
          <X size={12} aria-hidden="true" />
        </span>
      )}
    </motion.button>
  );
}

/* ------------------------------------------------------------------ */
/* LockChip — §8.11: 12px lock + label for premium-gated affordances   */
/* ------------------------------------------------------------------ */
export function LockChip({ label }: { label: string }) {
  return (
    <span
      className="t-caption inline-flex items-center gap-1 rounded-full px-2 py-1 font-bold"
      style={{ background: 'var(--field)', color: 'var(--text)', fontSize: 10 }}
    >
      <Lock size={12} aria-hidden="true" />
      {label}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Toast — §8.13: glass pill top-center, slides down 320ms, 2.8s       */
/* ------------------------------------------------------------------ */
export type ToastData = { id: number; message: string };

export function ToastHost({ toasts }: { toasts: ToastData[] }) {
  return (
    <div
      className="pointer-events-none absolute inset-x-0 top-3 z-[60] flex flex-col items-center gap-2 px-5"
      aria-live="polite"
    >
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            className="glass flex items-center gap-2 rounded-full px-4 py-2"
            style={{ borderRadius: 999 }}
            initial={{ opacity: 0, y: -16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
          >
            <span className="t-caption" style={{ color: 'var(--text)' }}>
              {t.message}
            </span>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

/** Small toast state manager (auto-dismiss 2.8s, §8.13). */
export function useToasts() {
  const [toasts, setToasts] = useState<ToastData[]>([]);
  const push = (message: string) => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 2800);
  };
  return { toasts, push };
}

/* ------------------------------------------------------------------ */
/* Range-input base styles (scoped; injected once — index.css is       */
/* read-only for page agents). §8.12 slider: 2px track, 24px knob.     */
/* ------------------------------------------------------------------ */
export function RangeStyleTag() {
  return (
    <style>{`
      .resonance-range {
        -webkit-appearance: none;
        appearance: none;
        height: 24px;
        background: transparent;
        cursor: pointer;
      }
      .resonance-range:not(.dual) {
        border-radius: 999px;
        height: 2px;
      }
      .resonance-range::-webkit-slider-runnable-track {
        height: 2px;
        background: transparent;
      }
      .resonance-range::-webkit-slider-thumb {
        -webkit-appearance: none;
        appearance: none;
        width: 24px;
        height: 24px;
        margin-top: -11px;
        border-radius: 50%;
        background: var(--stage-base);
        border: var(--glass-quiet-border);
        box-shadow: var(--glass-shadow);
        pointer-events: auto;
      }
      .resonance-range::-moz-range-track {
        height: 2px;
        background: transparent;
      }
      .resonance-range::-moz-range-thumb {
        width: 24px;
        height: 24px;
        border-radius: 50%;
        background: var(--stage-base);
        border: var(--glass-quiet-border);
        box-shadow: var(--glass-shadow);
        pointer-events: auto;
      }
      .resonance-range.dual {
        pointer-events: none;
      }
      .resonance-range:focus-visible {
        outline: 2px solid var(--violet);
        outline-offset: 2px;
      }
    `}</style>
  );
}
