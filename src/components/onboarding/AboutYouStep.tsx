import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import GlassSheet from '@/components/GlassSheet';
import { BtnGhost } from '@/components/ui/buttons';
import { Block, FieldLabel, FlowChip, FlowField, StaggerGroup } from '@/components/flow/controls';
import { ageFromBirthday, formatBirthday, type OnboardingDraft } from './draft';

/**
 * AboutYouStep — onboarding.md §1
 * Form directly on the stage (no glass container). Fields: First name,
 * Birthday (auto-format + "AGE IS SHOWN, BIRTHDAY IS PRIVATE" micro),
 * Gender identity (multi chips + Self-describe reveal), Pronouns, Show me.
 * 18+ gate: under-18 birthdate → GlassSheet "Resonance is for adults 18+."
 * Field groups stagger 60ms; selected chips pop; self-describe expands 240ms.
 */

const GENDERS = ['Woman', 'Man', 'Nonbinary', 'Two-spirit'];
const PRONOUNS = ['she/her', 'he/him', 'they/them'];
const SHOW_ME = ['Women', 'Men', 'Nonbinary people', 'Everyone'];

export default function AboutYouStep({
  draft,
  update,
}: {
  draft: OnboardingDraft;
  update: (patch: Partial<OnboardingDraft>) => void;
}) {
  const [ageGateOpen, setAgeGateOpen] = useState(false);
  const customGenderRef = useRef<HTMLInputElement>(null);
  const customPronounsRef = useRef<HTMLInputElement>(null);

  const selfDescribe = draft.gender.includes('Self-describe');
  const customPronouns = draft.pronouns === 'custom';

  /* Age gate (18–120) — checked when the birthday becomes complete */
  useEffect(() => {
    const age = ageFromBirthday(draft.birthday);
    if (age !== null && (age < 18 || age > 120)) setAgeGateOpen(true);
  }, [draft.birthday]);

  const gateAge = ageFromBirthday(draft.birthday);
  const gateTooOld = gateAge !== null && gateAge > 120;

  useEffect(() => {
    if (selfDescribe) customGenderRef.current?.focus();
  }, [selfDescribe]);

  useEffect(() => {
    if (customPronouns) customPronounsRef.current?.focus();
  }, [customPronouns]);

  const toggle = (list: string[], value: string, exclusive?: string) => {
    if (exclusive && value === exclusive) return list.includes(value) ? [] : [value];
    const next = list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
    return exclusive ? next.filter((v) => v !== exclusive) : next;
  };

  return (
    <div className="px-5 pt-6 pb-8">
      <StaggerGroup step={0.06} className="flex flex-col gap-7">
        <Block>
          <h1 className="t-heading" style={{ color: 'var(--text-ink)' }}>
            About you
          </h1>
        </Block>

        <Block className="flex flex-col gap-2">
          <FieldLabel>First name</FieldLabel>
          <FlowField
            value={draft.firstName}
            onChange={(e) => update({ firstName: e.target.value })}
            placeholder="What should people call you?"
            autoComplete="given-name"
            maxLength={40}
            aria-label="First name"
          />
        </Block>

        <Block className="flex flex-col gap-2">
          <FieldLabel micro="AGE IS SHOWN, BIRTHDAY IS PRIVATE">Birthday</FieldLabel>
          <FlowField
            value={draft.birthday}
            onChange={(e) => update({ birthday: formatBirthday(e.target.value) })}
            placeholder="MM/DD/YYYY"
            inputMode="numeric"
            autoComplete="bday"
            aria-label="Birthday, month day year"
          />
        </Block>

        <Block className="flex flex-col gap-2.5">
          <FieldLabel>Gender identity</FieldLabel>
          <div className="flex flex-wrap gap-2">
            {GENDERS.map((g) => (
              <FlowChip
                key={g}
                label={g}
                selected={draft.gender.includes(g)}
                onToggle={() => update({ gender: toggle(draft.gender, g) })}
              />
            ))}
            <FlowChip
              label="Self-describe"
              selected={selfDescribe}
              onToggle={() =>
                update({
                  gender: selfDescribe
                    ? draft.gender.filter((g) => g !== 'Self-describe')
                    : [...draft.gender, 'Self-describe'],
                })
              }
            />
          </div>
          <AnimatePresence initial={false}>
            {selfDescribe && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
                className="overflow-hidden"
              >
                <FlowField
                  ref={customGenderRef}
                  value={draft.customGender}
                  onChange={(e) => update({ customGender: e.target.value })}
                  placeholder="Describe your gender"
                  maxLength={40}
                  aria-label="Describe your gender"
                />
              </motion.div>
            )}
          </AnimatePresence>
        </Block>

        <Block className="flex flex-col gap-2.5">
          <FieldLabel>Pronouns</FieldLabel>
          <div className="flex flex-wrap gap-2">
            {PRONOUNS.map((p) => (
              <FlowChip
                key={p}
                label={p}
                selected={draft.pronouns === p}
                onToggle={() => update({ pronouns: draft.pronouns === p ? '' : p })}
              />
            ))}
            <FlowChip
              label="custom"
              selected={customPronouns}
              onToggle={() => update({ pronouns: customPronouns ? '' : 'custom' })}
            />
          </div>
          <AnimatePresence initial={false}>
            {customPronouns && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
                className="overflow-hidden"
              >
                <FlowField
                  ref={customPronounsRef}
                  value={draft.customPronouns}
                  onChange={(e) => update({ customPronouns: e.target.value })}
                  placeholder="Your pronouns"
                  maxLength={40}
                  aria-label="Your pronouns"
                />
              </motion.div>
            )}
          </AnimatePresence>
        </Block>

        <Block className="flex flex-col gap-2.5">
          <FieldLabel>Show me</FieldLabel>
          <div className="flex flex-wrap gap-2">
            {SHOW_ME.map((s) => (
              <FlowChip
                key={s}
                label={s}
                selected={draft.showMe.includes(s)}
                onToggle={() => update({ showMe: toggle(draft.showMe, s, 'Everyone') })}
              />
            ))}
          </div>
        </Block>
      </StaggerGroup>

      {/* 18+ gate */}
      <GlassSheet
        open={ageGateOpen}
        onClose={() => {
          setAgeGateOpen(false);
          update({ birthday: '' });
        }}
        labelledBy="age-gate-title"
      >
        <div className="px-6 pb-8 pt-2 text-center">
          <h2 id="age-gate-title" className="t-title-sm" style={{ color: 'var(--text)' }}>
            {gateTooOld ? 'That birthday looks off.' : 'Resonance is for adults 18+.'}
          </h2>
          <p className="t-body mt-2" style={{ color: 'var(--text-secondary)' }}>
            {gateTooOld
              ? 'Double-check the year — it comes out to an age we can’t verify.'
              : 'Based on the birthday you entered, you’re not old enough to join yet.'}
          </p>
          <div className="mt-5 flex justify-center">
            <BtnGhost
              onClick={() => {
                setAgeGateOpen(false);
                update({ birthday: '' });
              }}
            >
              Go back
            </BtnGhost>
          </div>
        </div>
      </GlassSheet>
    </div>
  );
}
