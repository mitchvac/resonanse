import { useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { Lock } from 'lucide-react';
import GlassSheet from '@/components/GlassSheet';
import Chip from '@/components/discover/Chip';
import { BtnGhost, BtnPrimary } from '@/components/ui/buttons';
import { cn } from '@/lib/utils';

/**
 * FilterSheet — discover.md §5
 * Full GlassSheet of grouped filters. Any group row can be long-pressed
 * (500ms, or via the keyboard "D" affordance) → becomes a dealbreaker
 * (ember micro label + row background pulse). Locked rows carry a LockChip
 * ("+") — tap opens the premium gate (GateCard popover handled by parent
 * via onLockedTap).
 * Footer: BtnGhost "Reset" + BtnPrimary "Show N people" (live count-flip).
 */

const INTENT_OPTIONS = ['Serious', 'Casual', 'Explore', 'Friendship', 'ENM'];
const RELTYPE_OPTIONS = ['Monogamous', 'Non-monogamous', 'Open to both'];
const FAMILY_OPTIONS = ['Want kids', 'Open', 'No kids', 'Have kids'];

type GroupKey = 'intent' | 'age' | 'distance' | 'relationship' | 'family' | 'verified';

function Toggle({
  on,
  onChange,
  label,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className="flex h-7 w-12 items-center rounded-full p-[3px] transition-colors duration-med"
      style={{ background: on ? 'var(--violet)' : 'var(--field-focus)' }}
    >
      <motion.span
        className="block h-[22px] w-[22px] rounded-full bg-white"
        animate={{ x: on ? 20 : 0 }}
        transition={{ type: 'spring', duration: 0.24, bounce: 0.2 }}
      />
    </button>
  );
}

function Group({
  title,
  dealbreaker,
  locked,
  onLongPressDealbreaker,
  onLockedTap,
  children,
  delay,
}: {
  title: string;
  dealbreaker?: boolean;
  locked?: boolean;
  onLongPressDealbreaker?: () => void;
  onLockedTap?: () => void;
  children: ReactNode;
  delay: number;
}) {
  const timer = useRef<number | null>(null);
  const [pulse, setPulse] = useState(false);

  const start = () => {
    if (!onLongPressDealbreaker || locked) return;
    timer.current = window.setTimeout(() => {
      onLongPressDealbreaker();
      setPulse(true);
      window.setTimeout(() => setPulse(false), 400);
    }, 500);
  };
  const cancel = () => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = null;
  };

  return (
    <motion.section
      className={cn(
        'rounded-[20px] p-4 transition-colors duration-med',
        pulse && 'bg-field-focus',
        dealbreaker && 'ring-1 ring-inset ring-[var(--ember)]',
      )}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
      onPointerDown={start}
      onPointerUp={cancel}
      onPointerLeave={cancel}
    >
      <div className="mb-2.5 flex items-center justify-between">
        <h4 className="t-eyebrow">{title}</h4>
        {locked ? (
          <button
            type="button"
            onClick={onLockedTap}
            className="t-micro flex items-center gap-1 rounded-full px-2 py-0.5"
            style={{ background: 'var(--field)', color: 'var(--text)' }}
            aria-label={`${title} — Resonance+ filter`}
          >
            <Lock size={10} aria-hidden="true" /> +
          </button>
        ) : (
          dealbreaker && (
            <motion.span
              className="t-micro font-bold"
              style={{ color: 'var(--ember-text)' }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.3 }}
            >
              DEALBREAKER
            </motion.span>
          )
        )}
      </div>
      <div className={cn(locked && 'pointer-events-none opacity-60')}>{children}</div>
      {dealbreaker && (
        <p className="t-caption mt-2" style={{ color: 'var(--text-secondary)' }}>
          Dealbreakers hide all non-matches from every mode.
        </p>
      )}
    </motion.section>
  );
}

