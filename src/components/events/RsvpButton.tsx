import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion } from 'framer-motion';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * RsvpButton — events.md §2 signature moment.
 * "RSVP" morphs to a --ok check "Going" (240ms crossfade). Tapping again
 * cancels. Two variants: `primary` (violet pill, hero / sheet footer) and
 * `ghost` (text button, list rows).
 */
export default function RsvpButton({
  going,
  pending = false,
  variant = 'ghost',
  label,
  onToggle,
  className,
}: {
  going: boolean;
  pending?: boolean;
  variant?: 'primary' | 'ghost';
  label?: string;
  onToggle: () => void;
  className?: string;
}) {
  const { t } = useTranslation('connect');
  const resolvedLabel = label ?? t('events.rsvp');
  const inner = (
    <AnimatePresence mode="wait" initial={false}>
      <motion.span
        key={going ? 'going' : 'rsvp'}
        className="inline-flex items-center justify-center gap-1.5"
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -6 }}
        transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
      >
        {going && <Check size={16} strokeWidth={2.5} aria-hidden="true" />}
        {going ? t('events.going') : resolvedLabel}
      </motion.span>
    </AnimatePresence>
  );

  if (variant === 'primary') {
    return (
      <motion.button
        type="button"
        onClick={onToggle}
        disabled={pending}
        aria-pressed={going}
        className={cn(
          't-button inline-flex h-[52px] min-h-[44px] select-none items-center justify-center rounded-full px-7',
          going
            ? 'bg-transparent text-[var(--ok)] ring-1 ring-inset ring-[var(--ok)]'
            : 'bg-violet text-white shadow-violet-glow transition-colors duration-fast hover:bg-violet-pressed',
          pending && 'pointer-events-none opacity-60',
          className,
        )}
        whileTap={{ scale: 0.96 }}
        transition={{ duration: 0.12 }}
      >
        {inner}
      </motion.button>
    );
  }

  return (
    <motion.button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      disabled={pending}
      aria-pressed={going}
      className={cn(
        't-button inline-flex min-h-[44px] select-none items-center justify-center rounded-full px-3',
        going ? 'text-[var(--ok)]' : 'text-violet',
        pending && 'pointer-events-none opacity-60',
        className,
      )}
      whileTap={{ scale: 0.96 }}
      transition={{ duration: 0.12 }}
    >
      {inner}
    </motion.button>
  );
}
