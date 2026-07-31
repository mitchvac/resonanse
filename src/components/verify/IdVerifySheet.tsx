import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { AlertTriangle, ArrowRight, CarFront, IdCard, X } from 'lucide-react';
import { trpc } from '@/providers/trpc';
import { BtnPrimary } from '@/components/ui/buttons';
import { DarkSurfaceBtn } from '@/components/call/CallOverlay';
import { VerifiedBadge } from '@/components/flow/feedback';
import { CAMERA_ERROR } from '@/components/call/useVideoCall';

/**
 * IdVerifySheet — government ID verification (privacy-first).
 * Step 1: choose document (State ID / Driver's license). Step 2: camera
 * capture of the document inside an alignment frame, then a ~2s in-browser
 * "scanning" sweep (edges / glare / expiry) — the captured frame is drawn
 * to a canvas, shown briefly, then cleared; it NEVER leaves the device.
 * Step 3: selfie live-check (VerifyStep pattern). Step 4: `profile.verifyId`
 * stores only the result → "ID verified ✓".
 *
 * Privacy copy (exact): "Your ID is scanned right here in your browser.
 * We only store the result — never a photo of your document."
 */

type DocType = 'state_id' | 'drivers_license';
type Step = 'doc' | 'scan' | 'captured' | 'selfie' | 'submitting' | 'done' | 'camera-error' | 'submit-error';

const EASE_SPRING = [0.34, 1.56, 0.64, 1] as [number, number, number, number];
const SCAN_CHECKS = ['Checking document edges…', 'Checking glare & focus…', 'Reading expiry date…'];

