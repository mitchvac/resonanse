import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { Check, CheckCheck, Hourglass, ShieldAlert } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ChatMessage } from '@/components/chat/types';
import { relTime } from '@/components/chat/types';

/**
 * MessageBubble — design.md §8.9 / chat.md §2
 * Own: violet fill, radius 24px (4px tail corner), white t-value.
 * Theirs: glass recipe, radius 24px, edge:none, var(--text). (Glass visuals
 * are kept, but bubbles skip backdrop-filter — the ≤6–8 blurred-surfaces
 * budget forbids blurring individual stream rows, §7.2.)
 * Status ticks 12px: single check sent / double check delivered /
 * --ok double check read. Ephemeral mode adds a tiny hourglass.
 */

export type TickState = 'sent' | 'delivered' | 'read';

export function Ticks({ state }: { state: TickState }) {
  const { t } = useTranslation('connect');
  if (state === 'sent') {
    return <Check size={12} style={{ color: 'var(--text-secondary)' }} aria-label={t('chat.tickSent')} />;
  }
  if (state === 'delivered') {
    return (
      <CheckCheck size={12} style={{ color: 'var(--text-secondary)' }} aria-label={t('chat.tickDelivered')} />
    );
  }
  return <CheckCheck size={12} style={{ color: 'var(--ok)' }} aria-label={t('chat.tickRead')} />;
}

export default function MessageBubble({
  message,
  own,
  tick,
  ephemeral,
  index,
}: {
  message: ChatMessage;
  own: boolean;
  tick?: TickState;
  ephemeral: boolean;
  index: number;
}) {
  const { t } = useTranslation('connect');
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
            'px-4 py-2.5',
            own
              ? 'rounded-[24px] rounded-br-[4px] text-white'
              : 'rounded-[24px] rounded-bl-[4px]',
          )}
          style={
            own
              ? { background: 'var(--violet)', boxShadow: 'var(--violet-glow)' }
              : {
                  background: 'var(--glass-a)',
                  border: 'var(--glass-quiet-border)',
                  boxShadow: 'var(--glass-hi), var(--glass-lo)',
                  color: 'var(--text)',
                }
          }
        >
          <span className="flex items-end gap-1.5">
            <span className="t-value whitespace-pre-wrap break-words">{message.content}</span>
            {ephemeral && (
              <Hourglass
                size={12}
                className="mb-0.5 shrink-0"
                style={{ color: own ? 'rgba(255,255,255,0.75)' : 'var(--warn)' }}
                aria-label={t('chat.vanishAria')}
              />
            )}
          </span>
        </div>
        <span
          className="t-caption mt-1 flex items-center gap-1 px-1"
          style={{ color: 'var(--text-secondary)' }}
        >
          {relTime(message.createdAt, t)}
          {own && tick && <Ticks state={tick} />}
        </span>
      </div>
    </motion.div>
  );
}

/**
 * SystemBubble — chat.md §5 screenshot detection.
 * Centered glass bubble, --danger shield icon, factual copy.
 * Fades in with 160ms gravity (translateY 6px).
 */
export function SystemBubble({ text }: { text: string }) {
  return (
    <motion.div
      className="flex w-full justify-center"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
    >
      <div
        className="t-caption flex items-center gap-2 rounded-full px-4 py-2"
        style={{
          background: 'var(--glass-a)',
          border: 'var(--glass-quiet-border)',
          boxShadow: 'var(--glass-hi), var(--glass-lo)',
          color: 'var(--text)',
        }}
        role="alert"
      >
        <ShieldAlert size={14} style={{ color: 'var(--danger)' }} aria-hidden="true" />
        {text}
      </div>
    </motion.div>
  );
}
