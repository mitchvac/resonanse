import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { Loader2, Play } from 'lucide-react';
import { trpc } from '@/providers/trpc';
import type { ChatMessage } from '@/components/chat/types';
import { relTime } from '@/components/chat/types';
import { cn } from '@/lib/utils';

/**
 * VideoNoteBubble — glass video bubble for `kind: "video_note"` messages.
 * 16:9 dark thumb + play button + duration chip + LIVE CAMERA chip. The
 * heavy payload lazy-loads on first tap (`chat.videoNote`), then swaps in
 * an inline <video controls playsInline>. Own bubbles get a violet ring.
 */

type VideoNoteMeta = { noteId?: number; durationSec?: number };

function formatDuration(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  return `0:${String(s).padStart(2, '0')}`;
}

export default function VideoNoteBubble({
  message,
  own,
  index,
}: {
  message: ChatMessage;
  own: boolean;
  index: number;
}) {
  const { t } = useTranslation('connect');
  const meta = (message.meta as VideoNoteMeta | null) ?? {};
  const noteId = meta.noteId ?? 0;
  const durationSec = meta.durationSec ?? 0;
  const [requested, setRequested] = useState(false);

  const noteQuery = trpc.chat.videoNote.useQuery(
    { noteId },
    { enabled: requested && noteId > 0, retry: false, staleTime: Infinity },
  );

  const noteData = noteQuery.data?.data;
  const ready = !!noteData;

  return (
    <motion.div
      className={cn('flex w-full', own ? 'justify-end' : 'justify-start')}
      initial={{ opacity: 0, y: 12, scale: own ? 1 : 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{
        duration: 0.24,
        delay: Math.min(index, 7) * 0.04,
        ease: [0.22, 1, 0.36, 1],
      }}
    >
      <div className={cn('flex max-w-[80%] flex-col', own ? 'items-end' : 'items-start')}>
        <div
          className={cn(
            'w-[240px] overflow-hidden rounded-[24px]',
            own ? 'rounded-br-[4px]' : 'rounded-bl-[4px]',
          )}
          style={{
            background: 'var(--glass-a)',
            border: 'var(--glass-quiet-border)',
            boxShadow: own
              ? '0 0 0 1.5px var(--violet), var(--glass-hi), var(--glass-lo)'
              : 'var(--glass-hi), var(--glass-lo)',
          }}
        >
          {ready ? (
            <video
              src={noteData}
              controls
              playsInline
              className="aspect-video w-full bg-[#07070D] object-cover"
            />
          ) : (
            <button
              type="button"
              onClick={() => {
                if (noteQuery.error) void noteQuery.refetch();
                else setRequested(true);
              }}
              className="relative block aspect-video w-full bg-[#07070D]"
              aria-label={t('videoNote.playAria', { seconds: durationSec })}
            >
              {/* LIVE CAMERA chip */}
              <span
                className="t-micro absolute left-2 top-2 flex items-center gap-1 rounded-full px-2 py-0.5 text-white/85"
                style={{ background: 'rgba(255,255,255,0.14)' }}
              >
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: '#63D98A' }} aria-hidden="true" />
                {t('videoNote.liveCamera')}
              </span>
              {/* Duration chip */}
              <span
                className="t-micro absolute bottom-2 right-2 rounded-full px-2 py-0.5 text-white/85"
                style={{ background: 'rgba(255,255,255,0.14)' }}
              >
                {formatDuration(durationSec)}
              </span>
              {/* Play / loading */}
              <span className="absolute inset-0 flex items-center justify-center">
                <span
                  className="flex h-12 w-12 items-center justify-center rounded-full text-white"
                  style={{ background: 'var(--violet)', boxShadow: 'var(--violet-glow)' }}
                >
                  {requested && noteQuery.isLoading ? (
                    <Loader2 size={20} className="animate-spin" aria-label={t('videoNote.loading')} />
                  ) : (
                    <Play size={20} className="ml-0.5" aria-hidden="true" />
                  )}
                </span>
              </span>
              {requested && noteQuery.error && (
                <span className="t-caption absolute inset-x-3 bottom-8 text-center text-white/75">
                  {t('videoNote.loadError')}
                </span>
              )}
            </button>
          )}
        </div>
        <span className="t-caption mt-1 px-1" style={{ color: 'var(--text-secondary)' }}>
          {relTime(message.createdAt, t)}
        </span>
      </div>
    </motion.div>
  );
}
