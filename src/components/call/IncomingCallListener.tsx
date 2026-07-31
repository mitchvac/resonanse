import { useState } from 'react';
import { useNavigate } from 'react-router';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { PhoneOff, Video } from 'lucide-react';
import { trpc } from '@/providers/trpc';
import { useAuth } from '@/hooks/useAuth';

/**
 * IncomingCallListener — mounted once from Layout (inside the phone shell),
 * polls `videoCall.incoming` every 3s so a ringing video check finds the
 * user anywhere in the app. Full always-dark takeover: caller photo/name,
 * Accept (violet) / Decline (ghost). Accept → `videoCall.accept` → navigate
 * to the chat as callee (`?call=<sessionId>`). Expired rings dismiss quietly.
 */

const EASE_SPRING = [0.34, 1.56, 0.64, 1] as [number, number, number, number];

export default function IncomingCallListener() {
  const navigate = useNavigate();
  const reduced = useReducedMotion();
  const { isAuthenticated } = useAuth();
  const [busy, setBusy] = useState(false);
  const [declinedIds, setDeclinedIds] = useState<ReadonlySet<number>>(new Set());

  const incoming = trpc.videoCall.incoming.useQuery(undefined, {
    refetchInterval: 3000,
    enabled: isAuthenticated,
    retry: false,
    refetchOnWindowFocus: false,
  });

  const acceptMut = trpc.videoCall.accept.useMutation();
  const declineMut = trpc.videoCall.decline.useMutation();

  const call = incoming.data?.calls.find((c) => !declinedIds.has(c.sessionId)) ?? null;

  const dismiss = (sessionId: number) => {
    setDeclinedIds((ids) => new Set(ids).add(sessionId));
    setBusy(false);
  };

  const accept = async () => {
    if (!call || busy) return;
    setBusy(true);
    try {
      await acceptMut.mutateAsync({ sessionId: call.sessionId });
      navigate(`/chat/${call.conversationId}?call=${call.sessionId}`);
      dismiss(call.sessionId);
    } catch {
      /* ring already expired/cancelled — dismiss quietly */
      dismiss(call.sessionId);
    }
  };

  const decline = () => {
    if (!call || busy) return;
    setBusy(true);
    declineMut.mutate(
      { sessionId: call.sessionId },
      { onSettled: () => dismiss(call.sessionId) },
    );
  };

  const name = call?.fromProfile?.displayName?.split(' ')[0] ?? 'Your match';
  const photo = call?.fromProfile?.photo ?? '/avatar-01.jpg';

  return (
    <AnimatePresence>
      {call && (
        <motion.div
          key={call.sessionId}
          className="absolute inset-0 z-[90] flex flex-col items-center justify-center gap-6 px-8"
          style={{ background: 'rgba(5,7,13,0.94)' }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.24 }}
          role="alertdialog"
          aria-modal="true"
          aria-label={`Incoming video check from ${name}`}
        >
          <div className="relative">
            {!reduced && (
              <span className="pointer-events-none absolute inset-0" aria-hidden="true">
                {[0, 1].map((i) => (
                  <motion.span
                    key={i}
                    className="absolute inset-0 rounded-full border-2 border-white/40"
                    initial={{ scale: 1, opacity: 0.7 }}
                    animate={{ scale: 1.7, opacity: 0 }}
                    transition={{ duration: 1.8, repeat: Infinity, delay: i * 0.9, ease: 'easeOut' }}
                  />
                ))}
              </span>
            )}
            <motion.img
              src={photo}
              alt={name}
              className="h-28 w-28 rounded-full object-cover ring-2 ring-white/40"
              initial={reduced ? false : { scale: 0.85, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.42, ease: EASE_SPRING }}
            />
          </div>

          <div className="flex flex-col items-center gap-1.5 text-center">
            <p className="t-title text-white">{name}</p>
            <p className="t-body max-w-[280px] text-white/75">
              Video check — {name} wants to verify you&rsquo;re real
            </p>
          </div>

          <div className="flex items-center gap-8">
            <div className="flex flex-col items-center gap-1.5">
              <button
                type="button"
                onClick={decline}
                disabled={busy}
                className="flex h-14 w-14 min-h-[44px] min-w-[44px] items-center justify-center rounded-full text-white ring-1 ring-white/40 transition-opacity duration-fast active:opacity-70 disabled:opacity-50"
                aria-label="Decline video check"
              >
                <PhoneOff size={21} aria-hidden="true" />
              </button>
              <span className="t-caption text-white/70">Decline</span>
            </div>
            <div className="flex flex-col items-center gap-1.5">
              <motion.button
                type="button"
                onClick={() => void accept()}
                disabled={busy}
                className="flex h-16 w-16 min-h-[44px] min-w-[44px] items-center justify-center rounded-full text-white disabled:opacity-50"
                style={{ background: 'var(--violet)', boxShadow: 'var(--violet-glow)' }}
                whileTap={{ scale: 0.94 }}
                aria-label="Accept video check"
              >
                <Video size={24} aria-hidden="true" />
              </motion.button>
              <span className="t-caption text-white/70">Accept</span>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
