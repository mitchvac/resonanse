import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { Check } from 'lucide-react';

/**
 * Feedback primitives — Toast (design.md §8.13), VerifiedBadge (§8.10),
 * ParticleRing (§7.2 success burst).
 */

const EASE_SPRING = [0.34, 1.56, 0.64, 1] as [number, number, number, number];

/* — Toast: glass pill top-center, slides down 320ms, auto-dismiss 2.8s,
     icon + t-caption in var(--text). — */
export function FlowToast({
  toast,
  onDismiss,
}: {
  toast: { id: number; icon?: ReactNode; message: string } | null;
  onDismiss: () => void;
}) {
  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(onDismiss, 2800);
    return () => window.clearTimeout(t);
  }, [toast, onDismiss]);

  return (
    <AnimatePresence>
      {toast && (
        <motion.div
          key={toast.id}
          role="status"
          className="glass absolute top-4 left-1/2 z-[60] flex items-center gap-2 rounded-full px-4 py-2.5"
          style={{ x: '-50%' }}
          initial={{ opacity: 0, y: -16, x: '-50%' }}
          animate={{ opacity: 1, y: 0, x: '-50%' }}
          exit={{ opacity: 0, y: -12, x: '-50%' }}
          transition={{ duration: 0.32, ease: EASE_SPRING }}
        >
          <span className="glass-content flex items-center gap-2">
            {toast.icon}
            <span className="t-caption whitespace-nowrap" style={{ color: 'var(--text)' }}>
              {toast.message}
            </span>
          </span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* — VerifiedBadge (§8.10): violet circle + white check. — */
export function VerifiedBadge({
  size = 16,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <span
      className={className}
      role="img"
      aria-label="Photo verified"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: size,
        height: size,
        borderRadius: '50%',
        background: 'var(--violet)',
        flexShrink: 0,
      }}
    >
      <Check size={size * 0.62} strokeWidth={3} color="#fff" aria-hidden="true" />
    </span>
  );
}

/* — ParticleRing (§7.2): ≤8 particles radiating 28px, transform/opacity
     only; white on the always-dark verification module. — */
export function ParticleRing({
  trigger,
  count = 8,
  radius = 28,
  color = '#fff',
}: {
  /** increment to fire a burst */
  trigger: number;
  count?: number;
  radius?: number;
  color?: string;
}) {
  const reduced = useReducedMotion();
  if (reduced || trigger === 0) return null;
  return (
    <span className="pointer-events-none absolute inset-0" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => {
        const angle = (i / count) * Math.PI * 2;
        return (
          <motion.span
            key={`${trigger}-${i}`}
            className="absolute top-1/2 left-1/2 h-1.5 w-1.5 rounded-full"
            style={{ background: color }}
            initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
            animate={{
              x: Math.cos(angle) * radius,
              y: Math.sin(angle) * radius,
              opacity: 0,
              scale: 0.4,
            }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
          />
        );
      })}
    </span>
  );
}
