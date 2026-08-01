import { useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { Check, X } from 'lucide-react';
import GlassCard from '@/components/GlassCard';
import { BtnGhost, BtnGlass } from '@/components/ui/buttons';
import { Block } from '@/components/flow/controls';
import type { ProfileSetupDraft } from './draft';

/**
 * ReflectionsStep — profile-create.md §6 (teaser → publish step)
 * Glass card: eyebrow "OPTIONAL · 3 MIN", t-title-sm, caption, BtnGlass
 * "Start Reflections" + BtnGhost "Maybe later". Starting opens a 10-question
 * stepping flow (statement + 5-point agree scale, dots progress) rendered as
 * a full-phone overlay.
 */

const STATEMENTS = [
  'I know what I\u2019m looking for right now.',
  'I recharge alone more than with people.',
  'I\u2019d rather plan a date than improvise one.',
  'Directness feels kinder than politeness.',
  'I want a partner who\u2019s curious about my world.',
  'Physical affection matters to me early on.',
  'One deep conversation beats five light ones.',
  'I talk about feelings easily.',
  'My weekends are for the people I love.',
  'I\u2019m ready to meet in real life, soon.',
];

const SCALE = ['Disagree', 'Slightly', 'Neutral', 'Mostly', 'Agree'];

const EASE_OUT = [0.22, 1, 0.36, 1] as [number, number, number, number];

export default function ReflectionsStep({
  draft,
  onStart,
}: {
  draft: ProfileSetupDraft;
  onStart: () => void;
}) {
  /* "Maybe later" dismisses the teaser card for this session */
  const [dismissed, setDismissed] = useState(false);

  return (
    <div className="px-5 pt-6 pb-8">
      <Block>
        <GlassCard edge="none">
          <div className="px-5 py-5">
            <p className="t-eyebrow">Optional · 3 min</p>
            <h1 className="t-title-sm mt-2" style={{ color: 'var(--text)' }}>
              Reflections make your queue sharper
            </h1>
            {dismissed && !draft.reflectionsDone ? (
              <p className="t-caption mt-1.5" style={{ color: 'var(--text-secondary)' }}>
                No pressure — Reflections live on your profile whenever you're ready.
              </p>
            ) : (
              <>
                <p className="t-caption mt-1.5" style={{ color: 'var(--text-secondary)' }}>
                  A short self-discovery questionnaire. Answers feed matching — never shown
                  publicly.
                </p>
                {draft.reflectionsDone ? (
                  <p
                    className="t-caption mt-4 flex items-center gap-2 font-bold"
                    style={{ color: 'var(--ok)' }}
                  >
                    <Check size={16} strokeWidth={2.5} aria-hidden="true" />
                    Reflections complete — your queue just got sharper.
                  </p>
                ) : (
                  <div className="mt-4 flex items-center gap-3">
                    <BtnGlass onClick={onStart} className="h-11 px-5">
                      Start Reflections
                    </BtnGlass>
                    <BtnGhost className="t-caption" onClick={() => setDismissed(true)}>
                      Maybe later
                    </BtnGhost>
                  </div>
                )}
              </>
            )}
          </div>
        </GlassCard>
      </Block>
    </div>
  );
}

/* — 10-question stepping flow overlay — */
export function ReflectionsFlow({
  onComplete,
  onClose,
}: {
  onComplete: (answers: number[]) => void;
  onClose: () => void;
}) {
  const reduced = useReducedMotion();
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<number[]>([]);

  /* answers are stored 1–5 (backend contract), SCALE indexes are 0–4 */
  const answer = (value: number) => {
    const next = [...answers, value + 1];
    if (index + 1 >= STATEMENTS.length) {
      onComplete(next);
      return;
    }
    setAnswers(next);
    setIndex(index + 1);
  };

  return (
    <motion.div
      className="absolute inset-0 z-50 flex flex-col"
      style={{ background: 'var(--stage-base)' }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      role="dialog"
      aria-modal="true"
      aria-label="Reflections questionnaire"
    >
      <div className="flex items-center justify-between px-5 pt-4">
        <span className="t-eyebrow">Reflections</span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close Reflections"
          className="flex h-11 w-11 items-center justify-center rounded-full transition-opacity duration-fast active:opacity-70"
          style={{ color: 'var(--text)' }}
        >
          <X size={22} aria-hidden="true" />
        </button>
      </div>

      {/* dots progress */}
      <div className="mt-2 flex justify-center gap-1.5 px-5" aria-hidden="true">
        {STATEMENTS.map((_, i) => (
          <span
            key={i}
            className="h-1.5 w-1.5 rounded-full transition-colors duration-fast"
            style={{
              background: i < index ? 'var(--violet)' : i === index ? 'var(--text)' : 'var(--field-focus)',
            }}
          />
        ))}
      </div>

      <div className="flex flex-1 flex-col justify-center px-8">
        <AnimatePresence mode="wait">
          <motion.div
            key={index}
            initial={reduced ? { opacity: 0 } : { opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, x: -40 }}
            transition={{ duration: 0.24, ease: EASE_OUT }}
            className="text-center"
          >
            <p className="t-micro" style={{ color: 'var(--text-secondary)' }}>
              {index + 1} OF {STATEMENTS.length}
            </p>
            <p className="t-title mt-3" style={{ color: 'var(--text-ink)' }}>
              {STATEMENTS[index]}
            </p>

            {/* 5-point agree scale */}
            <div className="mt-10 flex items-start justify-center gap-3" role="radiogroup" aria-label="How much do you agree?">
              {SCALE.map((label, value) => (
                <div key={label} className="flex w-12 flex-col items-center gap-2">
                  <button
                    type="button"
                    role="radio"
                    aria-checked={answers[index] === value + 1}
                    aria-label={label}
                    onClick={() => answer(value)}
                    className="h-11 w-11 rounded-full transition-transform duration-fast active:scale-90"
                    style={{
                      background: 'var(--field)',
                      border: '1.5px solid var(--field-focus)',
                    }}
                  />
                  <span className="t-micro" style={{ color: 'var(--text-secondary)' }}>
                    {label}
                  </span>
                </div>
              ))}
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
