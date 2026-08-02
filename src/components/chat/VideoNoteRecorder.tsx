import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { AlertTriangle, RotateCcw, SendHorizontal, X } from 'lucide-react';
import { trpc } from '@/providers/trpc';
import { BtnPrimary } from '@/components/ui/buttons';
import { DarkSurfaceBtn } from '@/components/call/CallOverlay';
import type { ChatMessage } from '@/components/chat/types';
import { cameraErrorMessage } from '@/lib/cameraCheck';
import { cn } from '@/lib/utils';

/**
 * VideoNoteRecorder — live-camera-only video notes (chat.md video notes).
 * Always-dark takeover sheet: live preview → big record button with a 10s
 * hard cap + countdown ring (MediaRecorder, video/webm) → preview playback
 * with Re-record / Send. No file picker by design: "Recorded live in-app —
 * no uploads, no filters." Payloads over 4.5M chars re-record at 640×480.
 */

const MAX_SEC = 10;
const MAX_DATAURL_CHARS = 4_500_000;

type Phase = 'camera' | 'recording' | 'preview' | 'sending' | 'error';

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('read failed'));
    reader.readAsDataURL(blob);
  });
}

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined;
  /* webm first (Chrome/Android/Firefox), then mp4 — iOS Safari records mp4 */
  for (const t of [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
    'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
    'video/mp4',
  ]) {
    if (MediaRecorder.isTypeSupported(t)) return t;
  }
  return undefined;
}

