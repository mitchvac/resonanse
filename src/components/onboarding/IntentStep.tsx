import { useState } from 'react';
import { motion } from 'framer-motion';
import { Info } from 'lucide-react';
import GlassCard from '@/components/GlassCard';
import GlassSheet from '@/components/GlassSheet';
import { Block, EyebrowRow, FlowChip, FlowToggle, StaggerGroup } from '@/components/flow/controls';
import type { OnboardingDraft } from './draft';

/**
 * IntentStep — onboarding.md §2
 * Eyebrow "DESIRES & INTENT", t-heading "What are you here for?", 5 large
 * selectable glass cards (edge:none) with right radio ring, "Open to" multi
 * chips, visibility micro-toggle (default on). Cards stagger 70ms; selection
 * = violet ring draw (stroke-dash 300ms) + radio fill spring. Info icon →
 * GlassSheet intent explainer.
 */

const EASE_SPRING = [0.34, 1.56, 0.64, 1] as [number, number, number, number];

const INTENTS: { value: NonNullable<OnboardingDraft['intent']>; title: string; caption: string }[] = [
  { value: 'serious', title: 'Serious', caption: 'A relationship with a future' },
  { value: 'casual', title: 'Casual', caption: 'Intentional, honest, no strings' },
  { value: 'explore', title: 'Explore', caption: 'Figuring it out, openly' },
  { value: 'enm', title: 'ENM / Poly', caption: 'Ethical non-monogamy, solo or with partners' },
  { value: 'friendship', title: 'Friendship', caption: 'Platonic, community-minded' },
];

const OPEN_TO = ['Long-term', 'Short-term', 'New friends', 'Unsure'];

function RadioRing({ selected }: { selected: boolean }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      {/* idle ring */}
      <circle cx="12" cy="12" r="9" stroke="var(--text)" strokeOpacity="0.25" strokeWidth="1.5" />
      {/* violet ring draw on select (stroke-dash 300ms) */}
      {selected && (
        <motion.circle
          cx="12"
          cy="12"
          r="9"
          stroke="var(--violet)"
          strokeWidth="1.5"
          strokeLinecap="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          transform="rotate(-90 12 12)"
        />
      )}
      {/* radio fill spring */}
      {selected && (
        <motion.circle
          cx="12"
          cy="12"
          r="5"
          fill="var(--violet)"
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ duration: 0.24, ease: EASE_SPRING }}
          style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
        />
      )}
    </svg>
  );
}

export default function IntentStep({
  draft,
  update,
}: {
  draft: OnboardingDraft;
  update: (patch: Partial<OnboardingDraft>) => void;
}) {
  const [infoOpen, setInfoOpen] = useState(false);

  return (
    <div className="px-5 pt-6 pb-8">
      <Block>
        <EyebrowRow>Desires &amp; Intent</EyebrowRow>
        <h1 className="t-heading mt-2" style={{ color: 'var(--text-ink)' }}>
          What are you here for?
        </h1>
        <p className="t-body mt-2" style={{ color: 'var(--text-secondary)' }}>
          Shown on your profile. Matched on mutuality — you&rsquo;ll only queue with people
          whose intent aligns with yours.
        </p>
      </Block>

      <StaggerGroup step={0.07} delay={0.1} className="mt-6 flex flex-col gap-3">
        {INTENTS.map((intent) => {
          const selected = draft.intent === intent.value;
          return (
            <Block key={intent.value} y={20}>
              <GlassCard
                edge="none"
                className="cursor-pointer transition-transform duration-fast active:scale-[0.99]"
                onClick={() => update({ intent: intent.value })}
              >
                <div
                  className="flex items-center gap-4 px-5 py-4"
                  role="radio"
                  aria-checked={selected}
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      update({ intent: intent.value });
                    }
                  }}
                >
                  <div className="min-w-0 flex-1">
                    <p className="t-title-sm" style={{ color: 'var(--text)' }}>
                      {intent.title}
                    </p>
                    <p className="t-caption mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                      {intent.caption}
                    </p>
                  </div>
                  <RadioRing selected={selected} />
                </div>
              </GlassCard>
            </Block>
          );
        })}
      </StaggerGroup>

      <Block className="mt-7" y={20}>
        <StaggerGroup step={0} delay={0}>
          <FieldLabelLite>Open to</FieldLabelLite>
          <div className="mt-2.5 flex flex-wrap gap-2">
            {OPEN_TO.map((o) => (
              <FlowChip
                key={o}
                label={o}
                selected={draft.openTo.includes(o)}
                onToggle={() =>
                  update({
                    openTo: draft.openTo.includes(o)
                      ? draft.openTo.filter((v) => v !== o)
                      : [...draft.openTo, o],
                  })
                }
              />
            ))}
          </div>
        </StaggerGroup>
      </Block>

      <Block className="mt-6" y={20}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="t-body" style={{ color: 'var(--text)' }}>
              Show my intent on my profile
            </span>
            <button
              type="button"
              onClick={() => setInfoOpen(true)}
              aria-label="About intent visibility"
              className="flex h-8 w-8 items-center justify-center rounded-full transition-opacity duration-fast active:opacity-70"
              style={{ color: 'var(--text-secondary)' }}
            >
              <Info size={16} aria-hidden="true" />
            </button>
          </div>
          <FlowToggle
            on={draft.showIntent}
            onChange={(next) => update({ showIntent: next })}
            ariaLabel="Show my intent on my profile"
          />
        </div>
      </Block>

      {/* Intent explainer */}
      <GlassSheet open={infoOpen} onClose={() => setInfoOpen(false)} labelledBy="intent-info-title">
        <div className="px-6 pb-8 pt-2">
          <h2 id="intent-info-title" className="t-title-sm" style={{ color: 'var(--text)' }}>
            How intent works
          </h2>
          <p className="t-body mt-3" style={{ color: 'var(--text-secondary)' }}>
            Your intent sits at the top of your profile, so nobody has to guess. Resonance
            matches on mutuality: you only appear in queues where both intents align — a
            &ldquo;Serious&rdquo; never queues with a &ldquo;Casual&rdquo; unless both say
            they&rsquo;re open to it.
          </p>
          <p className="t-body mt-3" style={{ color: 'var(--text-secondary)' }}>
            Turn visibility off and your intent still guides matching — it just won&rsquo;t be
            printed on your card.
          </p>
        </div>
      </GlassSheet>
    </div>
  );
}

function FieldLabelLite({ children }: { children: string }) {
  return (
    <span className="t-body font-bold" style={{ color: 'var(--text)' }}>
      {children}
    </span>
  );
}
