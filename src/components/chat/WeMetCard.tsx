import { useState } from 'react';
import { motion } from 'framer-motion';
import { Check } from 'lucide-react';
import { trpc } from '@/providers/trpc';
import { firstNameOf } from '@/components/chat/types';

const OPTIONS = [
  { key: 'great', label: 'Great', rating: 5 },
  { key: 'okay', label: 'Okay', rating: 3 },
  { key: 'not-fit', label: 'Not a fit', rating: 1 },
] as const;

/**
 * WeMetCard — chat.md §6 (24h post-date, glass card in-thread).
 * "How was {day}?" — three calm options + optional private note
 * ("This never reaches {name}"). Selection → violet ring draw + check
 * spring, then the matches-list chip upgrades to "We Met ✓"
 * (via trpc.matches.weMet).
 */
export default function WeMetCard({
  matchId,
  peerName,
  dateLabel,
  onDone,
  onToast,
}: {
  matchId: number;
  peerName?: string | null;
  dateLabel?: string;
  onDone: () => void;
  onToast: (text: string) => void;
}) {
  const [selected, setSelected] = useState<(typeof OPTIONS)[number]['key'] | null>(null);
  const [note, setNote] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const weMet = trpc.matches.weMet.useMutation();

  const submit = () => {
    if (!selected || submitted) return;
    const opt = OPTIONS.find((o) => o.key === selected)!;
    setSubmitted(true);
    weMet.mutate(
      {
        matchId,
        outcome: 'dated',
        rating: opt.rating,
        note: note.trim() || undefined,
      },
      {
        onSettled: () => {
          onToast('Thanks — your queue just got smarter.');
          onDone();
        },
      },
    );
  };

  if (submitted) {
    return (
      <motion.div
        className="mx-auto flex w-[85%] max-w-[320px] items-center justify-center gap-2 rounded-[24px] px-5 py-4"
        style={{
          background: 'var(--glass-a)',
          border: 'var(--glass-quiet-border)',
          boxShadow: 'var(--glass-hi), var(--glass-lo)',
          color: 'var(--text)',
        }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
      >
        <span
          className="flex h-5 w-5 items-center justify-center rounded-full"
          style={{ background: 'var(--ok)' }}
        >
          <Check size={12} color="#fff" aria-hidden="true" />
        </span>
        <span className="t-caption font-bold" style={{ color: 'var(--ok)' }}>
          We Met ✓
        </span>
      </motion.div>
    );
  }

  return (
    <motion.div
      className="mx-auto w-[92%] max-w-[340px] rounded-[24px] px-5 py-5"
      style={{
        background: 'var(--glass-a)',
        border: 'var(--glass-quiet-border)',
        boxShadow: 'var(--glass-hi), var(--glass-lo), var(--glass-shadow)',
        color: 'var(--text)',
      }}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
    >
      <p className="t-eyebrow">WE MET</p>
      <h3 className="t-title-sm mt-1.5">How was {dateLabel ?? 'the date'}?</h3>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {OPTIONS.map((opt, i) => {
          const active = selected === opt.key;
          return (
            <motion.button
              key={opt.key}
              type="button"
              onClick={() => setSelected(opt.key)}
              className="t-button relative flex min-h-[44px] items-center justify-center gap-1 rounded-full px-2"
              style={{
                background: 'var(--field)',
                color: 'var(--text)',
                boxShadow: active ? 'inset 0 0 0 1.5px var(--violet)' : 'none',
              }}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.06 * i, duration: 0.24, ease: [0.34, 1.56, 0.64, 1] }}
              aria-pressed={active}
            >
              {active && (
                <motion.span
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ duration: 0.24, ease: [0.34, 1.56, 0.64, 1] }}
                  className="flex"
                >
                  <Check size={13} style={{ color: 'var(--violet)' }} aria-hidden="true" />
                </motion.span>
              )}
              {opt.label}
            </motion.button>
          );
        })}
      </div>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={2}
        placeholder={`Private note — this never reaches ${firstNameOf(peerName)}.`}
        className="t-body mt-3 w-full resize-none rounded-2xl px-3.5 py-2.5 outline-none focus:ring-1 focus:ring-[var(--violet)]"
        style={{ background: 'var(--field)', color: 'var(--text)' }}
        aria-label="Private note about the date"
      />
      <button
        type="button"
        onClick={submit}
        disabled={!selected || weMet.isPending}
        className="t-button mt-3 h-11 min-h-[44px] w-full rounded-full text-white disabled:opacity-50"
        style={{ background: 'var(--violet)', boxShadow: 'var(--violet-glow)' }}
      >
        {weMet.isPending ? 'Sending…' : 'Share feedback'}
      </button>
    </motion.div>
  );
}
