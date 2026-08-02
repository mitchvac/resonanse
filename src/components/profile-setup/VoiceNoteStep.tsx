import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, useMotionValue, useReducedMotion, useTransform } from 'framer-motion';
import { Mic, Play, RotateCcw, Square, TriangleAlert } from 'lucide-react';
import GlassCard from '@/components/GlassCard';
import { Block, FlowChip } from '@/components/flow/controls';
import { useAuth } from '@/hooks/useAuth';
import { trpc } from '@/providers/trpc';
import { isMediaCaptureUnavailable, micErrorMessage } from '@/lib/cameraCheck';
import type { ProfileSetupDraft } from './draft';

/**
 * VoiceNoteStep — profile-create.md §4 (optional)
 * REAL MediaRecorder capture (mime fallback webm/opus → webm → mp4 → aac),
 * 60s hard cap. The violet fill sweeps the waveform with ACTUAL recording
 * time; playback is the recorded blob via <audio>. Saved as a data URL
 * (≤1.2M chars — larger is rejected with an error) into profile.voiceNoteUrl.
 * Mic unavailable → honest blocked/permissions copy, no fake recording.
 */

const BAR_COUNT = 48;
const MAX_SECONDS = 60;
const MAX_DATAURL_CHARS = 1_200_000;
const PROMPT_CHIPS = ['Introduce yourself in one breath', 'Describe your perfect Sunday'];

type Phase = 'idle' | 'recording' | 'recorded' | 'playing';

function fmt(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

function pickAudioMime(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined;
  for (const t of ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/aac']) {
    if (MediaRecorder.isTypeSupported(t)) return t;
  }
  return undefined;
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('read failed'));
    reader.readAsDataURL(blob);
  });
}

