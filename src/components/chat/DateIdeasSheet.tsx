import { useState } from 'react';
import { motion } from 'framer-motion';
import { MapPin } from 'lucide-react';
import GlassCard from '@/components/GlassCard';
import GlassSheet from '@/components/GlassSheet';
import { trpc } from '@/providers/trpc';
import { cn } from '@/lib/utils';

const TIME_CHIPS = ['Thu 7pm', 'Thu 8:30', 'Sat 11am'];

/**
 * DateIdeasSheet — chat.md §4
 * AI-generated plan cards grounded in both profiles. The FIRST plan card is
 * edge:amber/edge:hud — the sheet's hero glow surface (one per sheet per
 * §3.3 budget); remaining cards edge:none. Each card: title t-title-sm,
 * details, time chips, BtnPrimary small "Propose".
 */
export default function DateIdeasSheet({
  conversationId,
  open,
  onClose,
  onPropose,
}: {
  conversationId: number;
  open: boolean;
  onClose: () => void;
  onPropose: (input: {
    title: string;
    emoji?: string;
    description?: string;
    location?: string;
    time?: string;
  }) => void;
}) {
  const ideas = trpc.chat.dateIdeas.useQuery(
    { conversationId },
    { enabled: open, refetchOnWindowFocus: false },
  );
  const [pickedTime, setPickedTime] = useState<Record<number, string>>({});

  return (
    <GlassSheet open={open} onClose={onClose} labelledBy="date-ideas-title">
      <div className="max-h-[70dvh] overflow-y-auto px-5 pb-6 pt-1">
        <p className="t-eyebrow">Date ideas</p>
        <h2 id="date-ideas-title" className="t-title mt-1" style={{ color: 'var(--text)' }}>
          Pick a plan, propose it
        </h2>
        <div className="mt-4 flex flex-col gap-3">
          {ideas.isLoading &&
            [0, 1, 2].map((i) => (
              <div
                key={i}
                className="h-36 animate-pulse rounded-[24px]"
                style={{ background: 'var(--field)' }}
                aria-hidden="true"
              />
            ))}
          {(ideas.data?.ideas ?? []).map((idea, i) => {
            const time = pickedTime[i] ?? TIME_CHIPS[0];
            return (
              <motion.div
                key={`${idea.title}-${i}`}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.08 * i, duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
              >
                <GlassCard edge={i === 0 ? 'amber' : 'none'} className="px-5 py-4">
                  <div className="flex items-center gap-2">
                    <span className="text-[22px] leading-none" aria-hidden="true">
                      {idea.emoji}
                    </span>
                    <h3 className="t-title-sm">{idea.title}</h3>
                  </div>
                  <p className="t-body mt-2">{idea.description}</p>
                  <p
                    className="t-caption mt-2 flex items-center gap-1.5"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    <MapPin size={12} aria-hidden="true" />
                    {idea.location}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Pick a time">
                    {TIME_CHIPS.map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setPickedTime((p) => ({ ...p, [i]: t }))}
                        className={cn(
                          't-caption min-h-[44px] rounded-full px-3 py-1.5',
                          time === t && 'font-bold',
                        )}
                        style={{
                          background: 'var(--field)',
                          color: 'var(--text)',
                          boxShadow:
                            time === t ? 'inset 0 0 0 1.5px var(--violet)' : 'none',
                        }}
                        aria-pressed={time === t}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      onPropose({
                        title: idea.title,
                        emoji: idea.emoji,
                        description: idea.description,
                        location: idea.location,
                        time,
                      })
                    }
                    className="t-button mt-3 h-10 min-h-[44px] w-full rounded-full text-white"
                    style={{ background: 'var(--violet)', boxShadow: 'var(--violet-glow)' }}
                  >
                    Propose
                  </button>
                </GlassCard>
              </motion.div>
            );
          })}
        </div>
      </div>
    </GlassSheet>
  );
}
