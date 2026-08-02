import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { AlertTriangle, ArrowRight } from 'lucide-react';
import GlassSheet from '@/components/GlassSheet';
import IdVerifySheet from '@/components/verify/IdVerifySheet';
import { DarkSurfaceBtn } from '@/components/call/CallOverlay';
import { BtnGhost, BtnGlass } from '@/components/ui/buttons';
import { ParticleRing, VerifiedBadge } from '@/components/flow/feedback';
import { cameraErrorMessage } from '@/lib/cameraCheck';
import { cn } from '@/lib/utils';

/**
 * VerifyStep — onboarding.md §3 (mandatory photo verification gate)
 * Always-dark camera module (theme-independent). Rounded-rect frame (radius
 * 24px) with dashed face-oval guide + REAL getUserMedia selfie feed.
 * Wizard: 1 Selfie (3-2-1 countdown → real frame capture to canvas, white
 * flash, "captured" 1s — then the canvas is CLEARED; nothing is stored,
 * consistent with the ID-scan privacy model) → 2 Live check ("Turn your
 * head slowly →" arrow arc 2s loop + violet progress ring 0→100% over 2.4s)
 * → 3 Result. Camera blocked/unavailable → honest blocked copy + a
 * "Continue without photo verification" tertiary route to ID verification
 * (verified stays false — never stamped without a real captured frame).
 */

type Phase = 'selfie' | 'live' | 'success' | 'failure' | 'camera-error';

const EASE_SPRING = [0.34, 1.56, 0.64, 1] as [number, number, number, number];

