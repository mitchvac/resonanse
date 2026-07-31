import { useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Plus, Search } from 'lucide-react';
import GlassCard from '@/components/GlassCard';
import GlassSheet from '@/components/GlassSheet';
import LightTrail from '@/components/LightTrail';
import { Block, StaggerGroup } from '@/components/flow/controls';
import type { ConstellationSlot, ProfileSetupDraft } from './draft';

/**
 * ConstellationStep — profile-create.md §5 (optional)
 * The builder's hero glow surface: glass card with edge:amber (Warm Glass) /
 * edge:hud (Night HUD). 5 avatar slots — confirmed links show the avatar,
 * pending links show it at 0.4 opacity with an "AWAITING CONFIRM" micro label
 * + pulsing --warn dot (1.6s). A .light-trail arc (2px gradient + 6px glowing
 * node dots at each avatar rim) connects you to confirmed partners, drawing
 * via stroke-dashoffset 600ms. Add → search-by-handle sheet.
 */

const CANDIDATES = [
  { handle: '@mara', name: 'Mara', photo: '/avatar-05.jpg' },
  { handle: '@jules', name: 'Jules', photo: '/avatar-08.jpg' },
];

const EASE_SPRING = [0.34, 1.56, 0.64, 1] as [number, number, number, number];

export default function ConstellationStep({
  draft,
  update,
}: {
  draft: ProfileSetupDraft;
  update: (patch: Partial<ProfileSetupDraft>) => void;
}) {
  const reduced = useReducedMotion();
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');

  const confirmed = draft.constellation.filter((s) => s.status === 'confirmed');

  const addPending = (candidate: (typeof CANDIDATES)[number]) => {
    const next: ConstellationSlot[] = [...draft.constellation];
    const idx = next.findIndex((s) => s.status === 'empty');
    if (idx === -1) return;
    next[idx] = { status: 'pending', photo: candidate.photo, handle: candidate.handle };
    update({ constellation: next });
    setSearchOpen(false);
    setQuery('');
  };

  const results = CANDIDATES.filter(
    (c) =>
      (query.trim() === '' ||
        c.handle.toLowerCase().includes(query.trim().toLowerCase()) ||
        c.name.toLowerCase().includes(query.trim().toLowerCase())) &&
      !draft.constellation.some((s) => s.status !== 'empty' && s.handle === c.handle),
  );

  return (
    <div className="px-5 pt-6 pb-8">
      <Block>
        <GlassCard edge="amber">
          <div className="px-5 py-5">
            <h1 className="t-title-sm" style={{ color: 'var(--text)' }}>
              Link your constellation
            </h1>
            <p className="t-caption mt-1.5" style={{ color: 'var(--text-secondary)' }}>
              Exploring with partners? Link up to 5 profiles so matches see your structure
              honestly. Every linked partner must confirm.
            </p>

            {/* avatar row: you + 5 slots; light-trail arc to confirmed partners */}
            <div className="relative mt-5">
              {confirmed.length > 0 && (
                <LightTrail
                  width={100}
                  height={96}
                  d="M 28 56 Q 62 90 96 56"
                  nodes={[
                    { x: 28, y: 56 },
                    { x: 96, y: 56 },
                  ]}
                  animate={!reduced}
                  style={{ left: 0, top: -10, zIndex: 0 }}
                />
              )}
              <StaggerGroup step={0.06} className="relative z-10 flex items-start gap-3">
                {/* you */}
                <Block y={10}>
                  <div className="flex w-14 flex-col items-center gap-1.5">
                    <img
                      src="/self-01.jpg"
                      alt="You"
                      className="h-14 w-14 rounded-full object-cover"
                      style={{ boxShadow: '0 0 0 2px var(--stage-base)' }}
                    />
                    <span className="t-micro" style={{ color: 'var(--text)' }}>
                      YOU
                    </span>
                  </div>
                </Block>

                {draft.constellation.map((slot, i) => (
                  <Block key={i} y={10}>
                    {slot.status === 'empty' ? (
                      <button
                        type="button"
                        onClick={() => setSearchOpen(true)}
                        aria-label="Add a partner by handle"
                        className="relative flex h-14 w-14 items-center justify-center rounded-full transition-opacity duration-fast active:opacity-70"
                      >
                        <span
                          className="absolute inset-0 rounded-full"
                          style={{ border: '1.5px dashed var(--text)', opacity: 0.25 }}
                          aria-hidden="true"
                        />
                        <Plus size={20} style={{ color: 'var(--text)', opacity: 0.5 }} aria-hidden="true" />
                      </button>
                    ) : (
                      <div className="flex w-14 flex-col items-center gap-1.5">
                        <img
                          src={slot.photo}
                          alt={`Linked partner ${slot.handle}`}
                          className="h-14 w-14 rounded-full object-cover"
                          style={{ opacity: slot.status === 'pending' ? 0.4 : 1 }}
                        />
                        {slot.status === 'pending' && (
                          <span
                            className="t-micro flex items-center gap-1"
                            style={{ color: 'var(--text)' }}
                          >
                            <motion.span
                              className="h-1.5 w-1.5 rounded-full"
                              style={{ background: 'var(--warn)' }}
                              animate={reduced ? undefined : { opacity: [0.4, 1, 0.4] }}
                              transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
                              aria-hidden="true"
                            />
                            AWAITING CONFIRM
                          </span>
                        )}
                      </div>
                    )}
                  </Block>
                ))}
              </StaggerGroup>
            </div>

            <p className="t-caption mt-4" style={{ color: 'var(--text-secondary)' }}>
              Optional — constellations are only shown when every partner confirms.
            </p>
          </div>
        </GlassCard>
      </Block>

      {/* search-by-handle sheet */}
      <GlassSheet open={searchOpen} onClose={() => setSearchOpen(false)} labelledBy="link-partner-title">
        <div className="px-5 pb-8 pt-2">
          <h2 id="link-partner-title" className="t-title-sm px-1" style={{ color: 'var(--text)' }}>
            Link a partner
          </h2>
          <div
            className="mt-3 flex items-center gap-2 rounded-2xl px-3.5"
            style={{ background: 'var(--field)' }}
          >
            <Search size={16} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} aria-hidden="true" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by handle"
              aria-label="Search by handle"
              className="t-value h-11 w-full bg-transparent outline-none"
              style={{ color: 'var(--text)' }}
            />
          </div>
          <div className="mt-3 flex flex-col gap-2">
            {results.length === 0 && (
              <p className="t-caption px-1 py-4 text-center" style={{ color: 'var(--text-secondary)' }}>
                No members found for that handle.
              </p>
            )}
            {results.map((c) => (
              <button
                key={c.handle}
                type="button"
                onClick={() => addPending(c)}
                className="flex min-h-[56px] items-center gap-3 rounded-2xl px-3.5 text-left transition-opacity duration-fast active:opacity-70"
                style={{ background: 'var(--field)' }}
              >
                <img src={c.photo} alt="" className="h-10 w-10 rounded-full object-cover" />
                <span>
                  <span className="t-button block" style={{ color: 'var(--text)' }}>
                    {c.name}
                  </span>
                  <span className="t-caption block" style={{ color: 'var(--text-secondary)' }}>
                    {c.handle} · asks to confirm
                  </span>
                </span>
              </button>
            ))}
          </div>
        </div>
      </GlassSheet>
    </div>
  );
}
