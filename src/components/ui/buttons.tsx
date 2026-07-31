import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

/**
 * Buttons — design.md §8.5
 * BtnPrimary: pill 999px, height 52px, violet fill, --violet-glow, t-button,
 *   white text. Press: scale 1→0.96 (120ms) → spring back (§7.2).
 * BtnGlass: pill, glass recipe (radius 999px pill variant of the stack), white text.
 * BtnGhost: text-only, t-button, white → on press opacity 0.7.
 * BtnDanger: pill, transparent + t-button in --danger with 1px --danger inset ring.
 */

const MotionLink = motion(Link);

type CommonProps = {
  children: ReactNode;
  className?: string;
  /** Render as a react-router Link when set */
  to?: string;
  onClick?: () => void;
  type?: 'button' | 'submit';
  disabled?: boolean;
  ariaLabel?: string;
};

const press = {
  whileTap: { scale: 0.96 },
  transition: { duration: 0.12, ease: [0.34, 1.56, 0.64, 1] as [number, number, number, number] },
};

function render(
  variant: 'primary' | 'glass' | 'ghost' | 'danger',
  { children, className, to, onClick, type = 'button', disabled, ariaLabel }: CommonProps,
) {
  const base = 't-button inline-flex min-h-[44px] items-center justify-center gap-2 select-none';
  const styles: Record<typeof variant, string> = {
    primary: cn(
      base,
      'h-[52px] rounded-full px-7 text-white shadow-violet-glow',
      'bg-violet transition-colors duration-fast hover:bg-violet-pressed active:bg-violet-pressed',
    ),
    glass: cn(base, 'glass h-[52px] rounded-full px-7 text-white'),
    ghost: cn(
      base,
      'px-3 text-white transition-opacity duration-fast active:opacity-70',
    ),
    danger: cn(
      base,
      'h-[52px] rounded-full bg-transparent px-7 text-danger',
      'ring-1 ring-inset ring-danger',
    ),
  };
  const cls = cn(styles[variant], disabled && 'opacity-50 pointer-events-none', className);
  const content =
    variant === 'glass' ? (
      <span className="glass-content inline-flex items-center gap-2">{children}</span>
    ) : (
      children
    );

  if (to) {
    return (
      <MotionLink to={to} className={cls} aria-label={ariaLabel} {...press}>
        {content}
      </MotionLink>
    );
  }
  return (
    <motion.button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={cls}
      aria-label={ariaLabel}
      {...press}
    >
      {content}
    </motion.button>
  );
}

export function BtnPrimary(props: CommonProps) {
  return render('primary', props);
}
export function BtnGlass(props: CommonProps) {
  return render('glass', props);
}
export function BtnGhost(props: CommonProps) {
  return render('ghost', props);
}
export function BtnDanger(props: CommonProps) {
  return render('danger', props);
}
