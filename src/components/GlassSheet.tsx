import type { ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';

/**
 * GlassSheet — design.md §8.3
 * Glass surface pinned to screen bottom, radius 24px top corners, drag handle
 * (36×4px --text at 0.4 pill), scrim --scrim behind (opacity 0→1, 200ms).
 * Sheet slides up 24px + fade, 320ms spring. Sheets are always edge:none.
 */
export default function GlassSheet({
  open,
  onClose,
  children,
  className,
  labelledBy,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  labelledBy?: string;
}) {
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="scrim"
            className="fixed inset-0 z-40"
            style={{ background: 'var(--scrim)' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            aria-hidden="true"
          />
          <motion.div
            key="sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby={labelledBy}
            className={cn(
              'glass fixed inset-x-0 bottom-0 z-50 mx-auto w-full max-w-[430px] rounded-b-none',
              className,
            )}
            style={{ borderRadius: '24px 24px 0 0' }}
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 24 }}
            transition={{ duration: 0.32, ease: [0.34, 1.56, 0.64, 1] }}
          >
            <div className="glass-content">
              <div className="flex justify-center pt-3 pb-1">
                <div
                  className="h-1 w-9 rounded-full"
                  style={{ background: 'var(--text)', opacity: 0.4 }}
                  aria-hidden="true"
                />
              </div>
              {children}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