export default function VerifyStep({
  onVerified,
}: {
  /** returns true when verification is accepted (backend or demo mode) */
  onVerified: () => Promise<boolean>;
}) {
  const reduced = useReducedMotion();
  const [phase, setPhase] = useState<Phase>('selfie');
  const [flash, setFlash] = useState(0);
  const [burst, setBurst] = useState(0);
  const [captured, setCaptured] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [whyOpen, setWhyOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [idOpen, setIdOpen] = useState(false);
  const [idDone, setIdDone] = useState(false);
  const [idDismissed, setIdDismissed] = useState(false);
  const finishing = useRef(false);

  const streamRef = useRef<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const capturedFrameRef = useRef(false);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  /* Live camera for the selfie + live-check phases */
  const cameraActive = phase === 'selfie' || phase === 'live';
  useEffect(() => {
    if (!cameraActive || streamRef.current) return;
    let cancelled = false;
    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('unsupported');
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user' },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
      } catch {
        if (!cancelled) setPhase('camera-error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [cameraActive, phase]);

  /* Re-attach when the video element (re)mounts across phases */
  useEffect(() => {
    if (cameraActive && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
    }
  }, [cameraActive, phase]);

  /* Release the camera once the wizard leaves the live phases, and on unmount */
  useEffect(() => {
    if (!cameraActive) stopStream();
  }, [cameraActive, stopStream]);
  useEffect(() => stopStream, [stopStream]);

  /* ---- countdown → real frame capture → 1s "captured" flash → discard ---- */
  const capture = () => {
    if (phase !== 'selfie' || countdown !== null || !streamRef.current) return;
    setCountdown(3);
  };

  useEffect(() => {
    if (countdown === null) return;
    if (countdown === 0) {
      /* grab the frame NOW — it never leaves this canvas and is cleared 1s
         after the "captured" flash; nothing is uploaded or persisted */
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || video.videoWidth === 0) {
        setCountdown(null);
        setPhase('camera-error');
        return;
      }
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext('2d')?.drawImage(video, 0, 0);
      capturedFrameRef.current = true;
      setFlash((f) => f + 1);
      setCaptured(true);
      setCountdown(null);
      window.setTimeout(() => {
        /* discard the frame — then advance to the live check */
        const ctx = canvas.getContext('2d');
        ctx?.clearRect(0, 0, canvas.width, canvas.height);
        canvas.width = 0;
        canvas.height = 0;
        setCaptured(false);
        setPhase('live');
      }, 1000);
      return;
    }
    const t = window.setTimeout(() => setCountdown((c) => (c === null ? null : c - 1)), 800);
    return () => window.clearTimeout(t);
  }, [countdown]);

  const finish = useCallback(async () => {
    if (finishing.current) return;
    /* never stamp verified without a real captured frame */
    if (!capturedFrameRef.current) {
      setPhase('failure');
      return;
    }
    finishing.current = true;
    const ok = await onVerified();
    setPhase(ok ? 'success' : 'failure');
    if (ok) setBurst((b) => b + 1);
    finishing.current = false;
  }, [onVerified]);

  /* Reduced motion: the ring sweep is replaced by a timed opacity bar */
  useEffect(() => {
    if (phase !== 'live' || !reduced) return;
    const t = window.setTimeout(() => void finish(), 2400);
    return () => window.clearTimeout(t);
  }, [phase, reduced, finish]);

  const retry = () => {
    capturedFrameRef.current = false;
    setPhase('selfie');
  };

  /* Camera blocked → honest route: verified stays false, offer the ID
     verification option on the Trust sheet instead. */
  const continueWithoutPhoto = () => {
    capturedFrameRef.current = false;
    setIdDismissed(false);
    setIdOpen(true);
  };

  return (
    <div className="flex h-full flex-col bg-[#07070D] px-5 pt-4 pb-5">
      {/* Camera frame */}
      <div className="flex flex-1 flex-col items-center justify-center">
        <motion.div
          initial={reduced ? false : { scale: 0.94, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.42, ease: EASE_SPRING }}
          className={cn(
            'relative w-full max-w-[min(280px,64%)]',
            phase === 'success' && 'glass glass-edge edge-energize',
          )}
          style={{ borderRadius: 24 }}
        >
          <div
            className="relative z-[1] aspect-[4/5] overflow-hidden"
            style={{
              borderRadius: 24,
              border:
                phase === 'success'
                  ? 'none'
                  : '2px solid rgba(255,255,255,0.22)',
            }}
          >
            {/* REAL selfie feed (mirrored) — no demo image. The captured
                frame flashes for 1s on a canvas overlay, then is discarded. */}
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className={cn(
                'h-full w-full -scale-x-100 object-cover',
                phase === 'camera-error' && 'hidden',
              )}
            />
            <canvas
              ref={canvasRef}
              className={cn(
                'pointer-events-none absolute inset-0 h-full w-full -scale-x-100 object-cover',
                !captured && 'hidden',
              )}
              aria-hidden="true"
            />
            {phase === 'camera-error' && (
              <span className="flex h-full w-full items-center justify-center bg-[#101018]">
                <AlertTriangle size={28} style={{ color: '#FFC95C' }} aria-hidden="true" />
              </span>
            )}
            {/* countdown overlay */}
            {countdown !== null && countdown > 0 && (
              <span className="absolute inset-0 flex items-center justify-center" aria-live="polite">
                <motion.span
                  key={countdown}
                  initial={{ scale: 0.6, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ duration: 0.24, ease: EASE_SPRING }}
                  className="t-heading text-5xl text-white"
                  style={{ textShadow: '0 2px 16px rgba(0,0,0,0.6)' }}
                >
                  {countdown}
                </motion.span>
              </span>
            )}
            {captured && (
              <span
                className="t-micro absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/55 px-3 py-1 text-white"
                role="status"
              >
                CAPTURED — DISCARDED AFTER THE CHECK
              </span>
            )}
            {/* face-oval guide: 2px white 0.5 dashed */}
            {phase !== 'success' && phase !== 'camera-error' && (
              <svg
                className="pointer-events-none absolute inset-0 h-full w-full"
                viewBox="0 0 100 125"
                fill="none"
                aria-hidden="true"
              >
                <ellipse
                  cx="50"
                  cy="52"
                  rx="26"
                  ry="34"
                  stroke="rgba(255,255,255,0.5)"
                  strokeWidth="1.5"
                  strokeDasharray="5 5"
                />
              </svg>
            )}
            {/* capture flash (120ms white) */}
            <AnimatePresence>
              {flash > 0 && captured && (
                <motion.div
                  key={flash}
                  className="absolute inset-0 bg-white"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: [0, 1, 0] }}
                  transition={{ duration: 0.24, times: [0, 0.5, 1] }}
                  aria-hidden="true"
                />
              )}
            </AnimatePresence>
          </div>

          {/* live-check progress ring around the frame (violet stroke-dash 0→100%, 2.4s) */}
          {phase === 'live' && !reduced && (
            <svg
              className="pointer-events-none absolute"
              style={{ left: -12, top: -12, width: 'calc(100% + 24px)', height: 'calc(100% + 24px)' }}
              viewBox="0 0 104 130"
              fill="none"
              aria-hidden="true"
            >
              <motion.rect
                x="1.5"
                y="1.5"
                width="101"
                height="127"
                rx="27"
                stroke="var(--violet)"
                strokeWidth="2.5"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 2.4, ease: 'linear' }}
                onAnimationComplete={() => void finish()}
              />
            </svg>
          )}

          {/* success particles */}
          <ParticleRing trigger={burst} color="#fff" radius={40} />
        </motion.div>

        {/* Reduced-motion linear opacity progress bar */}
        {phase === 'live' && reduced && (
          <div className="mt-4 flex w-full max-w-[280px] gap-1" aria-hidden="true">
            {Array.from({ length: 20 }, (_, i) => (
              <motion.span
                key={i}
                className="h-0.5 flex-1 rounded-full"
                style={{ background: 'var(--violet)' }}
                initial={{ opacity: 0.15 }}
                animate={{ opacity: 1 }}
                transition={{ delay: (i / 20) * 2.4, duration: 0.12 }}
              />
            ))}
          </div>
        )}

        {/* Phase copy + controls */}
        <div className="mt-6 flex min-h-[132px] w-full flex-col items-center text-center">
          <AnimatePresence mode="wait">
            {phase === 'selfie' && (
              <motion.div
                key="selfie"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="flex flex-col items-center"
              >
                <p className="t-body max-w-[280px] text-white/80">
                  Take a quick selfie. This is never shown on your profile — and never stored.
                </p>
                {/* capture: 72px white ring, violet inner disc */}
                <button
                  type="button"
                  onClick={capture}
                  disabled={countdown !== null}
                  aria-label="Capture selfie"
                  className="mt-5 flex h-[72px] w-[72px] items-center justify-center rounded-full border-[3px] border-white transition-transform duration-fast active:scale-95 disabled:opacity-50"
                >
                  <span className="h-[52px] w-[52px] rounded-full" style={{ background: 'var(--violet)' }} />
                </button>
              </motion.div>
            )}

            {phase === 'camera-error' && (
              <motion.div
                key="camera-error"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="flex flex-col items-center"
              >
                <p className="t-body max-w-[280px] text-white/80">{cameraErrorMessage()}</p>
                <div className="mt-4 flex items-center gap-3">
                  <BtnGlass onClick={retry} className="h-11 px-5 text-white">
                    Try again
                  </BtnGlass>
                </div>
                <BtnGhost onClick={continueWithoutPhoto} className="t-caption mt-2 text-white/70">
                  Continue without photo verification
                </BtnGhost>
              </motion.div>
            )}

            {phase === 'live' && (
              <motion.div
                key="live"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="flex flex-col items-center"
              >
                <p className="t-body text-white/80">Now, a tiny movement.</p>
                <p className="t-title-sm mt-2 flex items-center gap-2 text-white">
                  Turn your head slowly
                  <motion.span
                    animate={reduced ? undefined : { rotate: [-18, 18, -18] }}
                    transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                    className="inline-flex"
                  >
                    <ArrowRight size={24} aria-hidden="true" />
                  </motion.span>
                </p>
              </motion.div>
            )}

            {phase === 'success' && (
              <motion.div
                key="success"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="flex flex-col items-center"
              >
                <motion.span
                  initial={reduced ? false : { scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ duration: 0.48, ease: EASE_SPRING }}
                  className="flex"
                >
                  <VerifiedBadge size={40} />
                </motion.span>
                <p className="t-title-sm mt-3 text-white">You&rsquo;re verified.</p>
                <p className="t-micro mt-1 text-white/60">BADGE APPEARS ON YOUR PROFILE</p>
                {/* Optional second stage — government ID check (skippable) */}
                {idDone ? (
                  <p className="t-caption mt-3 flex items-center gap-1 font-bold text-white/85">
                    <VerifiedBadge size={13} /> ID verified ✓
                  </p>
                ) : (
                  !idDismissed && (
                    <div className="mt-4 flex flex-col items-center gap-1">
                      <DarkSurfaceBtn onClick={() => setIdOpen(true)} className="h-11 px-5">
                        Add ID verification (optional)
                      </DarkSurfaceBtn>
                      <BtnGhost onClick={() => setIdDismissed(true)} className="t-caption text-white/70">
                        Do it later
                      </BtnGhost>
                    </div>
                  )
                )}
              </motion.div>
            )}

            {phase === 'failure' && (
              <motion.div
                key="failure"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="flex flex-col items-center"
              >
                <AlertTriangle size={28} style={{ color: '#FFC95C' }} aria-hidden="true" />
                <p className="t-title-sm mt-3 text-white">We couldn&rsquo;t verify that shot.</p>
                <div className="mt-4 flex items-center gap-3">
                  <BtnGlass onClick={retry} className="h-11 px-5 text-white">
                    Try again
                  </BtnGlass>
                  <BtnGhost onClick={() => setHelpOpen(true)} className="text-white">
                    Get help
                  </BtnGhost>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Footer: why we verify + gate copy */}
      <div className="flex flex-col items-center gap-2">
        <button
          type="button"
          onClick={() => setWhyOpen(true)}
          className="t-caption text-white/70 underline decoration-white/30 underline-offset-4 transition-opacity duration-fast active:opacity-70"
        >
          Why we verify
        </button>
        <p className="t-caption text-white/50">
          Verification keeps Resonance safe — it takes 20 seconds.
        </p>
      </div>

      {/* Why we verify — community-safety explainer */}
      <GlassSheet open={whyOpen} onClose={() => setWhyOpen(false)} labelledBy="why-verify-title">
        <div className="px-6 pb-8 pt-2">
          <h2 id="why-verify-title" className="t-title-sm" style={{ color: 'var(--text)' }}>
            Why we verify
          </h2>
          <p className="t-body mt-3" style={{ color: 'var(--text-secondary)' }}>
            Every member of Resonance passes a one-time photo check, so the person you meet
            is the person you queued with. Your verification selfie is never shown on your
            profile — it&rsquo;s only used for the check.
          </p>
          <p className="t-body mt-3" style={{ color: 'var(--text-secondary)' }}>
            The verified badge appears next to your name everywhere in the app. No badge, no
            browsing — that&rsquo;s what keeps this community small and safe.
          </p>
        </div>
      </GlassSheet>

      {/* Optional ID verification — second stage, privacy-first */}
      <IdVerifySheet
        open={idOpen}
        onClose={() => setIdOpen(false)}
        onVerified={() => setIdDone(true)}
      />

      {/* Support sheet (failure state) */}
      <GlassSheet open={helpOpen} onClose={() => setHelpOpen(false)} labelledBy="verify-help-title">
        <div className="px-6 pb-8 pt-2">
          <h2 id="verify-help-title" className="t-title-sm" style={{ color: 'var(--text)' }}>
            Verification help
          </h2>
          <p className="t-body mt-3" style={{ color: 'var(--text-secondary)' }}>
            Make sure you&rsquo;re in good, even light, take off hats and glasses, and hold the
            phone at eye level. If it keeps failing, reach us at
            safety@resonance.date — a human reviews every stuck verification within a day.
          </p>
        </div>
      </GlassSheet>
    </div>
  );
}
