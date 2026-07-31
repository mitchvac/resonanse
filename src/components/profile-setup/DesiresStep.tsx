import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { EyeOff, HelpCircle } from 'lucide-react';
import GlassSheet from '@/components/GlassSheet';
import { Block, EyebrowRow, FlowChip, StaggerGroup } from '@/components/flow/controls';
import type { ProfileSetupDraft } from './draft';

/**
 * DesiresStep — profile-create.md §3 (Desires & Intent)
 * Grouped tag sections on stage: eyebrow micro label + chip cloud, info "?"
 * per group → GlassSheet (privacy clarity). RELATIONSHIP GOAL / STATUS /
 * FAMILY & FUTURE are single-select; LIFESTYLE / VALUES / DESIRES & KINK
 * multi. Desires & Kink sits behind a tap-to-reveal consent gate (eye-off
 * icon + caption), expanding 240ms with a single fade. Chip clouds stagger
 * 30ms per chip on section reveal.
 */

const GROUP_INFO: Record<string, { title: string; body: string }> = {
  goal: {
    title: 'Relationship goal',
    body: 'Shown at the top of your profile and used for mutual-intent matching — you only queue with people whose goal aligns with yours.',
  },
  status: {
    title: 'Relationship status',
    body: 'Shown on your profile. Honesty here is a community norm — partnered and ENM members are welcome, and matches see it up front.',
  },
  lifestyle: {
    title: 'Lifestyle',
    body: 'Shown as small tags on your profile. They help people picture a day with you — and they feed your queue ordering.',
  },
  values: {
    title: 'Values',
    body: 'Shown on your profile and weighted in compatibility. Pick the ones you actually live, not the aspirational ones.',
  },
  kink: {
    title: 'Desires & kink',
    body: 'Optional, and only ever shown to people who also opted in. It never appears in the general queue, and you can clear it anytime in Settings.',
  },
  family: {
    title: 'Family & future',
    body: 'Shown on your profile when set. It is one of the strongest alignment signals for long-term matching.',
  },
};

const GOALS: { label: string; value: NonNullable<ProfileSetupDraft['goal']> }[] = [
  { label: 'Serious', value: 'serious' },
  { label: 'Casual', value: 'casual' },
  { label: 'Explore', value: 'explore' },
  { label: 'ENM', value: 'enm' },
  { label: 'Friendship', value: 'friendship' },
];
const STATUSES = ['Single', 'Partnered', 'Married (open)', 'Complicated-but-honest'];
const LIFESTYLE = ['Sober-ish', '420-friendly', 'Gym rat', 'Homebody', 'Night owl', 'Plant parent', 'Pet person', 'Traveler'];
const VALUES = ['Kindness first', 'Ambition', 'Curiosity', 'Directness', 'Playfulness', 'Independence'];
const KINK = ['Slow burn', 'Kink-curious', 'Dom-leaning', 'Switch', 'Vanilla+', 'Rather discuss in person'];
const FAMILY = ['Want kids', "Don't want kids", 'Open', 'Have kids'];

