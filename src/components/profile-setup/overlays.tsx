import { motion } from 'framer-motion';
import { CircleAlert, X } from 'lucide-react';
import GlassCard from '@/components/GlassCard';
import GlassSheet from '@/components/GlassSheet';
import { BtnGhost, BtnPrimary } from '@/components/ui/buttons';
import { VerifiedBadge } from '@/components/flow/feedback';
import type { ProfileSetupDraft } from './draft';

/**
 * Profile-setup overlays:
 * - PreviewOverlay ("Preview" ghost): renders the draft as a QueueCard-style
 *   photo card + prompt stack (profile-create.md "States & edge cases").
 * - PublishOverlay: the publish sequence — profile cards fan out and stack
 *   (420ms), VerifiedBadge stamps, then routes onward (§6).
 * - MissingSheet: calm sheet listing what's missing when leaving with
 *   < minimums (no red alarms).
 */

const EASE_SPRING = [0.34, 1.56, 0.64, 1] as [number, number, number, number];

const GOAL_LABELS: Record<string, string> = {
  serious: 'Serious',
  casual: 'Casual',
  explore: 'Explore',
  enm: 'ENM / Poly',
  friendship: 'Friendship',
};

/* ————— Preview ————— */
export function PreviewOverlay({
  draft,
  name,
  age,
  verified,
  onClose,
}: {
  draft: ProfileSetupDraft;
  name: string;
  age: number | null;
  verified: boolean;
  onClose: () => void;
}) {
  const mainPhoto = draft.photos.find((s) => s.photo)?.photo ?? '/self-01.jpg';
  const chips = [
    draft.goal ? GOAL_LABELS[draft.goal] : null,
    draft.status || null,
    ...draft.lifestyle.slice(0, 2),
  ].filter((c): c is string => Boolean(c));
  const answeredPrompts = draft.prompts.filter((p) => p.answer.trim().length > 0);

  return (
    <motion.div
      className="absolute inset-0 z-40 flex flex-col overflow-y-auto no-scrollbar"
      style={{ background: 'var(--stage-base)' }}
      initial={{ opacity: 0, x: 48 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 48 }}
      transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
      role="dialog"
      aria-modal="true"
      aria-label="Profile preview"
    >
      <div className="sticky top-0 z-10 flex items-center justify-between px-5 pt-4 pb-2" style={{ background: 'linear-gradient(180deg, var(--stage-base) 60%, transparent)' }}>
        <span className="t-eyebrow">Preview</span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close preview"
          className="flex h-11 w-11 items-center justify-center rounded-full transition-opacity duration-fast active:opacity-70"
          style={{ color: 'var(--text)' }}
        >
          <X size={22} aria-hidden="true" />
        </button>
      </div>

      {/* QueueCard-style hero: full-bleed photo + glass info panel */}
      <div className="px-4 pb-10">
        <div className="relative overflow-hidden rounded-[28px]" style={{ aspectRatio: '4/5' }}>
          <img src={mainPhoto} alt="Your main profile photo" className="h-full w-full object-cover" />
          <div className="photo-scrim absolute inset-0" aria-hidden="true" />
          <div className="absolute inset-x-3 bottom-3">
            <GlassCard edge="none">
              <div className="px-5 py-4">
                <p className="t-title flex items-center gap-2" style={{ color: 'var(--text)' }}>
                  {name}
                  {age !== null && <>, {age}</>}
                  {verified && <VerifiedBadge size={16} />}
                </p>
                {chips.length > 0 && (
                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    {chips.map((chip) => (
                      <span
                        key={chip}
                        className="t-caption rounded-full px-3 py-1.5"
                        style={{ background: 'var(--field)', color: 'var(--text)' }}
                      >
                        {chip}
                      </span>
                    ))}
                  </div>
                )}
                {answeredPrompts[0] && (
                  <p className="t-value mt-3" style={{ color: 'var(--text)' }}>
                    {answeredPrompts[0].answer}
                  </p>
                )}
              </div>
            </GlassCard>
          </div>
        </div>

        {/* prompt stack */}
        <div className="mt-4 flex flex-col gap-3">
          {answeredPrompts.slice(1).map((prompt) => (
            <GlassCard key={prompt.question} edge="none">
              <div className="px-5 py-4">
                <p className="t-caption font-bold" style={{ color: 'var(--text)' }}>
                  {prompt.question}
                </p>
                <p className="t-value mt-1.5" style={{ color: 'var(--text)' }}>
                  {prompt.answer}
                </p>
              </div>
            </GlassCard>
          ))}
          {draft.voiceRecorded && (
            <GlassCard edge="none">
              <div className="px-5 py-4">
                <p className="t-caption font-bold" style={{ color: 'var(--text)' }}>
                  Voice note
                </p>
                <p className="t-caption mt-1.5" style={{ color: 'var(--text-secondary)' }}>
                  0:{String(draft.voiceSeconds).padStart(2, '0')} — tap to listen
                </p>
              </div>
            </GlassCard>
          )}
        </div>
      </div>
    </motion.div>
  );
}