export default function VideoNoteRecorder({
  open,
  conversationId,
  onClose,
  onSent,
  onToast,
}: {
  open: boolean;
  conversationId: number;
  onClose: () => void;
  onSent: (message: ChatMessage) => void;
  onToast: (text: string) => void;
}) {
  const reduced = useReducedMotion();
  const [phase, setPhase] = useState<Phase>('camera');
  const [lowRes, setLowRes] = useState(false);
  const [retryTick, setRetryTick] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const blobRef = useRef<Blob | null>(null);
  const startedAtRef = useRef(0);
  const durationRef = useRef(0);

  const sendNote = trpc.chat.sendVideoNote.useMutation();

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const discardBlob = useCallback(() => {
    blobRef.current = null;
    setBlobUrl((url) => {
      if (url) URL.revokeObjectURL(url);
      return null;
    });
  }, []);

  /* ---- Camera lifecycle: live while the sheet is open ---- */
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
          throw new Error('unsupported');
        }
        const stream = await navigator.mediaDevices.getUserMedia({
          video: lowRes
            ? { facingMode: 'user', width: 640, height: 480 }
            : { facingMode: 'user', width: 1280, height: 720 },
          audio: true,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
        setPhase('camera');
      } catch {
        if (!cancelled) setPhase('error');
      }
    })();
    return () => {
      cancelled = true;
      stopStream();
    };
  }, [open, lowRes, retryTick, stopStream]);

  /* Re-attach the preview stream when returning to the camera phase */
  useEffect(() => {
    if ((phase === 'camera' || phase === 'recording') && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
    }
  }, [phase]);

  /* Reset everything when the sheet closes */
  useEffect(() => {
    if (!open) {
      const rec = recorderRef.current;
      if (rec && rec.state !== 'inactive') rec.stop();
      recorderRef.current = null;
      discardBlob();
      setElapsed(0);
      setLowRes(false);
      setPhase('camera');
    }
  }, [open, discardBlob]);

  /* ---- Recording ---- */
  const stopRecording = useCallback(() => {
    const rec = recorderRef.current;
    if (rec && rec.state !== 'inactive') rec.stop();
  }, []);

  const startRecording = useCallback(() => {
    const stream = streamRef.current;
    if (!stream || phase !== 'camera') return;
    discardBlob();
    chunksRef.current = [];
    const mime = pickMimeType();
    let rec: MediaRecorder;
    try {
      rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    } catch {
      setPhase('error');
      return;
    }
    rec.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    rec.onstop = () => {
      durationRef.current = Math.min(
        MAX_SEC,
        Math.max(1, Math.round((Date.now() - startedAtRef.current) / 1000)),
      );
      const blob = new Blob(chunksRef.current, { type: rec.mimeType || 'video/webm' });
      chunksRef.current = [];
      blobRef.current = blob;
      setBlobUrl(URL.createObjectURL(blob));
      setPhase('preview');
    };
    recorderRef.current = rec;
    startedAtRef.current = Date.now();
    setElapsed(0);
    rec.start(250);
    setPhase('recording');
  }, [phase, discardBlob]);

  /* Countdown ticker + 10s hard cap */
  useEffect(() => {
    if (phase !== 'recording') return;
    const t = window.setInterval(() => {
      const secs = (Date.now() - startedAtRef.current) / 1000;
      setElapsed(secs);
      if (secs >= MAX_SEC) stopRecording();
    }, 100);
    return () => window.clearInterval(t);
  }, [phase, stopRecording]);

  /* ---- Send ---- */
  const send = async () => {
    const blob = blobRef.current;
    if (!blob || phase === 'sending') return;
    setPhase('sending');
    try {
      const data = await blobToDataUrl(blob);
      if (data.length > MAX_DATAURL_CHARS) {
        if (!lowRes) {
          setLowRes(true);
          discardBlob();
          setPhase('camera');
          onToast('That clip was too large — re-recording at a lower resolution.');
        } else {
          setPhase('preview');
          onToast('Still too large — try a shorter clip.');
        }
        return;
      }
      const { message } = await sendNote.mutateAsync({
        conversationId,
        data,
        durationSec: Math.min(15, Math.max(1, durationRef.current)),
      });
      onSent(message);
      onClose();
    } catch {
      setPhase('preview');
      onToast("Couldn't send the video note.");
    }
  };

  const remaining = Math.max(0, MAX_SEC - elapsed);
  const ringPct = Math.min(1, elapsed / MAX_SEC);

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
          aria-label="Record a video note"
        >
          {/* Header */}
          <div
            className="flex items-center gap-2 px-4"
            style={{ paddingTop: 'max(16px, env(safe-area-inset-top, 0px))' }}
          >
            <button
              type="button"
              onClick={onClose}
              className="flex h-10 w-10 min-h-[44px] min-w-[44px] items-center justify-center rounded-full text-white/85"
              aria-label="Close video note recorder"
            >
              <X size={20} aria-hidden="true" />
            </button>
            <p className="t-title-sm flex-1 text-white">Video note</p>
            <span className="t-micro rounded-full px-2.5 py-1 text-white/75 ring-1 ring-white/25">
              LIVE CAMERA
            </span>
          </div>

          {/* Stage */}
          <div className="flex flex-1 flex-col items-center justify-center px-5">
            <div
              className="relative w-full max-w-[320px] overflow-hidden rounded-[24px]"
              style={{ border: '2px solid rgba(255,255,255,0.22)' }}
            >
              {phase === 'preview' || phase === 'sending' ? (
                blobUrl && (
                  <video
                    src={blobUrl}
                    controls
                    playsInline
                    className="aspect-[3/4] w-full bg-black object-cover"
                  />
                )
              ) : (
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="aspect-[3/4] w-full -scale-x-100 bg-black object-cover"
                />
              )}

              {/* Countdown ring while recording */}
              {phase === 'recording' && (
                <div className="absolute right-3 top-3 flex h-11 w-11 items-center justify-center">
                  <svg className="absolute inset-0 h-full w-full -rotate-90" viewBox="0 0 44 44" aria-hidden="true">
                    <circle cx="22" cy="22" r="19" fill="rgba(5,5,9,0.5)" stroke="rgba(255,255,255,0.25)" strokeWidth="3" />
                    <circle
                      cx="22"
                      cy="22"
                      r="19"
                      fill="none"
                      stroke="var(--violet)"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeDasharray={`${(1 - ringPct) * 119.4} 119.4`}
                    />
                  </svg>
                  <span className="t-caption relative font-bold text-white" aria-live="polite">
                    {Math.ceil(remaining)}
                  </span>
                </div>
              )}
            </div>

            {/* Phase controls */}
            <div className="mt-6 flex min-h-[120px] flex-col items-center gap-3">
              {phase === 'camera' && (
                <>
                  <button
                    type="button"
                    onClick={startRecording}
                    aria-label="Start recording"
                    className="flex h-[72px] w-[72px] items-center justify-center rounded-full border-[3px] border-white transition-transform duration-fast active:scale-95"
                  >
                    <span className="h-[52px] w-[52px] rounded-full" style={{ background: 'var(--violet)' }} />
                  </button>
                  <p className="t-caption text-white/60">Up to {MAX_SEC} seconds</p>
                </>
              )}

              {phase === 'recording' && (
                <button
                  type="button"
                  onClick={stopRecording}
                  aria-label="Stop recording"
                  className="flex h-[72px] w-[72px] items-center justify-center rounded-full border-[3px] border-white transition-transform duration-fast active:scale-95"
                >
                  <motion.span
                    className="h-7 w-7 rounded-[6px] bg-white"
                    animate={reduced ? undefined : { scale: [1, 0.86, 1] }}
                    transition={{ duration: 1.2, repeat: Infinity }}
                  />
                </button>
              )}

              {(phase === 'preview' || phase === 'sending') && (
                <div className="flex items-center gap-3">
                  <DarkSurfaceBtn
                    onClick={() => {
                      discardBlob();
                      setPhase('camera');
                    }}
                    disabled={phase === 'sending'}
                    className="h-11 px-5"
                  >
                    <RotateCcw size={15} aria-hidden="true" />
                    Re-record
                  </DarkSurfaceBtn>
                  <BtnPrimary onClick={() => void send()} disabled={phase === 'sending'} className="h-11 px-6">
                    <SendHorizontal size={15} aria-hidden="true" />
                    {phase === 'sending' ? 'Sending…' : 'Send'}
                  </BtnPrimary>
                </div>
              )}

              {phase === 'error' && (
                <div className="flex flex-col items-center gap-3 text-center">
                  <AlertTriangle size={26} style={{ color: '#FFC95C' }} aria-hidden="true" />
                  <p className="t-body text-white/85">{cameraErrorMessage()}</p>
                  <DarkSurfaceBtn onClick={() => setRetryTick((t) => t + 1)} className="h-11 px-5">
                    Retry
                  </DarkSurfaceBtn>
                </div>
              )}
            </div>
          </div>

          {/* Honest camera-only caption */}
          <p
            className={cn('t-caption px-8 text-center text-white/55')}
            style={{ paddingBottom: 'max(24px, env(safe-area-inset-bottom, 0px))' }}
          >
            Recorded live in-app — no uploads, no filters.
          </p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
