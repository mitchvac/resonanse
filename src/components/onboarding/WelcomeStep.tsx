import { motion, useReducedMotion } from 'framer-motion';
import { BadgeCheck, HeartHandshake, Sparkle } from 'lucide-react';
import { BtnGhost, BtnPrimary } from '@/components/ui/buttons';
import { LOGIN_PATH } from '@/const';

/**
 * WelcomeStep — onboarding.md §0
 * Centered: brand mark (circles 2× source = 96px total, same 0.4 opacity +
 * overlap), t-heading "Dating that ends in dates.", secondary body copy,
 * three icon bullets, BtnPrimary "Create my profile" + BtnGhost
 * "I already have an account" (→ /login).
 * Animation: mark circles converge from ±28px spring 480ms; headline
 * word-stagger 60ms; bullets stagger 80ms; CTA rises 24px + fade delay 400ms.
 */

const EASE_SPRING = [0.34, 1.56, 0.64, 1] as [number, number, number, number];
const HEADLINE = 'Dating that ends in dates.';

const BULLETS = [
  { icon: BadgeCheck, label: 'Everyone is photo-verified' },
  { icon: HeartHandshake, label: 'Intent declared up front' },
  { icon: Sparkle, label: 'Signal over volume' },
];

function ConvergingMark() {
  const reduced = useReducedMotion();
  /* viewBox 96×64 — circles 2× source (r 31.74 → 63.48 diameter), overlap ratio kept */
  return (
    <svg width="96" height="64" viewBox="0 0 96 64" fill="none" aria-hidden="true">
      <motion.circle
        cy="32"
        r="31.74"
        fill="var(--brand-mark)"
        initial={reduced ? false : { cx: 31.74 - 28 }}
        animate={{ cx: 31.74 }}
        transition={{ duration: 0.48, ease: EASE_SPRING }}
      />
      <motion.circle
        cy="32"
        r="31.74"
        fill="var(--brand-mark)"
        initial={reduced ? false : { cx: 64.26 + 28 }}
        animate={{ cx: 64.26 }}
        transition={{ duration: 0.48, ease: EASE_SPRING }}
      />
    </svg>
  );
}

export default function WelcomeStep({
  isAuthenticated,
  authLoading,
  onCreate,
}: {
  isAuthenticated: boolean;
  authLoading: boolean;
  /** continue into the flow when authed */
  onCreate: () => void;
}) {
  const reduced = useReducedMotion();
  const words = HEADLINE.split(' ');
  return (
    <div className="flex h-full flex-col items-center justify-center px-8 text-center">
      <ConvergingMark />

      <h1 className="t-heading mt-8" style={{ color: 'var(--text-ink)' }}>
        {words.map((word, i) => (
          <motion.span
            key={i}
            className="inline-block"
            initial={reduced ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 + i * 0.06, duration: 0.38, ease: [0.22, 1, 0.36, 1] }}
          >
            {word}
            {i < words.length - 1 ? ' ' : ''}
          </motion.span>
        ))}
      </h1>

      <motion.p
        className="t-value mt-4 max-w-[300px]"
        style={{ color: 'var(--text-secondary)' }}
        initial={reduced ? false : { opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5, duration: 0.38, ease: [0.22, 1, 0.36, 1] }}
      >
        Resonance is a small, verified community built on honest intent. Two minutes of
        setup, then your first queue at noon.
      </motion.p>

      <ul className="mt-8 flex flex-col items-start gap-3">
        {BULLETS.map((bullet, i) => (
          <motion.li
            key={bullet.label}
            className="flex items-center gap-2.5"
            initial={reduced ? false : { opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.62 + i * 0.08, duration: 0.38, ease: [0.22, 1, 0.36, 1] }}
          >
            <bullet.icon size={18} strokeWidth={2} style={{ color: 'var(--violet)' }} aria-hidden="true" />
            <span className="t-caption" style={{ color: 'var(--text)' }}>
              {bullet.label}
            </span>
          </motion.li>
        ))}
      </ul>

      <motion.div
        className="mt-10 flex w-full flex-col items-center gap-3"
        initial={reduced ? false : { opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4, duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
      >
        {isAuthenticated && !authLoading ? (
          <BtnPrimary onClick={onCreate} className="w-full">
            Create my profile
          </BtnPrimary>
        ) : (
          <BtnPrimary to={LOGIN_PATH} className="w-full">
            Create my profile
          </BtnPrimary>
        )}
        <BtnGhost to={LOGIN_PATH}>I already have an account</BtnGhost>
      </motion.div>
    </div>
  );
}