export default function FilterSheet({
  open,
  onClose,
  onLockedTap,
}: {
  open: boolean;
  onClose: () => void;
  onLockedTap: () => void;
}) {
  const [intents, setIntents] = useState<string[]>([]);
  const [ageMin, setAgeMin] = useState(24);
  const [ageMax, setAgeMax] = useState(36);
  const [distance, setDistance] = useState(25);
  const [cityOnly, setCityOnly] = useState(false);
  const [relType, setRelType] = useState<string[]>([]);
  const [family, setFamily] = useState<string[]>([]);
  const [verifiedOnly, setVerifiedOnly] = useState(true);
  const [dealbreakers, setDealbreakers] = useState<Set<GroupKey>>(new Set());

  const toggleIn = (list: string[], set: (v: string[]) => void, v: string) =>
    set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  const toggleDealbreaker = (key: GroupKey) =>
    setDealbreakers((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const activeCount =
    intents.length +
    relType.length +
    family.length +
    (cityOnly ? 1 : 0) +
    (verifiedOnly ? 0 : 1) +
    dealbreakers.size;

  // deterministic demo count — "live" updates as filters change
  const peopleCount = useMemo(
    () => Math.max(2, 24 - activeCount * 3),
    [activeCount],
  );

  const reset = () => {
    setIntents([]);
    setAgeMin(24);
    setAgeMax(36);
    setDistance(25);
    setCityOnly(false);
    setRelType([]);
    setFamily([]);
    setVerifiedOnly(true);
    setDealbreakers(new Set());
  };

  const toggleGroup = (key: GroupKey, title: string, children: ReactNode, delay: number) => (
    <Group
      title={title}
      dealbreaker={dealbreakers.has(key)}
      onLongPressDealbreaker={() => toggleDealbreaker(key)}
      delay={delay}
    >
      {children}
      <button
        type="button"
        className="t-micro mt-2 underline"
        style={{ color: 'var(--text-secondary)' }}
        onClick={() => toggleDealbreaker(key)}
      >
        {dealbreakers.has(key) ? 'Remove dealbreaker' : 'Make dealbreaker'}
      </button>
    </Group>
  );

  return (
    <GlassSheet open={open} onClose={onClose} labelledBy="filters-title">
      <div className="max-h-[85dvh] overflow-y-auto px-5 pb-6">
        <div className="flex items-baseline justify-between">
          <h3 id="filters-title" className="t-title-sm" style={{ color: 'var(--text)' }}>
            Filters
          </h3>
          {activeCount > 0 && (
            <motion.span
              key={activeCount}
              className="t-caption rounded-full px-2 py-0.5 font-bold text-white"
              style={{ background: 'var(--violet)' }}
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', duration: 0.3, bounce: 0.4 }}
            >
              {activeCount}
            </motion.span>
          )}
        </div>

        <div className="mt-4 flex flex-col gap-3">
          {toggleGroup(
            'intent',
            'Intent',
            <div className="flex flex-wrap gap-1.5">
              {INTENT_OPTIONS.map((o) => (
                <Chip key={o} selected={intents.includes(o)} onClick={() => toggleIn(intents, setIntents, o)}>
                  {o}
                </Chip>
              ))}
            </div>,
            0,
          )}

          {toggleGroup(
            'age',
            'Age',
            <div>
              <p className="t-caption mb-2" style={{ color: 'var(--text)' }}>
                {ageMin} – {ageMax === 40 ? '40+' : ageMax}
              </p>
              <div className="flex flex-col gap-2">
                <input
                  type="range"
                  min={22}
                  max={40}
                  value={ageMin}
                  aria-label="Minimum age"
                  onChange={(e) => setAgeMin(Math.min(Number(e.target.value), ageMax))}
                  className="w-full accent-[#7B49F5]"
                />
                <input
                  type="range"
                  min={22}
                  max={40}
                  value={ageMax}
                  aria-label="Maximum age"
                  onChange={(e) => setAgeMax(Math.max(Number(e.target.value), ageMin))}
                  className="w-full accent-[#7B49F5]"
                />
              </div>
            </div>,
            0.04,
          )}

          {toggleGroup(
            'distance',
            'Distance',
            <div>
              <p className="t-caption mb-2" style={{ color: 'var(--text)' }}>
                Within {distance} km
              </p>
              <input
                type="range"
                min={1}
                max={100}
                value={distance}
                aria-label="Maximum distance"
                onChange={(e) => setDistance(Number(e.target.value))}
                className="w-full accent-[#7B49F5]"
              />
              <div className="mt-3 flex items-center justify-between">
                <span className="t-caption" style={{ color: 'var(--text)' }}>
                  This city only
                </span>
                <Toggle on={cityOnly} onChange={setCityOnly} label="This city only" />
              </div>
            </div>,
            0.08,
          )}

          {toggleGroup(
            'relationship',
            'Relationship type',
            <div className="flex flex-wrap gap-1.5">
              {RELTYPE_OPTIONS.map((o) => (
                <Chip key={o} selected={relType.includes(o)} onClick={() => toggleIn(relType, setRelType, o)}>
                  {o}
                </Chip>
              ))}
            </div>,
            0.12,
          )}

          {toggleGroup(
            'family',
            'Family plans',
            <div className="flex flex-wrap gap-1.5">
              {FAMILY_OPTIONS.map((o) => (
                <Chip key={o} selected={family.includes(o)} onClick={() => toggleIn(family, setFamily, o)}>
                  {o}
                </Chip>
              ))}
            </div>,
            0.16,
          )}

          {toggleGroup(
            'verified',
            'Verified only',
            <div className="flex items-center justify-between">
              <span className="t-caption" style={{ color: 'var(--text)' }}>
                Show verified profiles only
              </span>
              <Toggle on={verifiedOnly} onChange={setVerifiedOnly} label="Verified only" />
            </div>,
            0.2,
          )}

          {/* premium-locked advanced row */}
          <Group title="Politics" locked onLockedTap={onLockedTap} delay={0.24}>
            <div className="flex flex-wrap gap-1.5">
              {['Liberal', 'Moderate', 'Conservative', 'Apolitical'].map((o) => (
                <Chip key={o}>{o}</Chip>
              ))}
            </div>
          </Group>
        </div>

        <div className="mt-5 flex items-center justify-between gap-3">
          <BtnGhost onClick={reset}>Reset</BtnGhost>
          <BtnPrimary onClick={onClose}>
            <motion.span
              key={peopleCount}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.16 }}
            >
              Show {peopleCount} people
            </motion.span>
          </BtnPrimary>
        </div>
      </div>
    </GlassSheet>
  );
}
