import { useState } from 'react';
import GlassSheet from '@/components/GlassSheet';
import { BtnGlass, BtnPrimary } from '@/components/ui/buttons';
import type { QueueProfile } from '@/components/discover/types';

/**
 * CommentComposer — discover.md §1
 * Tap a specific prompt or photo → like-with-comment sheet: TextField +
 * "Send like" / "Send Pulse" (Pulse consumes 1, counter shown).
 */
export default function CommentComposer({
  open,
  profile,
  targetQuestion,
  pulsesLeft,
  pending,
  onSend,
  onClose,
}: {
  open: boolean;
  profile: QueueProfile | null;
  /** The prompt question / photo ref the comment attaches to */
  targetQuestion: string | null;
  pulsesLeft?: number | null;
  pending?: boolean;
  onSend: (action: 'like' | 'pulse', comment: string) => void;
  onClose: () => void;
}) {
  const [comment, setComment] = useState('');
  const promptAnswer = profile?.prompts?.find((p) => p.question === targetQuestion);

  return (
    <GlassSheet open={open} onClose={onClose} labelledBy="composer-title">
      <div className="px-6 pb-8 pt-2">
        <p className="t-eyebrow">Like with a comment</p>
        <h3 id="composer-title" className="t-title-sm mt-1" style={{ color: 'var(--text)' }}>
          {targetQuestion ?? `${profile?.displayName ?? 'Their'}'s profile`}
        </h3>
        {promptAnswer && (
          <p
            className="t-value mt-2 rounded-[16px] p-3"
            style={{ background: 'var(--field)', color: 'var(--text)' }}
          >
            “{promptAnswer.answer}”
          </p>
        )}
        <label htmlFor="composer-field" className="sr-only">
          Your comment
        </label>
        <textarea
          id="composer-field"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          maxLength={500}
          rows={3}
          placeholder="Say something specific…"
          className="t-value mt-4 w-full resize-none rounded-[16px] p-3.5 outline-none transition-colors duration-fast focus:ring-1 focus:ring-[var(--violet)]"
          style={{
            background: 'var(--field)',
            color: 'var(--text)',
          }}
          onFocus={(e) => (e.currentTarget.style.background = 'var(--field-focus)')}
          onBlur={(e) => (e.currentTarget.style.background = 'var(--field)')}
        />
        <div className="mt-4 flex flex-col gap-2.5">
          <BtnPrimary
            disabled={pending || comment.trim().length === 0}
            onClick={() => {
              onSend('like', comment.trim());
              setComment('');
            }}
          >
            Send like
          </BtnPrimary>
          <BtnGlass
            disabled={pending || comment.trim().length === 0 || pulsesLeft === 0}
            onClick={() => {
              onSend('pulse', comment.trim());
              setComment('');
            }}
          >
            Send Pulse{pulsesLeft != null && pulsesLeft < 900 ? ` · ${pulsesLeft} left` : ''}
          </BtnGlass>
        </div>
      </div>
    </GlassSheet>
  );
}
