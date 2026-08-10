import { AnimatePresence, motion } from 'framer-motion';
import { Loader2, Mic, MicOff, PhoneOff } from 'lucide-react';
import { useGameVoice } from './useGameVoice';

/**
 * VoiceDock — the mic pill on a game table.
 *
 * States:
 * - bot table (matchId null): disabled, clearly says voice unlocks with a
 *   human at the table — bots NEVER get a voice (fake-profile rule).
 * - voice not configured server-side: hidden entirely.
 * - idle: "Enable voice" — tapping is the consent.
 * - requesting/connecting: spinner.
 * - waiting: in the room alone — "Waiting for them…"
 * - live: green mic + peer name + speaking pulse; mute toggle and hang up.
 * - error: honest message + retry.
 */
export default function VoiceDock({
  matchId,
  game,
}: {
  matchId: number | null;
  game: string;
}) {
  const { state, error, micOn, peers, configured, join, leave, toggleMic } =
    useGameVoice({ matchId, game });

  // bot table — voice never applies; say so plainly
  if (matchId === null) {
    return (
      <span
        className="t-micro flex items-center gap-1.5 rounded-full px-3 py-2"
        style={{ background: 'var(--field)', color: 'var(--text-secondary)' }}
        title="Voice unlocks when a person joins the table"
      >
        <MicOff size={13} aria-hidden="true" />
        Voice at live tables
      </span>
    );
  }

  // server has no LiveKit keys yet — stay out of the way
  if (!configured) return null;

  const peer = peers[0] ?? null;

  return (
    <div className="flex items-center gap-2">
      <AnimatePresence mode="wait" initial={false}>
        {state === 'idle' && (
          <motion.button
            key="idle"
            type="button"
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.92 }}
            transition={{ duration: 0.18 }}
            onClick={() => void join()}
            className="t-micro flex min-h-[36px] items-center gap-1.5 rounded-full px-3"
            style={{ background: 'var(--field)', color: 'var(--text)' }}
            aria-label="Enable voice for this table"
          >
            <Mic size={14} aria-hidden="true" /> Voice
          </motion.button>
        )}

        {(state === 'requesting' || state === 'connecting') && (
          <motion.span
            key="busy"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="t-micro flex items-center gap-1.5 rounded-full px-3 py-2"
            style={{ background: 'var(--field)', color: 'var(--text-secondary)' }}
            role="status"
          >
            <Loader2 size={13} className="animate-spin" aria-hidden="true" />
            {state === 'requesting' ? 'Mic…' : 'Joining…'}
          </motion.span>
        )}

        {state === 'waiting' && (
          <motion.span
            key="waiting"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="t-micro flex items-center gap-2 rounded-full px-3 py-2"
            style={{ background: 'var(--field)', color: 'var(--text)' }}
            role="status"
          >
            <Mic size={13} style={{ color: 'var(--violet)' }} aria-hidden="true" />
            Waiting for them…
            <button
              type="button"
              onClick={leave}
              className="flex min-h-[32px] min-w-[32px] items-center justify-center rounded-full"
              style={{ color: 'var(--text-secondary)' }}
              aria-label="Leave voice"
            >
              <PhoneOff size={13} aria-hidden="true" />
            </button>
          </motion.span>
        )}

        {state === 'live' && (
          <motion.span
            key="live"
            initial={{ opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.94 }}
            className="t-micro flex items-center gap-2 rounded-full px-3 py-2"
            style={{ background: 'var(--field)', color: 'var(--text)' }}
          >
            <button
              type="button"
              onClick={() => void toggleMic()}
              className="flex min-h-[32px] min-w-[32px] items-center justify-center rounded-full"
              style={{ color: micOn ? '#3d9a5f' : 'var(--text-secondary)' }}
              aria-label={micOn ? 'Mute your microphone' : 'Unmute your microphone'}
              aria-pressed={!micOn}
            >
              {micOn ? (
                <motion.span
                  animate={peer?.speaking ? { scale: [1, 1.18, 1] } : { scale: 1 }}
                  transition={
                    peer?.speaking
                      ? { repeat: Infinity, duration: 0.9, ease: 'easeInOut' }
                      : { duration: 0.15 }
                  }
                  className="flex"
                >
                  <Mic size={15} aria-hidden="true" />
                </motion.span>
              ) : (
                <MicOff size={15} aria-hidden="true" />
              )}
            </button>
            <span aria-live="polite">
              {peer
                ? peer.micMuted
                  ? `${peer.name} (muted)`
                  : peer.speaking
                    ? `${peer.name} is talking…`
                    : peer.name
                : 'Voice on'}
            </span>
            <button
              type="button"
              onClick={leave}
              className="flex min-h-[32px] min-w-[32px] items-center justify-center rounded-full"
              style={{ color: '#c0492f' }}
              aria-label="Hang up voice"
            >
              <PhoneOff size={14} aria-hidden="true" />
            </button>
          </motion.span>
        )}

        {state === 'error' && (
          <motion.button
            key="error"
            type="button"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => void join()}
            className="t-micro flex min-h-[36px] items-center gap-1.5 rounded-full px-3"
            style={{ background: 'var(--field)', color: '#c0492f' }}
            aria-label={error ? `${error} Tap to retry` : 'Voice failed — tap to retry'}
            title={error ?? undefined}
          >
            <MicOff size={13} aria-hidden="true" />
            {error ?? 'Voice failed'} · Retry
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}
