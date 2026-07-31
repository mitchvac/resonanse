import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, animate, useMotionValue, useReducedMotion, useTransform } from 'framer-motion';
import { Mic, Play, RotateCcw, Square } from 'lucide-react';
import GlassCard from '@/components/GlassCard';
import { Block, FlowChip } from '@/components/flow/controls';
import type { ProfileSetupDraft } from './draft';

/**
 * VoiceNoteStep — profile-create.md §4 (optional)
 * Glass card: t-title-sm "Add your voice" + caption. Waveform recorder: 48
 * vertical SVG bars (--text 0.3 idle); recording animates bar height 8–28px
 * (simulated amplitude); on playback the played portion turns violet (overlay
 * clipped by a motion-value width — 60fps transform, no re-render). Controls:
 * record (violet disc) / play / redo. Recorded → duration micro label
 * "0:17 / 0:20" + "Sounds great" toast on save.
 */

const BAR_COUNT = 48;
const MAX_SECONDS = 20;
const PROMPT_CHIPS = ['Introduce yourself in one breath', 'Describe your perfect Sunday'];

type Phase = 'idle' | 'recording' | 'recorded' | 'playing';

function fmt(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  return `0:${String(s).padStart(2, '0')}`;
}

export default function VoiceNoteStep({
  draft,
  update,
  onToast,
}: {
  draft: ProfileSetupDraft;
  update: (patch: Partial<ProfileSetupDraft>) => void;
  onToast: (message: string) => void;
}) {
  const reduced = useReducedMotion();
  const [phase, setPhase] = useState<Phase>(draft.voiceRecorded ? 'recorded' : 'idle');
  const [elapsed, setElapsed] = useState(draft.voiceSeconds || 0);
  const [prompt, setPrompt] = useState<string | null>(null);
  const timerRef = useRef<number | null>(null);
  const playbackRef = useRef<{ stop: () => void } | null>(null);
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

  useEffect(() => () => {
    if (timerRef.current) window.clearInterval(timerRef.current);
    playbackRef.current?.stop();
  }, []);

  const startRecording = () => {
    setElapsed(0);
    setPhase('recording');
    const started = Date.now();
    timerRef.current = window.setInterval(() => {
      const s = (Date.now() - started) / 1000;
      if (s >= MAX_SECONDS) stopRecording();
      else setElapsed(s);
    }, 250);
  };

  const stopRecording = () => {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setElapsed((current) => {
      const seconds = Math.min(MAX_SECONDS, Math.max(1, Math.round(current)));
      update({ voiceRecorded: true, voiceSeconds: seconds });
      onToast('Sounds great');
      return seconds;
    });
    setPhase('recorded');
  };

  const play = () => {
    setPhase('playing');
    playhead.set(0);
    playbackRef.current = animate(playhead, 1, {
      duration: Math.max(1, elapsed),
      ease: 'linear',
      onComplete: () => setPhase('recorded'),
    });
  };

  const redo = () => {
    playhead.set(0);
    update({ voiceRecorded: false, voiceSeconds: 0 });
    setElapsed(0);
    setPhase('idle');
  };

  return (
    <div className="px-5 pt-6 pb-8">
      <Block>
        <GlassCard edge="none">
          <div className="px-5 py-5">
            <h1 className="t-title-sm" style={{ color: 'var(--text)' }}>
              Add your voice
            </h1>
            <p className="t-caption mt-1" style={{ color: 'var(--text-secondary)' }}>
              20 seconds. People reply 2× more when they hear you.
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
                  return (
                    <motion.rect
                      key={i}
                      x={x}
                      width={4}
                      rx={2}
                      y={20 - bar.idle / 2}
                      height={bar.idle}
                      fill="var(--text)"
                      opacity={phase === 'idle' ? 0.3 : 0.45}
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

            {/* controls + duration */}
            <div className="mt-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                {/* record / stop — violet disc */}
                <button
                  type="button"
                  onClick={phase === 'recording' ? stopRecording : startRecording}
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