export default function VoiceNoteStep({
  draft,
  update,
  onToast,
  savedVoiceUrl,
}: {
  draft: ProfileSetupDraft;
  update: (patch: Partial<ProfileSetupDraft>) => void;
  onToast: (message: string) => void;
  /** voice note already on the backend (data URL) — enables playback on revisit */
  savedVoiceUrl?: string | null;
}) {
  const reduced = useReducedMotion();
  const { isAuthenticated } = useAuth();
  const upsert = trpc.profile.upsert.useMutation();

  /* playback source: this session's recording → backend data URL → nothing */
  const playableSrc =
    draft.voiceNoteData ??
    (savedVoiceUrl && savedVoiceUrl.startsWith('data:') ? savedVoiceUrl : null);

  const [phase, setPhase] = useState<Phase>(draft.voiceRecorded ? 'recorded' : 'idle');
  const [elapsed, setElapsed] = useState(draft.voiceSeconds || 0);
  const [prompt, setPrompt] = useState<string | null>(null);
  const [micError, setMicError] = useState<string | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef(0);
  const timerRef = useRef<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const playhead = useMotionValue(0);
  /* clip the violet "played" layer from the right as playback advances */
  const playClip = useTransform(playhead, (v) => `inset(0 ${(1 - v) * 100}% 0 0)`);

  /* deterministic pseudo-random amplitude profile per bar */
  const bars = useMemo(
    () =>
      Array.from({ length: BAR_COUNT }, (_, i) => {
        const seed = Math.sin(i * 12.9898) * 43758.5453;
        const rand = seed - Math.floor(seed);
        return {
          idle: 8 + rand * 8,
          peak: 12 + rand * 16, /* 12–28px */
          dur: 0.9 + rand * 0.6,
        };
      }),
    [],
  );

  const stopStream = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  useEffect(
    () => () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
      const rec = recorderRef.current;
      if (rec && rec.state !== 'inactive') rec.stop();
      stopStream();
      audioRef.current?.pause();
    },
    [],
  );

  /* ---- real recording ---- */
  const startRecording = async () => {
    setMicError(null);
    if (isMediaCaptureUnavailable() || typeof MediaRecorder === 'undefined') {
      setMicError(micErrorMessage());
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setMicError(micErrorMessage());
      return;
    }
    streamRef.current = stream;
    const mime = pickAudioMime();
    let rec: MediaRecorder;
    try {
      rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    } catch {
      stopStream();
      setMicError(micErrorMessage());
      return;
    }
    chunksRef.current = [];
    rec.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    rec.onstop = () => {
      void finalizeRecording(rec.mimeType || mime || 'audio/webm');
    };
    recorderRef.current = rec;
    startedAtRef.current = Date.now();
    setElapsed(0);
    setPhase('recording');
    rec.start(250);
    timerRef.current = window.setInterval(() => {
      const s = (Date.now() - startedAtRef.current) / 1000;
      if (s >= MAX_SECONDS) stopRecording();
      else setElapsed(s);
    }, 250);
  };

  const stopRecording = () => {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    const rec = recorderRef.current;
    if (rec && rec.state !== 'inactive') rec.stop();
    stopStream();
  };

  const finalizeRecording = async (mimeType: string) => {
    const seconds = Math.min(
      MAX_SECONDS,
      Math.max(1, Math.round((Date.now() - startedAtRef.current) / 1000)),
    );
    const blob = new Blob(chunksRef.current, { type: mimeType });
    chunksRef.current = [];
    try {
      const dataUrl = await blobToDataUrl(blob);
      if (dataUrl.length > MAX_DATAURL_CHARS) {
        setPhase('idle');
        setElapsed(0);
        onToast('That recording is too large — try a shorter one.');
        return;
      }
      update({ voiceRecorded: true, voiceSeconds: seconds, voiceNoteData: dataUrl });
      setElapsed(seconds);
      setPhase('recorded');
      onToast('Sounds great');
      /* signed-in: persist immediately so the data URL never needs localStorage */
      if (isAuthenticated) {
        try {
          await upsert.mutateAsync({ voiceNoteUrl: dataUrl });
        } catch {
          onToast("Couldn't save your voice note — it's kept in this session.");
        }
      }
    } catch {
      setPhase('idle');
      onToast("Couldn't read that recording — try again.");
    }
  };

  /* ---- playback of the actual recorded audio ---- */
  const play = () => {
    if (!playableSrc) return;
    let audio = audioRef.current;
    if (!audio || audio.src !== playableSrc) {
      audio?.pause();
      const next = new Audio(playableSrc);
      audioRef.current = next;
      next.addEventListener('timeupdate', () => {
        if (next.duration > 0) playhead.set(next.currentTime / next.duration);
      });
      next.addEventListener('ended', () => {
        setPhase('recorded');
        playhead.set(0);
      });
      audio = next;
    }
    playhead.set(0);
    setPhase('playing');
    void audio.play().catch(() => setPhase('recorded'));
  };

  const redo = () => {
    audioRef.current?.pause();
    audioRef.current = null;
    playhead.set(0);
    update({ voiceRecorded: false, voiceSeconds: 0, voiceNoteData: null });
    setElapsed(0);
    setPhase('idle');
  };

  /* violet fill sweeps with ACTUAL elapsed recording time */
  const recordedFraction = phase === 'recording' ? Math.min(1, elapsed / MAX_SECONDS) : 0;

  return (
    <div className="px-5 pt-6 pb-8">
      <Block>
        <GlassCard edge="none">
          <div className="px-5 py-5">
            <h1 className="t-title-sm" style={{ color: 'var(--text)' }}>
              Add your voice
            </h1>
            <p className="t-caption mt-1" style={{ color: 'var(--text-secondary)' }}>
              Up to 60 seconds. People reply 2× more when they hear you.
            </p>

            {/* prompt suggestion chips */}
            <div className="mt-3 flex flex-wrap gap-2">
              {PROMPT_CHIPS.map((chip) => (
                <FlowChip
                  key={chip}
                  label={chip}
                  selected={prompt === chip}
                  onToggle={() => setPrompt(prompt === chip ? null : chip)}
                />
              ))}
            </div>
            {prompt && (
              <p className="t-caption mt-2" style={{ color: 'var(--text-secondary)' }}>
                Try: &ldquo;{prompt}&rdquo;
              </p>
            )}

            {/* waveform */}
            <div className="relative mt-5">
              <svg
                viewBox="0 0 336 40"
                className="h-10 w-full"
                role="img"
                aria-label={
                  phase === 'recorded' || phase === 'playing'
                    ? 'Voice note recorded'
                    : 'Voice note waveform'
                }
              >
                {bars.map((bar, i) => {
                  const x = i * 7 + 1.5;
                  const recording = phase === 'recording' && !reduced;
                  /* bars up to the live elapsed fraction turn violet — the
                     sweep tracks real recording time, not a simulation */
                  const swept = phase === 'recording' && i / BAR_COUNT < recordedFraction;
                  return (
                    <motion.rect
                      key={i}
                      x={x}
                      width={4}
                      rx={2}
                      y={20 - bar.idle / 2}
                      height={bar.idle}
                      fill={swept ? 'var(--violet)' : 'var(--text)'}
                      opacity={phase === 'idle' ? 0.3 : swept ? 1 : 0.45}
                      style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
                      animate={
                        recording
                          ? { scaleY: [1, bar.peak / bar.idle, 0.6, bar.peak / (bar.idle * 1.6), 1] }
                          : { scaleY: 1 }
                      }
                      transition={
                        recording
                          ? { duration: bar.dur, repeat: Infinity, ease: 'easeInOut', delay: i * 0.02 }
                          : { duration: 0.2 }
                      }
                    />
                  );
                })}
              </svg>

              {/* played portion in violet — twin layer clipped via motion value (transform-only scrub) */}
              {phase === 'playing' && (
                <motion.svg
                  viewBox="0 0 336 40"
                  className="pointer-events-none absolute inset-0 h-10 w-full"
                  style={{ clipPath: playClip }}
                  aria-hidden="true"
                >
                  {bars.map((bar, i) => (
                    <rect
                      key={i}
                      x={i * 7 + 1.5}
                      width={4}
                      rx={2}
                      y={20 - bar.peak / 2}
                      height={bar.peak}
                      fill="var(--violet)"
                    />
                  ))}
                </motion.svg>
              )}
            </div>

            {/* honest mic-blocked state — no fake recording */}
            {micError && (
              <p
                className="t-caption mt-3 flex items-start gap-1.5 rounded-[12px] px-3 py-2"
                style={{ background: 'var(--field)', color: 'var(--warn)' }}
                role="alert"
              >
                <TriangleAlert size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
                {micError}
              </p>
            )}

            {/* controls + duration */}
            <div className="mt-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                {/* record / stop — violet disc */}
                <button
                  type="button"
                  onClick={() => (phase === 'recording' ? stopRecording() : void startRecording())}
                  disabled={phase === 'playing'}
                  aria-label={phase === 'recording' ? 'Stop recording' : 'Record voice note'}
                  className="flex h-14 w-14 items-center justify-center rounded-full text-white transition-transform duration-fast active:scale-95 disabled:opacity-40"
                  style={{ background: 'var(--violet)', boxShadow: 'var(--violet-glow)' }}
                >
                  {phase === 'recording' ? (
                    <Square size={20} fill="currentColor" aria-hidden="true" />
                  ) : (
                    <Mic size={22} aria-hidden="true" />
                  )}
                </button>
                {(phase === 'recorded' || phase === 'playing') && (
                  <>
                    {playableSrc && (
                      <button
                        type="button"
                        onClick={play}
                        disabled={phase === 'playing'}
                        aria-label="Play voice note"
                        className="flex h-11 w-11 items-center justify-center rounded-full transition-opacity duration-fast active:opacity-70 disabled:opacity-40"
                        style={{ background: 'var(--field)', color: 'var(--text)' }}
                      >
                        <Play size={18} fill="currentColor" aria-hidden="true" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={redo}
                      disabled={phase === 'playing'}
                      aria-label="Redo voice note"
                      className="flex h-11 w-11 items-center justify-center rounded-full transition-opacity duration-fast active:opacity-70 disabled:opacity-40"
                      style={{ background: 'var(--field)', color: 'var(--text)' }}
                    >
                      <RotateCcw size={18} aria-hidden="true" />
                    </button>
                  </>
                )}
              </div>
              {(phase === 'recorded' || phase === 'playing' || phase === 'recording') && (
                <span className="t-micro" style={{ color: 'var(--text)' }}>
                  {fmt(elapsed)} / {fmt(MAX_SECONDS)}
                </span>
              )}
            </div>
          </div>
        </GlassCard>
      </Block>

      <Block className="mt-4" y={16}>
        <p className="t-caption text-center" style={{ color: 'var(--text-secondary)' }}>
          Optional — you can add it later from your profile.
        </p>
      </Block>
    </div>
  );
}
