import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Flag, Ban, Share2, BookOpen, Check } from 'lucide-react';
import GlassSheet from '@/components/GlassSheet';
import { trpc } from '@/providers/trpc';
import { firstNameOf } from '@/components/chat/types';
import { cn } from '@/lib/utils';

const REASONS = ['Spam', 'Abuse', 'Fake', 'Under 18', 'Other'];

/**
 * SafetySheet — chat.md §6
 * Report (reason chips + optional text) · Block (quiet, immediate, "They
 * won't be notified") · Share chat with a friend (emergency context link) ·
 * Learn about consent tools (resource links).
 */
export default function SafetySheet({
  open,
  onClose,
  peerUserId,
  peerName,
  onToast,
}: {
  open: boolean;
  onClose: () => void;
  peerUserId: number | null;
  peerName?: string | null;
  onToast: (text: string) => void;
}) {
  const navigate = useNavigate();
  const [reason, setReason] = useState<string | null>(null);
  const [detail, setDetail] = useState('');
  const report = trpc.safety.report.useMutation();
  const block = trpc.safety.block.useMutation();
  const name = firstNameOf(peerName);

  const submitReport = () => {
    if (!peerUserId || !reason) return;
    report.mutate(
      { targetUserId: peerUserId, reason, detail: detail.trim() || undefined },
      {
        onSuccess: () => {
          onToast('Report sent — our team will review.');
          onClose();
        },
      },
    );
  };

  const doBlock = () => {
    if (!peerUserId) return;
    block.mutate(
      { targetUserId: peerUserId },
      {
        onSuccess: () => {
          onToast(`${name} blocked. They won't be notified.`);
          onClose();
          navigate('/matches');
        },
      },
    );
  };

  const shareChat = () => {
    const link = `${window.location.origin}${window.location.pathname}`;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(link).catch(() => undefined);
    }
    onToast('Emergency context link copied.');
  };

  return (
    <GlassSheet open={open} onClose={onClose} labelledBy="safety-title">
      <div className="max-h-[74dvh] overflow-y-auto px-5 pb-6 pt-1">
        <h2 id="safety-title" className="t-title" style={{ color: 'var(--text)' }}>
          Safety tools
        </h2>

        {/* Report */}
        <section className="mt-4">
          <p className="t-caption flex items-center gap-1.5 font-bold" style={{ color: 'var(--text)' }}>
            <Flag size={13} style={{ color: 'var(--danger)' }} aria-hidden="true" />
            Report {name}
          </p>
          <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="Report reason">
            {REASONS.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setReason(r)}
                className={cn('t-caption min-h-[44px] rounded-full px-3 py-1.5', reason === r && 'font-bold')}
                style={{
                  background: 'var(--field)',
                  color: 'var(--text)',
                  boxShadow: reason === r ? 'inset 0 0 0 1.5px var(--violet)' : 'none',
                }}
                aria-pressed={reason === r}
              >
                {r}
              </button>
            ))}
          </div>
          <textarea
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
            rows={2}
            placeholder="Anything else we should know? (optional)"
            className="t-body mt-2 w-full resize-none rounded-2xl px-3.5 py-2.5 outline-none focus:ring-1 focus:ring-[var(--violet)]"
            style={{ background: 'var(--field)', color: 'var(--text)' }}
            aria-label="Report details"
          />
          <button
            type="button"
            onClick={submitReport}
            disabled={!reason || !peerUserId || report.isPending}
            className="t-button mt-2 h-11 min-h-[44px] w-full rounded-full disabled:opacity-50"
            style={{ color: 'var(--danger)', boxShadow: 'inset 0 0 0 1px var(--danger)' }}
          >
            {report.isPending ? 'Sending…' : 'Send report'}
          </button>
        </section>

        {/* Block */}
        <section
          className="mt-5 border-t pt-4"
          style={{ borderColor: 'var(--ring-stroke)' }}
        >
          <p className="t-caption flex items-center gap-1.5 font-bold" style={{ color: 'var(--text)' }}>
            <Ban size={13} style={{ color: 'var(--danger)' }} aria-hidden="true" />
            Block {name}
          </p>
          <p className="t-caption mt-1" style={{ color: 'var(--text-secondary)' }}>
            Quiet and immediate. They won't be notified.
          </p>
          <button
            type="button"
            onClick={doBlock}
            disabled={!peerUserId || block.isPending}
            className="t-button mt-2 h-11 min-h-[44px] w-full rounded-full disabled:opacity-50"
            style={{ color: 'var(--danger)', boxShadow: 'inset 0 0 0 1px var(--danger)' }}
          >
            {block.isPending ? 'Blocking…' : `Block ${name}`}
          </button>
        </section>

        {/* Share + consent resources */}
        <section
          className="mt-5 border-t pt-4"
          style={{ borderColor: 'var(--ring-stroke)' }}
        >
          <button
            type="button"
            onClick={shareChat}
            className="t-button flex min-h-[44px] w-full items-center gap-2 rounded-2xl px-3.5 py-2.5 text-left"
            style={{ background: 'var(--field)', color: 'var(--text)' }}
          >
            <Share2 size={15} aria-hidden="true" />
            Share chat with a friend
          </button>
          <a
            href="https://www.rainn.org/articles/what-is-consent"
            target="_blank"
            rel="noreferrer"
            className="t-button mt-2 flex min-h-[44px] w-full items-center gap-2 rounded-2xl px-3.5 py-2.5"
            style={{ background: 'var(--field)', color: 'var(--text)' }}
          >
            <BookOpen size={15} aria-hidden="true" />
            Learn about consent tools
          </a>
          {report.isSuccess && (
            <p className="t-caption mt-2 flex items-center gap-1.5" style={{ color: 'var(--ok)' }}>
              <Check size={12} aria-hidden="true" /> Report received.
            </p>
          )}
        </section>
      </div>
    </GlassSheet>
  );
}
