import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { useNavigate } from 'react-router';
import BrandMark from '@/components/BrandMark';
import { BtnGhost, BtnPrimary } from '@/components/ui/buttons';

/**
 * MatchMoment — design.md §7.2 / discover.md §4
 * Full-screen scrim + two photos converge from ±60px with 420ms spring;
 * brand-mark overlap flash at contact; single violet CTA "Send the first
 * message" + ghost "Keep browsing".
 */
export default function MatchMoment({
  open,
  theirPhoto,
  theirName,
  myPhoto = null,
  myName = '',
  matchId,
  onClose,
}: {
  open: boolean;
  /** Their first profile photo; null renders an initial disc (never a stock face). */
  theirPhoto: string | null;
  theirName: string;
  /** Caller's own first profile photo. Null when they have none — we render
      an initial disc instead. NEVER default this to a stock face: showing a
      stranger's photo as "you" reads as a fake profile (V83 bug report). */
  myPhoto?: string | null;
  myName?: string;
  matchId: number | null;
  onClose: () => void;
}) {
  const reduced = useReducedMotion();
  const navigate = useNavigate();
  const spring = reduced
    ? { duration: 0.2 }
    : { type: 'spring' as const, duration: 0.42, bounce: 0.25 };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[60] flex items-center justify-center"
          style={{ background: 'var(--scrim)' }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          role="dialog"
          aria-modal="true"
          aria-label="It's a match"
        >
          <div className="flex w-full max-w-[340px] flex-col items-center px-6 text-center">
            <div className="relative flex items-center justify-center">
              {myPhoto ? (
                <motion.img
                  src={myPhoto}
                  alt="Your photo"
                  className="h-24 w-24 rounded-full object-cover ring-4"
                  style={{ ['--tw-ring-color' as string]: 'rgba(255,255,255,0.8)' }}
                  initial={{ x: reduced ? 0 : -60, opacity: 0 }}
                  animate={{ x: -14, opacity: 1 }}
                  transition={spring}
                />
              ) : (
                <motion.div
                  aria-label="You"
                  className="flex h-24 w-24 items-center justify-center rounded-full ring-4"
                  style={{
                    ['--tw-ring-color' as string]: 'rgba(255,255,255,0.8)',
                    background: 'linear-gradient(135deg, var(--violet), var(--violet-deep, var(--violet)))',
                  }}
                  initial={{ x: reduced ? 0 : -60, opacity: 0 }}
                  animate={{ x: -14, opacity: 1 }}
                  transition={spring}
                >
                  <span className="t-heading text-white" aria-hidden="true">
                    {(myName.trim()[0] ?? '♥').toUpperCase()}
                  </span>
                </motion.div>
              )}
              {theirPhoto ? (
                <motion.img
                  src={theirPhoto}
                  alt={`Photo of ${theirName}`}
                  className="h-24 w-24 rounded-full object-cover ring-4"
                  style={{ ['--tw-ring-color' as string]: 'rgba(255,255,255,0.8)' }}
                  initial={{ x: reduced ? 0 : 60, opacity: 0 }}
                  animate={{ x: 14, opacity: 1 }}
                  transition={spring}
                />
              ) : (
                /* photo-less match: violet initial disc — NEVER a stock face */
                <motion.div
                  aria-label={theirName}
                  className="flex h-24 w-24 items-center justify-center rounded-full ring-4"
                  style={{
                    ['--tw-ring-color' as string]: 'rgba(255,255,255,0.8)',
                    background: 'linear-gradient(135deg, var(--violet), var(--violet-deep, var(--violet)))',
                  }}
                  initial={{ x: reduced ? 0 : 60, opacity: 0 }}
                  animate={{ x: 14, opacity: 1 }}
                  transition={spring}
                >
                  <span className="t-heading text-white" aria-hidden="true">
                    {(theirName.trim()[0] ?? '♥').toUpperCase()}
                  </span>
                </motion.div>
              )}
              {/* brand-mark overlap flash at contact */}
              <motion.div
                className="absolute"
                initial={{ opacity: 0, scale: reduced ? 1 : 0.6 }}
                animate={{ opacity: [0, 1, 1], scale: 1 }}
                transition={{ delay: reduced ? 0 : 0.3, duration: 0.4 }}
              >
                <BrandMark size={40} tone="onAccent" />
              </motion.div>
            </div>

            <motion.h2
              className="t-heading mt-6"
              style={{ color: 'var(--text-ink)' }}
              initial={{ opacity: 0, y: reduced ? 0 : 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: reduced ? 0 : 0.24, duration: 0.32 }}
            >
              It's a match
            </motion.h2>
            <motion.p
              className="t-body mt-1"
              style={{ color: 'var(--text-secondary)' }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: reduced ? 0 : 0.32, duration: 0.32 }}
            >
              You and {theirName} liked each other.
            </motion.p>

            <motion.div
              className="mt-8 flex w-full flex-col items-center gap-3"
              initial={{ opacity: 0, y: reduced ? 0 : 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: reduced ? 0 : 0.4, duration: 0.32 }}
            >
              <BtnPrimary
                className="w-full"
                onClick={() => (matchId ? navigate(`/chat/${matchId}`) : onClose())}
              >
                Send the first message
              </BtnPrimary>
              <BtnGhost onClick={onClose}>Keep browsing</BtnGhost>
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
