import { memo, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { AlertTriangle, Mic, MicOff, PhoneOff, Video, VideoOff } from 'lucide-react';
import { useVideoCall } from '@/components/call/useVideoCall';
import type { CallEndReason, CallRole } from '@/components/call/useVideoCall';
import { cn } from '@/lib/utils';

/** Pill button for always-dark camera/video surfaces (theme-independent). */
export function DarkSurfaceBtn({
  children,
  onClick,
  disabled,
  className,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        't-button inline-flex h-[52px] min-h-[44px] items-center justify-center gap-2 rounded-full px-7 text-white ring-1 ring-white/30 transition-opacity duration-fast active:opacity-75 disabled:opacity-50',
        className,
      )}
      style={{ background: 'rgba(255,255,255,0.10)' }}
    >
      {children}
    </button>
  );
}

/**
 * CallOverlay — always-dark full-screen takeover inside the phone shell
 * (video surfaces are opaque dark, never blurred — blur budget §7.2).
 * Remote video full-bleed, draggable local PiP, peer name + "Connecting…" /
 * elapsed timer once active, end (danger) + mic/camera toggles. Ringing
 * state for the caller with pulsing rings + cancel.
 */

const EASE_SPRING = [0.34, 1.56, 0.64, 1] as [number, number, number, number];

function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/* Elapsed timer — isolated so the 1s tick never re-renders the overlay. */
const ElapsedTimer = memo(function ElapsedTimer({ since }: { since: number }) {
  const [now, setNow] = useState(since);
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);
  return <>{formatElapsed(now - since)}</>;
});

/* Pulsing rings behind the peer avatar while the call rings out. */
const RingPulse = memo(function RingPulse() {
  const reduced = useReducedMotion();
  if (reduced) return null;
  return (
    <span className="pointer-events-none absolute inset-0" aria-hidden="true">
      {[0, 1].map((i) => (
        <motion.span
          key={i}
          className="absolute inset-0 rounded-full border-2 border-white/50"
          initial={{ scale: 1, opacity: 0.8 }}
          animate={{ scale: 1.9, opacity: 0 }}
          transition={{ duration: 1.8, repeat: Infinity, delay: i * 0.9, ease: 'easeOut' }}
        />
      ))}
    </span>
  );
});

function StreamVideo({
  stream,
  muted,
  mirrored,
  className,
}: {
  stream: MediaStream | null;
  muted?: boolean;
  mirrored?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el && el.srcObject !== stream) el.srcObject = stream;
  }, [stream]);
  return (
    <video
      ref={ref}
      autoPlay
      playsInline
      muted={muted}
      className={cn(className, mirrored && '-scale-x-100')}
    />
  );
}

