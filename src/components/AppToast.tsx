import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

export type ToastPayload = {
  id: number;
  message: string;
  icon?: ReactNode;
};

/**
 * AppToast — design.md §8.13
 * Glass pill top-center, slides down 320ms, auto-dismiss 2.8s,
 * icon + t-caption in var(--text).
 */
export default function AppToast({
  toast,
  onDismiss,
}: {
  toast: ToastPayload | null;
  onDismiss: () => void;
}) {
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(onDismiss, 2800);
    return () => clearTimeout(t);
  }, [toast, onDismiss]);

  return (
    <AnimatePresence>
      {toast && (
        <motion.div
          key={toast.id}
          role="status"
          className="glass fixed left-1/2 top-4 z-[70] flex h-11 max-w-[86vw] items-center gap-2 rounded-full px-4"
          style={{ x: '-50%' }}
          initial={{ opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12 }}
          transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
        >
          <span className="glass-content flex items-center gap-2">
            {toast.icon}
            <span
              className="t-caption truncate"
              style={{ color: 'var(--text)' }}
            >
              {toast.message}
            </span>
          </span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