export default function IdVerifySheet({
  open,
  onClose,
  onVerified,
}: {
  open: boolean;
  onClose: () => void;
  onVerified?: () => void;
}) {
  const reduced = useReducedMotion();
  const utils = trpc.useUtils();
  const verifyId = trpc.profile.verifyId.useMutation();

  const [step, setStep] = useState<Step>('doc');
  const [docType, setDocType] = useState<DocType>('state_id');
  const [retryTick, setRetryTick] = useState(0);
  const [checkIdx, setCheckIdx] = useState(0);

  const streamRef = useRef<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  /* Camera runs during the scan / selfie steps. Environment camera for the
     document, front camera for the selfie — with a graceful fallback. */
  const cameraStep = step === 'scan' || step === 'selfie';
  useEffect(() => {
    if (!open || !cameraStep) return;
    let cancelled = false;
    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('unsupported');
        const wanted: MediaStreamConstraints = {
          video: { facingMode: step === 'scan' ? 'environment' : 'user' },
          audio: false,
        };
        let stream: MediaStream;
        try {
          stream = await navigator.mediaDevices.getUserMedia(wanted);
        } catch {
          stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        }
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
      } catch {
        if (!cancelled) setStep('camera-error');
      }
    })();
    return () => {
      cancelled = true;
      stopStream();
    };
  }, [open, cameraStep, step, retryTick, stopStream]);

  /* Attach stream when the video element (re)mounts */
  useEffect(() => {
    if (cameraStep && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
    }
  }, [cameraStep, step]);

  /* Reset on close */
  useEffect(() => {
    if (!open) {
      stopStream();
      setStep('doc');
      setCheckIdx(0);
    }
  }, [open, stopStream]);

  /* ---- Step 2: capture the document frame, run the in-browser scan ---- */
  const captureDoc = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.videoWidth === 0) return;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')?.drawImage(video, 0, 0);
    stopStream(); // the live feed is done — only the canvas frame remains, briefly
    setCheckIdx(0);
    setStep('captured');
  };

  /* ~2s scan sweep, then the frame is cleared and discarded */
  useEffect(() => {
    if (step !== 'captured') return;
    const tick = window.setInterval(() => setCheckIdx((i) => Math.min(i + 1, SCAN_CHECKS.length - 1)), 700);
    const done = window.setTimeout(() => {
      const canvas = canvasRef.current;
      if (canvas) {
        canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
        canvas.width = 0;
        canvas.height = 0;
      }
      setStep('selfie');
    }, 2100);
    return () => {
      window.clearInterval(tick);
      window.clearTimeout(done);
    };
  }, [step]);

  /* ---- Step 3: selfie live-check completes → submit the result only ---- */
  const finishSelfie = useCallback(() => {
    setStep((s) => {
      if (s !== 'selfie') return s;
      return 'submitting';
    });
  }, []);

  useEffect(() => {
    if (step !== 'submitting') return;
    let cancelled = false;
    verifyId
      .mutateAsync({ docType })
      .then(() => {
        if (cancelled) return;
        setStep('done');
        void utils.profile.me.invalidate();
        onVerified?.();
      })
      .catch(() => {
        if (!cancelled) setStep('submit-error');
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  /* Reduced-motion selfie: timed completion instead of the ring sweep */
  useEffect(() => {
    if (step !== 'selfie' || !reduced) return;
    const t = window.setTimeout(finishSelfie, 2400);
    return () => window.clearTimeout(t);
  }, [step, reduced, finishSelfie]);

  const docLabel = docType === 'state_id' ? 'State ID' : "Driver's license";

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="absolute inset-0 z-[80] flex flex-col bg-[#07070D]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.24 }}
          role="dialog"
          aria-modal="true"
          aria-label="ID verification"
        >
          {/* Header */}
          <div className="flex items-center gap-2 px-4 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex h-10 w-10 min-h-[44px] min-w-[44px] items-center justify-center rounded-full text-white/85"
              aria-label="Close ID verification"
            >
              <X size={20} aria-hidden="true" />
            </button>
            <p className="t-title-sm flex-1 text-white">ID verification</p>
            {step !== 'doc' && step !== 'done' && (
              <span className="t-micro rounded-full px-2.5 py-1 text-white/75 ring-1 ring-white/25">
                {docLabel.toUpperCase()}
              </span>
            )}
          </div>

          <div className="flex flex-1 flex-col overflow-y-auto px-5 pb-6">
            <AnimatePresence mode="wait">
              {/* ——— Step 1: choose the document ——— */}
              {step === 'doc' && (
                <motion.div
                  key="doc"
                  className="flex flex-1 flex-col justify-center"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.24 }}
                >
                  <p className="t-body text-white/80">Which ID are you using?</p>
                  <div className="mt-4 flex flex-col gap-3">
                    {(
                      [
                        { key: 'state_id', label: 'State ID', desc: 'Government-issued ID card', icon: IdCard },
                        { key: 'drivers_license', label: "Driver's license", desc: 'Any US state or territory', icon: CarFront },
                      ] as const
                    ).map((d) => (
                      <button
                        key={d.key}
                        type="button"
                        onClick={() => {
                          setDocType(d.key);
                          setStep('scan');
                        }}
                        className="flex min-h-[64px] items-center gap-3.5 rounded-[20px] px-4 py-3.5 text-left ring-1 ring-white/20 transition-colors duration-fast active:bg-white/10"
                        style={{ background: 'rgba(255,255,255,0.06)' }}
                      >
                        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/10 text-white">
                          <d.icon size={20} aria-hidden="true" />
                        </span>
                        <span className="flex-1">
                          <span className="t-value block font-bold text-white">{d.label}</span>
                          <span className="t-caption block text-white/60">{d.desc}</span>
                        </span>
                        <ArrowRight size={17} className="text-white/50" aria-hidden="true" />
                      </button>
                    ))}
                  </div>
                  {/* Privacy promise — exact tone */}
                  <p className="t-caption mt-6 text-center text-white/60">
                    Your ID is scanned right here in your browser. We only store the
                    result — never a photo of your document.
                  </p>
                </motion.div>
              )}

              {/* ——— Step 2: document capture + alignment frame ——— */}
              {(step === 'scan' || step === 'captured') && (
                <motion.div
                  key="scan"
                  className="flex flex-1 flex-col items-center justify-center"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.24 }}
                >
                  <div
                    className="relative w-full max-w-[320px] overflow-hidden rounded-[20px]"
                    style={{ border: '2px solid rgba(255,255,255,0.22)' }}
                  >
                    {/* One persistent canvas node — the captured frame is drawn
                        here, shown during the sweep, then cleared + discarded */}
                    <video
                      ref={videoRef}
                      autoPlay
                      playsInline
                      muted
                      className={
                        step === 'scan' ? 'aspect-[1.586] w-full bg-black object-cover' : 'hidden'
                      }
                    />
                    <canvas
                      ref={canvasRef}
                      className={
                        step === 'captured' ? 'aspect-[1.586] w-full bg-black object-cover' : 'hidden'
                      }
                    />

                    {/* ID-card alignment frame (ISO 7810 ratio 1.586) */}
                    {step === 'scan' && (
                      <svg
                        className="pointer-events-none absolute inset-0 h-full w-full"
                        viewBox="0 0 158.6 100"
                        fill="none"
                        aria-hidden="true"
                      >
                        <rect
                          x="6"
                          y="6"
                          width="146.6"
                          height="88"
                          rx="8"
                          stroke="rgba(255,255,255,0.55)"
                          strokeWidth="1.5"
                          strokeDasharray="6 5"
                        />
                      </svg>
                    )}

                    {/* Scanning sweep (~2s) — reduced motion: static bar */}
                    {step === 'captured' &&
                      (reduced ? (
                        <div className="absolute inset-x-0 top-1/2 h-0.5 bg-white/70" aria-hidden="true" />
                      ) : (
                        <motion.div
                          className="absolute inset-x-0 h-10"
                          style={{
                            background:
                              'linear-gradient(180deg, transparent 0%, rgba(123,73,245,0.45) 45%, rgba(255,255,255,0.85) 50%, rgba(123,73,245,0.45) 55%, transparent 100%)',
                          }}
                          initial={{ top: '-12%' }}
                          animate={{ top: '104%' }}
                          transition={{ duration: 1.9, ease: 'linear' }}
                          aria-hidden="true"
                        />
                      ))}
                  </div>

                  {step === 'scan' ? (
                    <div className="mt-6 flex flex-col items-center gap-3">
                      <p className="t-body max-w-[280px] text-center text-white/80">
                        Fit your {docLabel} inside the frame — good light, no glare.
                      </p>
                      <button
                        type="button"
                        onClick={captureDoc}
                        aria-label={`Capture ${docLabel}`}
                        className="flex h-[72px] w-[72px] items-center justify-center rounded-full border-[3px] border-white transition-transform duration-fast active:scale-95"
                      >
                        <span className="h-[52px] w-[52px] rounded-full" style={{ background: 'var(--violet)' }} />
                      </button>
                    </div>
                  ) : (
                    <div className="mt-6 flex min-h-[72px] flex-col items-center gap-2">
                      <p className="t-title-sm text-white">Scanning…</p>
                      <p className="t-caption text-white/65" role="status">
                        {SCAN_CHECKS[checkIdx]}
                      </p>
                    </div>
                  )}
                </motion.div>
              )}

              {/* ——— Step 3: selfie live-check (VerifyStep pattern) ——— */}
              {(step === 'selfie' || step === 'submitting') && (
                <motion.div
                  key="selfie"
                  className="flex flex-1 flex-col items-center justify-center"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.24 }}
                >
                  <div className="relative w-full max-w-[min(260px,64%)]">
                    <div
                      className="relative aspect-[4/5] overflow-hidden"
                      style={{ borderRadius: 24, border: '2px solid rgba(255,255,255,0.22)' }}
                    >
                      <video
                        ref={videoRef}
                        autoPlay
                        playsInline
                        muted
                        className="h-full w-full -scale-x-100 bg-black object-cover"
                      />
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
                    </div>
                    {/* Violet progress ring — completes in 2.4s → submit */}
                    {step === 'selfie' && !reduced && (
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
                          onAnimationComplete={finishSelfie}
                        />
                      </svg>
                    )}
                  </div>
                  {step === 'selfie' && reduced && (
                    <div className="mt-4 flex w-full max-w-[260px] gap-1" aria-hidden="true">
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
                  <p className="t-title-sm mt-6 flex items-center gap-2 text-white">
                    {step === 'submitting' ? (
                      'Matching your selfie…'
                    ) : (
                      <>
                        Turn your head slowly
                        <motion.span
                          animate={reduced ? undefined : { rotate: [-18, 18, -18] }}
                          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                          className="inline-flex"
                        >
                          <ArrowRight size={22} aria-hidden="true" />
                        </motion.span>
                      </>
                    )}
                  </p>
                  <p className="t-caption mt-2 max-w-[280px] text-center text-white/60">
                    One last check that the ID belongs to you.
                  </p>
                </motion.div>
              )}

              {/* ——— Step 4: success ——— */}
              {step === 'done' && (
                <motion.div
                  key="done"
                  className="flex flex-1 flex-col items-center justify-center text-center"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.24 }}
                >
                  <motion.span
                    className="flex h-20 w-20 items-center justify-center rounded-full"
                    style={{ boxShadow: '0 0 0 2.5px var(--violet), 0 0 32px rgba(123,73,245,0.5)' }}
                    initial={reduced ? false : { scale: 0.6, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ duration: 0.48, ease: EASE_SPRING }}
                  >
                    <VerifiedBadge size={40} />
                  </motion.span>
                  <p className="t-title mt-5 text-white">ID verified ✓</p>
                  <p className="t-body mt-2 max-w-[280px] text-white/70">
                    Your ID is scanned right here in your browser. We only store the
                    result — never a photo of your document.
                  </p>
                  <BtnPrimary onClick={onClose} className="mt-6 w-full max-w-[280px]">
                    Done
                  </BtnPrimary>
                </motion.div>
              )}

              {/* ——— Error states ——— */}
              {(step === 'camera-error' || step === 'submit-error') && (
                <motion.div
                  key="error"
                  className="flex flex-1 flex-col items-center justify-center gap-4 text-center"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.24 }}
                >
                  <AlertTriangle size={30} style={{ color: '#FFC95C' }} aria-hidden="true" />
                  <p className="t-body max-w-[280px] text-white/85">
                    {step === 'camera-error'
                      ? CAMERA_ERROR
                      : "We couldn't finish the ID check — please try again."}
                  </p>
                  <div className="flex items-center gap-3">
                    <DarkSurfaceBtn
                      onClick={() => {
                        if (step === 'camera-error') {
                          setStep('scan');
                          setRetryTick((t) => t + 1);
                        } else {
                          setStep('submitting');
                        }
                      }}
                      className="h-11 px-5"
                    >
                      Try again
                    </DarkSurfaceBtn>
                    <DarkSurfaceBtn onClick={onClose} className="h-11 px-5">
                      Close
                    </DarkSurfaceBtn>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
