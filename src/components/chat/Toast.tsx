import type { ReactNode } from 'react';
import { useCallback, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export type ToastData = { id: number; icon?: ReactNode; text: string };

/**
 * Toast — design.md §8.13
 * Glass pill top-center, slides down 320ms, auto-dismiss 2.8s,
 * icon + t-caption in var(--text).
 */
export function Toast({ toast }: { toast: ToastData | null }) {
  return (
    <AnimatePresence>
      {toast && (
        <motion.div
          key={toast.id}
          className="pointer-events-none fixed left-1/2 top-4 z-[70]"
          style={{ x: '-50%' }}
          initial={{ opacity: 0, y: -24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -16 }}
          transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
          role="status"
        >
          <div className="glass rounded-full px-4 py-2.5">
            <span className="glass-content t-caption flex items-center gap-2 whitespace-nowrap">
              {toast.icon}
              {toast.text}
            </span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function useToast() {
  const [toast, setToast] = useState<ToastData | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = useCallback((text: string, icon?: ReactNode) => {
    if (timer.current) clearTimeout(timer.current);
    setToast({ id: Date.now(), text, icon });
    timer.current = setTimeout(() => setToast(null), 2800);
  }, []);
  return { toast, showToast };
}
