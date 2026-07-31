import { motion } from 'framer-motion';
import { MapPin } from 'lucide-react';
import type { ChatMessage } from '@/components/chat/types';
import { cn } from '@/lib/utils';

export type DateMeta = {
  title: string;
  emoji?: string;
  description?: string;
  location?: string;
  time?: string;
  status?: 'proposed' | 'accepted' | 'declined';
};

/**
 * DateIdeaThreadCard — chat.md §4 in-thread rendering.
 * Sent date idea = glass card with a violet 1.5px ring (non-glow — the
 * thread's only glow is reserved for the plan sheet hero) + accept/decline.
 * Accept → confirmation chip "Date planned · {time}" (--ok pin icon);
 * pin stamps scale 1.4→1.
 */
export default function DateIdeaThreadCard({
  message,
  own,
  onAccept,
  onDecline,
}: {
  message: ChatMessage;
  own: boolean;
  onAccept: () => void;
  onDecline: () => void;
}) {
  const meta = (message.meta ?? {}) as DateMeta;
  const status = meta.status ?? 'proposed';

  return (
    <motion.div
      className={cn('flex w-full', own ? 'justify-end' : 'justify-start')}
      initial={{ opacity: 0, y: 12, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.38, ease: [0.34, 1.56, 0.64, 1] }}
    >
      <div
        className="w-[85%] max-w-[320px] overflow-hidden rounded-[24px] px-5 py-4"
        style={{
          background: 'var(--glass-a)',
          border: '1.5px solid var(--violet)',
          boxShadow: 'var(--glass-hi), var(--glass-lo), var(--glass-shadow)',
          color: 'var(--text)',
        }}
      >
        <div className="flex items-center gap-2">
          <span className="text-[22px] leading-none" aria-hidden="true">
            {meta.emoji ?? '🍷'}
          </span>
          <h3 className="t-title-sm">{meta.title}</h3>
        </div>
        {meta.description && (
          <p className="t-body mt-2" style={{ color: 'var(--text)' }}>
            {meta.description}
          </p>
        )}
        <div
          className="t-caption mt-2 flex items-center gap-1.5"
          style={{ color: 'var(--text-secondary)' }}
        >
          <MapPin size={12} aria-hidden="true" />
          {[meta.location, meta.time].filter(Boolean).join(' · ')}
        </div>

        {status === 'accepted' ? (
          <div
            className="mt-3 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5"
            style={{ background: 'var(--field)' }}
          >
            <motion.span
              initial={{ scale: 1.4 }}
              animate={{ scale: 1 }}
              transition={{ duration: 0.32, ease: [0.34, 1.56, 0.64, 1] }}
              className="flex"
            >
              <MapPin size={13} style={{ color: 'var(--ok)' }} aria-hidden="true" />
            </motion.span>
            <span className="t-caption font-bold" style={{ color: 'var(--ok)' }}>
              Date planned{meta.time ? ` · ${meta.time}` : ''}
            </span>
          </div>
        ) : status === 'declined' ? (
          <p className="t-caption mt-3" style={{ color: 'var(--text-secondary)' }}>
            Declined — no worries, another idea will land.
          </p>
        ) : own ? (
          <p className="t-caption mt-3" style={{ color: 'var(--text-secondary)' }}>
            Proposed — waiting for a response…
          </p>
        ) : (
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={onAccept}
              className="t-button h-10 min-h-[44px] flex-1 rounded-full text-white"
              style={{ background: 'var(--violet)' }}
            >
              Accept
            </button>
            <button
              type="button"
              onClick={onDecline}
              className="t-button h-10 min-h-[44px] flex-1 rounded-full"
              style={{ background: 'var(--field)', color: 'var(--text)' }}
            >
              Decline
            </button>
          </div>
        )}
      </div>
    </motion.div>
  );
}