function toggle(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

function GroupHeader({
  label,
  infoKey,
  onInfo,
}: {
  label: string;
  infoKey: string;
  onInfo: (key: string) => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <EyebrowRow>{label}</EyebrowRow>
      <button
        type="button"
        onClick={() => onInfo(infoKey)}
        aria-label={`About ${label.toLowerCase()}`}
        className="flex h-8 w-8 items-center justify-center rounded-full transition-opacity duration-fast active:opacity-70"
        style={{ color: 'var(--text-secondary)' }}
      >
        <HelpCircle size={15} aria-hidden="true" />
      </button>
    </div>
  );
}

export default function DesiresStep({
  draft,
  update,
}: {
  draft: ProfileSetupDraft;
  update: (patch: Partial<ProfileSetupDraft>) => void;
}) {
  const [info, setInfo] = useState<string | null>(null);

  return (
    <div className="px-5 pt-6 pb-8">
      <Block>
        <h1 className="t-heading" style={{ color: 'var(--text-ink)' }}>
          Desires &amp; Intent
        </h1>
        <p className="t-body mt-2" style={{ color: 'var(--text-secondary)' }}>
          Honest tags, shown on your profile. Matched on mutuality.
        </p>
      </Block>

      <StaggerGroup step={0.06} delay={0.06} className="mt-6 flex flex-col gap-7">
        {/* RELATIONSHIP GOAL (single) */}
        <Block>
          <GroupHeader label="Relationship goal" infoKey="goal" onInfo={setInfo} />
          <StaggerGroup step={0.03} className="mt-2.5 flex flex-wrap gap-2">
            {GOALS.map((g) => (
              <Block key={g.value} y={8}>
                <FlowChip
                  label={g.label}
                  selected={draft.goal === g.value}
                  onToggle={() => update({ goal: draft.goal === g.value ? '' : g.value })}
                />
              </Block>
            ))}
          </StaggerGroup>
        </Block>

        {/* RELATIONSHIP STATUS (single) */}
        <Block>
          <GroupHeader label="Relationship status" infoKey="status" onInfo={setInfo} />
          <StaggerGroup step={0.03} className="mt-2.5 flex flex-wrap gap-2">
            {STATUSES.map((s) => (
              <Block key={s} y={8}>
                <FlowChip
                  label={s}
                  selected={draft.status === s}
                  onToggle={() => update({ status: draft.status === s ? '' : s })}
                />
              </Block>
            ))}
          </StaggerGroup>
        </Block>

        {/* LIFESTYLE (multi) */}
        <Block>
          <GroupHeader label="Lifestyle" infoKey="lifestyle" onInfo={setInfo} />
          <StaggerGroup step={0.03} className="mt-2.5 flex flex-wrap gap-2">
            {LIFESTYLE.map((l) => (
              <Block key={l} y={8}>
                <FlowChip
                  label={l}
                  selected={draft.lifestyle.includes(l)}
                  onToggle={() => update({ lifestyle: toggle(draft.lifestyle, l) })}
                />
              </Block>
            ))}
          </StaggerGroup>
        </Block>

        {/* VALUES (multi) */}
        <Block>
          <GroupHeader label="Values" infoKey="values" onInfo={setInfo} />
          <StaggerGroup step={0.03} className="mt-2.5 flex flex-wrap gap-2">
            {VALUES.map((v) => (
              <Block key={v} y={8}>
                <FlowChip
                  label={v}
                  selected={draft.values.includes(v)}
                  onToggle={() => update({ values: toggle(draft.values, v) })}
                />
              </Block>
            ))}
          </StaggerGroup>
        </Block>

        {/* DESIRES & KINK — consent gate */}
        <Block>
          <GroupHeader label="Desires &amp; kink" infoKey="kink" onInfo={setInfo} />
          <AnimatePresence initial={false}>
            {!draft.kinkRevealed ? (
              <motion.button
                key="gate"
                type="button"
                onClick={() => update({ kinkRevealed: true })}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.24 }}
                className="mt-2.5 flex w-full items-center gap-3 rounded-2xl px-4 py-3.5 text-left transition-opacity duration-fast active:opacity-70"
                style={{ background: 'var(--field)' }}
                aria-expanded={false}
              >
                <EyeOff size={18} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} aria-hidden="true" />
                <span>
                  <span className="t-caption block" style={{ color: 'var(--text-secondary)' }}>
                    Optional. Shown only to people who opt in.
                  </span>
                  <span className="t-caption block font-bold" style={{ color: 'var(--text)' }}>
                    Tap to reveal
                  </span>
                </span>
              </motion.button>
            ) : (
              <motion.div
                key="revealed"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
                className="overflow-hidden"
              >
                <StaggerGroup step={0.03} className="mt-2.5 flex flex-wrap gap-2">
                  {KINK.map((k) => (
                    <Block key={k} y={8}>
                      <FlowChip
                        label={k}
                        selected={draft.kink.includes(k)}
                        onToggle={() => update({ kink: toggle(draft.kink, k) })}
                      />
                    </Block>
                  ))}
                </StaggerGroup>
              </motion.div>
            )}
          </AnimatePresence>
        </Block>

        {/* FAMILY & FUTURE (single) */}
        <Block>
          <GroupHeader label="Family &amp; future" infoKey="family" onInfo={setInfo} />
          <StaggerGroup step={0.03} className="mt-2.5 flex flex-wrap gap-2">
            {FAMILY.map((f) => (
              <Block key={f} y={8}>
                <FlowChip
                  label={f}
                  selected={draft.family === f}
                  onToggle={() => update({ family: draft.family === f ? '' : f })}
                />
              </Block>
            ))}
          </StaggerGroup>
        </Block>
      </StaggerGroup>

      {/* privacy explainer sheet */}
      <GlassSheet open={info !== null} onClose={() => setInfo(null)} labelledBy="group-info-title">
        {info && (
          <div className="px-6 pb-8 pt-2">
            <h2 id="group-info-title" className="t-title-sm" style={{ color: 'var(--text)' }}>
              {GROUP_INFO[info].title}
            </h2>
            <p className="t-body mt-3" style={{ color: 'var(--text-secondary)' }}>
              {GROUP_INFO[info].body}
            </p>
          </div>
        )}
      </GlassSheet>
    </div>
  );
}
