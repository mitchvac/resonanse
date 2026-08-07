import { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Check, Languages, Loader2, Pause, Play } from 'lucide-react';
import GlassSheet from '@/components/GlassSheet';
import { trpc } from '@/providers/trpc';
import { cn } from '@/lib/utils';

/**
 * TranslateControls — Resonance Translate surfaces for the chat stream.
 * Capability-driven: the backend `translate.health` query reports which
 * engines are configured (text / stt / tts) plus the language list.
 * PRECONDITION_FAILED means the service is not configured — treated the
 * same as health=false (no dead UI renders).
 */

export type TranslateLanguage = { code: string; name: string };

const TARGET_KEY = 'translate-target';

function lastTarget(): string {
  return window.localStorage.getItem(TARGET_KEY) ?? 'en';
}

/** Target-language picker sheet — remembers the last-used target. */
export function TranslateTargetSheet({
  open,
  languages,
  onPick,
  onClose,
}: {
  open: boolean;
  languages: TranslateLanguage[];
  onPick: (code: string) => void;
  onClose: () => void;
}) {
  const current = open ? lastTarget() : null;
  return (
    <GlassSheet open={open} onClose={onClose} labelledBy="translate-target-title">
      <div className="px-5 pb-6 pt-1">
        <h2 id="translate-target-title" className="t-title" style={{ color: 'var(--text)' }}>
          Translate to
        </h2>
        <p className="t-caption mt-1" style={{ color: 'var(--text-secondary)' }}>
          Resonance Translate keeps everything in-app.
        </p>
        <div className="mt-3 flex flex-col gap-1.5">
          {languages.length === 0 && (
            <p className="t-caption py-2" style={{ color: 'var(--text-secondary)' }}>
              No languages available.
            </p>
          )}
          {languages.map((lang) => {
            const active = lang.code === current;
            return (
              <button
                key={lang.code}
                type="button"
                onClick={() => onPick(lang.code)}
                className="flex min-h-[44px] items-center gap-2 rounded-2xl px-3.5 py-2.5"
                style={{
                  background: 'var(--field)',
                  color: 'var(--text)',
                  boxShadow: active ? 'inset 0 0 0 1.5px var(--violet)' : 'none',
                }}
                aria-pressed={active}
              >
                <Languages
                  size={14}
                  className="shrink-0"
                  style={{ color: 'var(--text-secondary)' }}
                  aria-hidden="true"
                />
                <span className="t-value flex-1 text-left">{lang.name}</span>
                <span
                  className="t-micro rounded-full px-2 py-0.5"
                  style={{ background: 'var(--glass-a)', color: 'var(--text-secondary)' }}
                >
                  {lang.code}
                </span>
                {active && (
                  <Check size={14} style={{ color: 'var(--violet)' }} aria-label="Last used" />
                )}
              </button>
            );
          })}
        </div>
      </div>
    </GlassSheet>
  );
}

/** Inline translation under a received text bubble — result cached by the
    query key (message text + target), so re-renders never refetch. */
export function TextTranslation({
  text,
  target,
  source,
  onError,
}: {
  text: string;
  target: string;
  source?: string;
  onError: (unconfigured: boolean) => void;
}) {
  const reduced = useReducedMotion();
  const [showing, setShowing] = useState(true);
  const translateQuery = trpc.translate.text.useQuery(
    { text, target, source },
    { retry: false, staleTime: Infinity, refetchOnWindowFocus: false },
  );

  useEffect(() => {
    if (translateQuery.error) {
      onError(translateQuery.error.data?.code === 'PRECONDITION_FAILED');
    }
  }, [translateQuery.error, onError]);

  if (translateQuery.isLoading) {
    return (
      <p
        className="t-caption flex items-center gap-1.5 px-1 pt-1 italic"
        style={{ color: 'var(--text-secondary)' }}
        role="status"
      >
        <Loader2 size={12} className="animate-spin" aria-hidden="true" />
        Translating…
      </p>
    );
  }
  const data = translateQuery.data;
  if (!data) return null;
  const from = data.detectedSource ?? source ?? 'auto';

  return (
    <motion.div
      className="flex flex-col items-start gap-0.5 px-1 pt-1"
      initial={{ opacity: 0, y: reduced ? 0 : 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
    >
      {showing ? (
        <>
          <p className="t-caption italic" style={{ color: 'var(--text)' }}>
            {data.translation}
          </p>
          <p className="t-micro" style={{ color: 'var(--text-secondary)' }}>
            Translated from {from} · Resonance Translate
          </p>
        </>
      ) : null}
      <button
        type="button"
        onClick={() => setShowing((s) => !s)}
        className="t-micro font-bold underline"
        style={{ color: 'var(--text-secondary)' }}
      >
        {showing ? 'Show original' : 'Show translation'}
      </button>
    </motion.div>
  );
}

/** Voice/video-note translation — fires the mutation once on mount (the
    round trip can take ~15s), then renders transcript + translation and an
    optional TTS playback button. */
export function VideoNoteTranslation({
  messageId,
  target,
  onError,
}: {
  messageId: number;
  target: string;
  onError: (unconfigured: boolean) => void;
}) {
  const reduced = useReducedMotion();
  const voiceMut = trpc.translate.voice.useMutation();
  const firedRef = useRef(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    if (firedRef.current) return;
    firedRef.current = true;
    voiceMut.mutate(
      { messageId, target },
      { onError: (err) => onError(err.data?.code === 'PRECONDITION_FAILED') },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messageId, target]);

  if (voiceMut.isPending) {
    return (
      <p
        className="t-caption flex items-center gap-1.5 px-1 pt-1 italic"
        style={{ color: 'var(--text-secondary)' }}
        role="status"
      >
        <Loader2 size={12} className="animate-spin" aria-hidden="true" />
        Listening &amp; translating…
      </p>
    );
  }
  const data = voiceMut.data;
  if (!data) return null;

  const togglePlay = () => {
    const el = audioRef.current;
    if (!el) return;
    if (playing) el.pause();
    else void el.play();
  };

  return (
    <motion.div
      className="flex max-w-[80%] flex-col items-start gap-0.5 px-1 pt-1"
      initial={{ opacity: 0, y: reduced ? 0 : 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
    >
      <p className="t-caption" style={{ color: 'var(--text-secondary)' }}>
        <span className="font-bold">Heard: </span>
        {data.transcript}
      </p>
      <p className="t-caption italic" style={{ color: 'var(--text)' }}>
        {data.translation}
      </p>
      <p className="t-micro" style={{ color: 'var(--text-secondary)' }}>
        Translated from {data.detectedSource ?? 'auto'} · Resonance Translate
      </p>
      {data.audioDataUrl && (
        <>
          <audio
            ref={audioRef}
            src={data.audioDataUrl}
            className="hidden"
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onEnded={() => setPlaying(false)}
          />
          <button
            type="button"
            onClick={togglePlay}
            className={cn(
              't-caption mt-1 flex min-h-[44px] items-center gap-1.5 rounded-full px-3.5 py-1.5',
            )}
            style={{ background: 'var(--field)', color: 'var(--text)' }}
            aria-label={playing ? 'Pause translated audio' : 'Play translated audio'}
          >
            {playing ? (
              <Pause size={12} aria-hidden="true" />
            ) : (
              <Play size={12} aria-hidden="true" />
            )}
            Play translated
          </button>
        </>
      )}
    </motion.div>
  );
}