/* ————— Publish sequence —————
   Honest states: 'saving' shows the fan-out while the mutations run; 'error'
   offers Retry / Continue anyway; 'demo' tells signed-out users their draft
   lives on this device. No fake timers — the parent drives the state. */
export function PublishOverlay({
  state,
  onRetry,
  onContinue,
}: {
  state: 'saving' | 'error' | 'demo';
  onRetry: () => void;
  onContinue: () => void;
}) {
  return (
    <motion.div
      className="absolute inset-0 z-50 flex flex-col items-center justify-center px-8"
      style={{ background: 'var(--scrim)' }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      role={state === 'saving' ? 'status' : 'alertdialog'}
      aria-label={
        state === 'saving'
          ? 'Publishing your profile'
          : state === 'error'
            ? 'Some answers could not be saved'
            : 'Demo mode'
      }
    >
      {state === 'saving' ? (
        <>
          {/* cards fan out, then stack (420ms) */}
          <div className="relative h-56 w-44">
            {[-1, 0, 1].map((slot) => (
              <motion.div
                key={slot}
                className="glass absolute inset-0 rounded-[20px]"
                initial={{ opacity: 0, x: slot * 48, rotate: slot * 9, y: Math.abs(slot) * 6 }}
                animate={{ opacity: 1, x: slot * 8, rotate: slot * 2.5, y: Math.abs(slot) * 4 }}
                transition={{ duration: 0.42, ease: EASE_SPRING, delay: slot === 0 ? 0 : 0.05 }}
              >
                <span className="glass-content flex h-full items-end p-4">
                  <span className="t-micro" style={{ color: 'var(--text)' }}>
                    {slot === 0 ? 'PHOTOS' : slot < 0 ? 'STARTERS' : 'INTENT'}
                  </span>
                </span>
              </motion.div>
            ))}
            {/* VerifiedBadge stamps */}
            <motion.span
              className="absolute -right-3 -top-3 z-10"
              initial={{ scale: 0, rotate: -18 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ delay: 0.55, duration: 0.4, ease: EASE_SPRING }}
            >
              <VerifiedBadge size={36} />
            </motion.span>
          </div>
          <motion.p
            className="t-caption mt-6"
            style={{ color: 'var(--text)' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4, duration: 0.3 }}
          >
            Publishing your profile…
          </motion.p>
        </>
      ) : (
        <GlassCard edge="none" className="w-full max-w-[320px] p-6">
          <div className="flex flex-col items-center text-center">
            {state === 'error' ? (
              <>
                <CircleAlert size={28} style={{ color: 'var(--danger)' }} aria-hidden="true" />
                <p className="t-title-sm mt-3" style={{ color: 'var(--text)' }}>
                  Some answers couldn't be saved
                </p>
                <p className="t-caption mt-1.5" style={{ color: 'var(--text-secondary)' }}>
                  Check your connection. Your draft is safe on this device either way.
                </p>
                <div className="mt-5 flex w-full flex-col gap-2">
                  <BtnPrimary onClick={onRetry} className="w-full">
                    Retry
                  </BtnPrimary>
                  <BtnGhost onClick={onContinue} className="w-full">
                    Continue anyway
                  </BtnGhost>
                </div>
              </>
            ) : (
              <>
                <p className="t-title-sm" style={{ color: 'var(--text)' }}>
                  You're in demo mode
                </p>
                <p className="t-caption mt-1.5" style={{ color: 'var(--text-secondary)' }}>
                  Sign in to publish for real — for now your profile draft is saved on this
                  device and you can keep exploring.
                </p>
                <div className="mt-5 flex w-full flex-col gap-2">
                  <BtnPrimary onClick={onContinue} className="w-full">
                    Continue
                  </BtnPrimary>
                </div>
              </>
            )}
          </div>
        </GlassCard>
      )}
    </motion.div>
  );
}

/* ————— Calm "what's missing" sheet ————— */
export function MissingSheet({
  open,
  missing,
  onClose,
}: {
  open: boolean;
  missing: string[];
  onClose: () => void;
}) {
  return (
    <GlassSheet open={open} onClose={onClose} labelledBy="missing-title">
      <div className="px-6 pb-8 pt-2">
        <h2 id="missing-title" className="t-title-sm" style={{ color: 'var(--text)' }}>
          Almost there.
        </h2>
        <p className="t-body mt-2" style={{ color: 'var(--text-secondary)' }}>
          A couple of things left before your profile can go live:
        </p>
        <ul className="mt-3 flex flex-col gap-2">
          {missing.map((item) => (
            <li
              key={item}
              className="t-body rounded-2xl px-4 py-3"
              style={{ background: 'var(--field)', color: 'var(--text)' }}
            >
              {item}
            </li>
          ))}
        </ul>
        <div className="mt-5 flex justify-center">
          <BtnGhost onClick={onClose}>Keep building</BtnGhost>
        </div>
      </div>
    </GlassSheet>
  );
}
