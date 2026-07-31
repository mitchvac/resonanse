import { motion, AnimatePresence } from 'framer-motion';
import { RefreshCw, Sparkles } from 'lucide-react';
import { trpc } from '@/providers/trpc';

/**
 * StartersTray — chat.md §3
 * Glass tray above the input: eyebrow "RESONANCE AI · GROUNDED IN {NAME}'S
 * PROFILE", three suggestion chips (full-width, left-aligned t-value).
 * Refresh icon cycles 3 more (crossfade 200ms). Tap → inserts into the
 * composer (edit before send — never auto-send). Sparkle icon marks AI origin.
 */
export default function StartersTray({
  conversationId,
  peerName,
  open,
  onPick,
}: {
  conversationId: number;
  peerName: string;
  open: boolean;
  onPick: (text: string) => void;
}) {
  const starters = trpc.chat.starters.useQuery(
    { conversationId },
    { enabled: open, refetchOnWindowFocus: false },
  );

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="glass mx-3 mb-2 rounded-[24px] px-4 py-3.5"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 16 }}
          transition={{ duration: 0.32, ease: [0.34, 1.56, 0.64, 1] }}
        >
          <div className="glass-content">
            <div className="flex items-center justify-between gap-2">
              <p className="t-eyebrow">Resonance AI · grounded in {peerName}'s profile</p>
              <button
                type="button"
                onClick={() => starters.refetch()}
                className="flex h-8 w-8 min-h-[44px] min-w-[44px] items-center justify-center rounded-full"
                style={{ color: 'var(--text-secondary)' }}
                aria-label="Cycle more starters"
              >
                <RefreshCw size={15} aria-hidden="true" />
              </button>
            </div>
            <div className="mt-2 flex flex-col gap-2">
              {(starters.data?.starters ?? []).map((s, i) => (
                <motion.button
                  key={`${s}-${i}`}
                  type="button"
                  onClick={() => onPick(s)}
                  className="t-value flex w-full items-start gap-2 rounded-2xl px-3.5 py-2.5 text-left"
                  style={{ background: 'var(--field)', color: 'var(--text)' }}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.07 * i, duration: 0.2 }}
                >
                  <Sparkles
                    size={14}
                    className="mt-0.5 shrink-0"
                    style={{ color: 'var(--violet)' }}
                    aria-label="AI suggestion"
                  />
                  {s}
                </motion.button>
              ))}
              {starters.isLoading &&
                [0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="h-10 w-full animate-pulse rounded-2xl"
                    style={{ background: 'var(--field)' }}
                    aria-hidden="true"
                  />
                ))}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
