import type { InputHTMLAttributes, ReactNode, Ref, TextareaHTMLAttributes } from 'react';
import { useState } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

/**
 * Flow controls — design.md §8.6 (Chip) / §8.12 (inputs, toggle, segmented)
 * plus the shared step-stagger helpers used by both flow pages.
 *
 * All colors come from the theme tokens: --field fills, var(--text) ink,
 * violet only for selection rings / active toggles. No blur on these rows
 * (they live inside blurred containers or directly on the stage).
 */

const EASE_OUT = [0.22, 1, 0.36, 1] as [number, number, number, number];
const EASE_SPRING = [0.34, 1.56, 0.64, 1] as [number, number, number, number];

/* — Step content stagger (60ms per block, translateY 20px — onboarding.md
     "Shared chrome"; profile-create uses 30–80ms per section) — */
export function StaggerGroup({
  children,
  step = 0.06,
  delay = 0,
  className,
}: {
  children: ReactNode;
  step?: number;
  delay?: number;
  className?: string;
}) {
  return (
    <motion.div
      className={className}
      initial="hidden"
      animate="show"
      variants={{
        hidden: {},
        show: { transition: { staggerChildren: step, delayChildren: delay } },
      }}
    >
      {children}
    </motion.div>
  );
}

export function Block({
  children,
  y = 20,
  className,
}: {
  children: ReactNode;
  y?: number;
  className?: string;
}) {
  return (
    <motion.div
      className={className}
      variants={{
        hidden: { opacity: 0, y },
        show: { opacity: 1, y: 0, transition: { duration: 0.38, ease: EASE_OUT } },
      }}
    >
      {children}
    </motion.div>
  );
}

/* — Group label / eyebrow helpers — */
export function GroupLabel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <h3 className={cn('t-title-sm', className)} style={{ color: 'var(--text)' }}>
      {children}
    </h3>
  );
}

export function EyebrowRow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cn('t-eyebrow', className)}>{children}</p>
  );
}

/* — Chip (§8.6): pill 32px, --field fill, t-caption var(--text); selected =
     violet 1.5px ring + 700 + soft violet glow; pops scale 0.9→1 spring 240ms. — */
export function FlowChip({
  label,
  selected,
  onToggle,
  icon,
  ariaLabel,
}: {
  label: string;
  selected: boolean;
  onToggle: () => void;
  icon?: ReactNode;
  ariaLabel?: string;
}) {
  return (
    <motion.button
      key={selected ? 'on' : 'off'}
      type="button"
      onClick={onToggle}
      aria-pressed={selected}
      aria-label={ariaLabel ?? label}
      initial={selected ? { scale: 0.9 } : false}
      animate={{ scale: 1 }}
      transition={{ duration: 0.24, ease: EASE_SPRING }}
      className="t-caption inline-flex h-8 min-h-[32px] items-center gap-1.5 rounded-full px-3.5 select-none"
      style={{
        background: 'var(--field)',
        color: 'var(--text)',
        fontWeight: selected ? 700 : 400,
        boxShadow: selected
          ? 'inset 0 0 0 1.5px var(--violet), 0 4px 14px rgba(123,73,245,0.22)'
          : 'none',
      }}
    >
      {icon}
      {label}
    </motion.button>
  );
}

/* — Field label used above inputs/chip rows — */
export function FieldLabel({
  children,
  micro,
  className,
}: {
  children: ReactNode;
  /** right-aligned micro label (e.g. "AGE IS SHOWN, BIRTHDAY IS PRIVATE") */
  micro?: string;
  className?: string;
}) {
  return (
    <div className={cn('flex items-baseline justify-between gap-2', className)}>
      <span className="t-body font-bold" style={{ color: 'var(--text)' }}>
        {children}
      </span>
      {micro && (
        <span className="t-micro" style={{ color: 'var(--text)' }}>
          {micro}
        </span>
      )}
    </div>
  );
}

/* — TextField (§8.12): 16px radius, --field fill, var(--text) text,
     focus --field-focus + 1px violet ring. — */