export default function CallOverlay({
  sessionId,
  role,
  peerName,
  peerPhoto,
  onClose,
}: {
  sessionId: number;
  role: CallRole;
  peerName: string;
  peerPhoto: string;
  onClose: (reason: CallEndReason, videoVerified: boolean) => void;
}) {
  const reduced = useReducedMotion();
  const frameRef = useRef<HTMLDivElement>(null);
  const call = useVideoCall({ sessionId, role, onEnded: onClose });

  const statusLabel =
    call.phase === 'active' && call.activeSince !== null ? null : call.phase === 'ringing'
      ? `Ringing ${peerName}…`
      : 'Connecting…';

  return (
    <motion.div
      ref={frameRef}
      className="absolute inset-0 z-[80] flex flex-col overflow-hidden bg-[#07070D]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.24 }}
      role="dialog"
      aria-modal="true"
      aria-label={`Video call with ${peerName}`}
    >
      {/* Remote video — full bleed (NOT muted; local PiP is the muted one) */}
      <StreamVideo
        stream={call.remoteStream}
        className="absolute inset-0 h-full w-full object-cover"
      />
      {/* Dark stage behind the remote feed while it connects */}
      {!call.remoteStream && (
        <div className="absolute inset-0 flex items-center justify-center" aria-hidden="true">
          <div className="relative">
            <RingPulse />
            <img
              src={peerPhoto}
              alt=""
              className="h-24 w-24 rounded-full object-cover ring-2 ring-white/30"
            />
          </div>
        </div>
      )}
      {/* Readability gradient for chrome over video */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-28"
        style={{ background: 'linear-gradient(180deg, rgba(5,5,9,0.72) 0%, transparent 100%)' }}
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 h-40"
        style={{ background: 'linear-gradient(0deg, rgba(5,5,9,0.78) 0%, transparent 100%)' }}
        aria-hidden="true"
      />

      {/* Top status bar */}
      <div className="relative z-10 flex items-center gap-2.5 px-5 pt-5">
        <img src={peerPhoto} alt="" className="h-9 w-9 rounded-full object-cover ring-1 ring-white/40" />
        <div className="min-w-0 flex-1">
          <p className="t-value truncate font-bold text-white">{peerName}</p>
          <p className="t-caption text-white/70" role="status">
            {call.phase === 'active' && call.activeSince !== null ? (
              <ElapsedTimer since={call.activeSince} />
            ) : (
              statusLabel
            )}
          </p>
        </div>
        {call.phase === 'ringing' && (
          <span className="t-micro rounded-full px-2.5 py-1 text-white/80 ring-1 ring-white/30">
            VIDEO CHECK
          </span>
        )}
      </div>

      {/* Camera error — graceful inline state with retry */}
      <AnimatePresence>
        {call.error && (
          <motion.div
            className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 bg-[#07070D] px-8 text-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <AlertTriangle size={30} style={{ color: '#FFC95C' }} aria-hidden="true" />
            <p className="t-body text-white/85">{call.error}</p>
            <div className="flex items-center gap-3">
              <DarkSurfaceBtn onClick={call.retry} className="h-11 px-5">
                Retry
              </DarkSurfaceBtn>
              <DarkSurfaceBtn onClick={() => void call.hangUp()} className="h-11 px-5">
                Close
              </DarkSurfaceBtn>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Local PiP — draggable, muted to avoid echo, mirrored */}
      {call.localStream && !call.error && (
        <motion.div
          drag
          dragConstraints={frameRef}
          dragElastic={0.08}
          dragMomentum={false}
          className="absolute right-4 top-24 z-10 h-36 w-[108px] cursor-grab overflow-hidden rounded-2xl border border-white/25 active:cursor-grabbing"
          initial={reduced ? false : { opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.32, ease: EASE_SPRING }}
        >
          <StreamVideo
            stream={call.localStream}
            muted
            mirrored
            className="h-full w-full object-cover"
          />
          {!call.camOn && (
            <div className="absolute inset-0 flex items-center justify-center bg-[#0B0B12]">
              <VideoOff size={18} className="text-white/60" aria-label="Camera off" />
            </div>
          )}
        </motion.div>
      )}

      {/* Bottom controls */}
      <div className="relative z-10 mt-auto flex items-center justify-center gap-5 px-5 pb-9">
        <button
          type="button"
          onClick={call.toggleMic}
          className="flex h-12 w-12 min-h-[44px] min-w-[44px] items-center justify-center rounded-full text-white"
          style={{ background: call.micOn ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.34)' }}
          aria-label={call.micOn ? 'Mute microphone' : 'Unmute microphone'}
          aria-pressed={!call.micOn}
        >
          {call.micOn ? <Mic size={19} aria-hidden="true" /> : <MicOff size={19} aria-hidden="true" />}
        </button>
        <button
          type="button"
          onClick={() => void call.hangUp()}
          className="flex h-16 w-16 min-h-[44px] min-w-[44px] items-center justify-center rounded-full text-white transition-transform duration-fast active:scale-95"
          style={{ background: 'var(--danger)', boxShadow: '0 10px 28px rgba(194,52,14,0.45)' }}
          aria-label={call.phase === 'ringing' ? 'Cancel call' : 'End call'}
        >
          <PhoneOff size={24} aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={call.toggleCam}
          className="flex h-12 w-12 min-h-[44px] min-w-[44px] items-center justify-center rounded-full text-white"
          style={{ background: call.camOn ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.34)' }}
          aria-label={call.camOn ? 'Turn camera off' : 'Turn camera on'}
          aria-pressed={!call.camOn}
        >
          {call.camOn ? <Video size={19} aria-hidden="true" /> : <VideoOff size={19} aria-hidden="true" />}
        </button>
      </div>
    </motion.div>
  );
}
