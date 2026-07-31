import { motion, useReducedMotion } from 'framer-motion';
import BrandMark from '@/components/BrandMark';
import { BtnPrimary } from '@/components/ui/buttons';

/**
 * DoneStep — onboarding.md §5 (handoff to /profile-setup)
 * Minimal celebration: brand mark + ONE violet ring pulse (700ms, calm
 * principle — no confetti), t-heading "Let's build your profile.", body,
 * BtnPrimary "Build my profile".
 */
export default function DoneStep({ onContinue }: { onContinue: () => void }) {
  const reduced = useReducedMotion();
  return (
    <div className="flex h-full flex-col items-center justify-center px-8 text-center">
      <div className="relative">
        <BrandMark size={64} />
        {!reduced && (
          <motion.span
            className="pointer-events-none absolute left-1/2 top-1/2 rounded-full"
            style={{
              width: 88,
              height: 88,
              x: '-50%',
              y: '-50%',
              border: '1.5px solid var(--violet)',
            }}
            initial={{ scale: 0.7, opacity: 0.9 }}
            animate={{ scale: 1.25, opacity: 0 }}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
            aria-hidden="true"
          />
        )}
      </div>

      <motion.h1
        className="t-heading mt-9"
        style={{ color: 'var(--text-ink)' }}
        initial={reduced ? false : { opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25, duration: 0.38, ease: [0.22, 1, 0.36, 1] }}
      >
        Let&rsquo;s build your profile.
      </motion.h1>

      <motion.p
        className="t-value mt-4 max-w-[300px]"
        style={{ color: 'var(--text-secondary)' }}
        initial={reduced ? false : { opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.37, duration: 0.38, ease: [0.22, 1, 0.36, 1] }}
      >
        Photos, prompts, and your desires. This is the part that makes the queue good.
      </motion.p>

      <motion.div
        className="mt-10 w-full"
        initial={reduced ? false : { opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5, duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
      >
        <BtnPrimary onClick={onContinue} className="w-full">
          Build my profile
        </BtnPrimary>
      </motion.div>
    </div>
  );
}