export function FlowField({
  className,
  ref,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { className?: string; ref?: Ref<HTMLInputElement> }) {
  const [focus, setFocus] = useState(false);
  return (
    <input
      {...props}
      ref={ref}
      onFocus={(e) => {
        setFocus(true);
        props.onFocus?.(e);
      }}
      onBlur={(e) => {
        setFocus(false);
        props.onBlur?.(e);
      }}
      className={cn(
        't-value h-[52px] w-full rounded-2xl px-4 outline-none transition-colors duration-fast',
        className,
      )}
      style={{
        background: focus ? 'var(--field-focus)' : 'var(--field)',
        color: 'var(--text)',
        boxShadow: focus ? 'inset 0 0 0 1px var(--violet)' : 'none',
      }}
    />
  );
}

export function FlowTextArea({
  className,
  maxLength,
  showCounter = true,
  value,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & {
  className?: string;
  maxLength?: number;
  showCounter?: boolean;
}) {
  const [focus, setFocus] = useState(false);
  const length = typeof value === 'string' ? value.length : 0;
  return (
    <div className="relative">
      <textarea
        {...props}
        value={value}
        maxLength={maxLength}
        onFocus={(e) => {
          setFocus(true);
          props.onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocus(false);
          props.onBlur?.(e);
        }}
        className={cn(
          't-value w-full resize-none rounded-2xl px-4 py-3.5 outline-none transition-colors duration-fast',
          className,
        )}
        style={{
          background: focus ? 'var(--field-focus)' : 'var(--field)',
          color: 'var(--text)',
          boxShadow: focus ? 'inset 0 0 0 1px var(--violet)' : 'none',
        }}
      />
      {showCounter && maxLength != null && (
        <span
          className="t-caption pointer-events-none absolute right-3 bottom-2.5 transition-opacity duration-fast"
          style={{ color: 'var(--text-secondary)', opacity: focus ? 1 : 0 }}
          aria-hidden={!focus}
        >
          {length}/{maxLength}
        </span>
      )}
    </div>
  );
}

/* — Toggle (§8.12): 48×28 pill, knob 22px, on = violet + knob spring 240ms. — */
export function FlowToggle({
  on,
  onChange,
  ariaLabel,
}: {
  on: boolean;
  onChange: (next: boolean) => void;
  ariaLabel: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={ariaLabel}
      onClick={() => onChange(!on)}
      className="relative h-7 w-12 shrink-0 rounded-full transition-colors duration-fast"
      style={{ background: on ? 'var(--violet)' : 'var(--field-focus)' }}
    >
      <motion.span
        className="absolute top-[3px] h-[22px] w-[22px] rounded-full bg-white shadow"
        initial={false}
        animate={{ x: on ? 23 : 3 }}
        transition={{ duration: 0.24, ease: EASE_SPRING }}
      />
    </button>
  );
}

/* — SegmentedControl (§8.12): pill container, sliding indicator,
     transform-only 240ms. — */
export function SegmentedControl({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: string[];
  value: string;
  onChange: (next: string) => void;
  ariaLabel?: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className="flex rounded-full p-1"
      style={{ background: 'var(--field)' }}
    >
      {options.map((opt) => {
        const active = opt === value;
        return (
          <button
            key={opt}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(opt)}
            className="t-caption relative flex-1 rounded-full px-3 py-2 select-none"
            style={{ color: active ? 'var(--text)' : 'var(--text-secondary)', fontWeight: active ? 700 : 400 }}
          >
            {active && (
              <motion.span
                layoutId="seg-indicator"
                className="absolute inset-0 rounded-full"
                style={{
                  background: 'rgba(255,255,255,0.7)',
                  boxShadow: '0 4px 10px -4px rgba(90,70,40,0.25)',
                }}
                transition={{ duration: 0.24, ease: EASE_OUT }}
                aria-hidden="true"
              />
            )}
            <span className="relative z-10">{opt}</span>
          </button>
        );
      })}
    </div>
  );
}
