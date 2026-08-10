import { useState } from 'react';
import type { MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { Flag, Heart, Share2, Sparkle, X } from 'lucide-react';
import { LipsIcon, RoseIcon, WaveHandIcon } from '@/components/gestures/icons';
import GlassSheet from '@/components/GlassSheet';
import GlassCard from '@/components/GlassCard';
import AppToast from '@/components/AppToast';
import type { ToastPayload } from '@/components/AppToast';
import VerifiedBadge from '@/components/discover/VerifiedBadge';
import Chip from '@/components/discover/Chip';
import { BtnGlass } from '@/components/ui/buttons';
import CompatibilityArc from '@/components/discover/CompatibilityArc';
import { trpc } from '@/providers/trpc';
import { cn } from '@/lib/utils';
import type { QueueProfile } from '@/components/discover/types';

/* Report reasons are DATA sent to safety.report — never translated.
   Display labels come from the discover namespace via REPORT_KEYS. */
const REPORT_REASONS = ['Spam', 'Abuse', 'Fake', 'Under 18', 'Other'];
const REPORT_KEYS: Record<string, string> = {
  Spam: 'spam',
  Abuse: 'abuse',
  Fake: 'fake',
  'Under 18': 'under18',
  Other: 'other',
};

/**
 * ProfileSheet — discover.md §3
 * Full-height GlassSheet: photo pager (dots, crossfade 240ms), name+age+
 * VerifiedBadge, intent/status chips, prompt GlassCards (stagger 70ms),
 * lifestyle/values chips, distance + "Active today" (--ok dot).
 * Sticky footer: Pass ghost · Wave (glass, "say hi") · Flower (glass, count
 * badge) · Like (violet) · Pulse (glass w/ violet spark).
 * Safety row: share profile, report/block.
 */
export default function ProfileSheet({
  open,
  profile,
  compatibility,
  distance,
  pending,
  flowersLeft = null,
  kissesLeft = null,
  onPass,
  onLike,
  onPulse,
  onRose,
  onKiss,
  onWave,
  onClose,
}: {
  open: boolean;
  profile: QueueProfile | null;
  compatibility: number;
  distance?: string;
  pending?: boolean;
  flowersLeft?: number | null;
  kissesLeft?: number | null;
  onPass: () => void;
  onLike: (e?: MouseEvent) => void;
  onPulse: () => void;
  /** opens the RoseSheet popup (one rose / a dozen) — never sends directly */
  onRose: (e?: MouseEvent) => void;
  onKiss: (e?: MouseEvent) => void;
  onWave: (e?: MouseEvent) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation('discover');
  const [photoIndex, setPhotoIndex] = useState(0);
  const [safetyOpen, setSafetyOpen] = useState(false);
  const [reason, setReason] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastPayload | null>(null);
  const utils = trpc.useUtils();
  const report = trpc.safety.report.useMutation();
  const block = trpc.safety.block.useMutation();
  const photos = profile?.photos?.length ? profile.photos : ['/avatar-01.jpg'];

  if (!profile) return <GlassSheet open={open} onClose={onClose}>{null}</GlassSheet>;

  const showToast = (message: string) => setToast({ id: Date.now(), message });

  const shareProfile = () => {
    const link = `${window.location.origin}/discover?profile=${profile.id}`;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(link).catch(() => undefined);
    }
    showToast(t('toasts.linkCopied'));
  };

  const submitReport = () => {
    if (!reason) return;
    report.mutate(
      { targetUserId: profile.userId, reason },
      {
        onSuccess: () => {
          setSafetyOpen(false);
          setReason(null);
          showToast(t('toasts.reportSent'));
        },
      },
    );
  };

  const doBlock = () => {
    block.mutate(
      { targetUserId: profile.userId },
      {
        onSuccess: () => {
          setSafetyOpen(false);
          setReason(null);
          void utils.discover.queue.invalidate();
          showToast(t('toasts.blocked', { name: profile.displayName.split(' ')[0] }));
          onClose();
        },
      },
    );
  };

  const lifestyle = Object.values(profile.lifestyle ?? {}).filter(Boolean) as string[];
  const chips = [
    profile.relationshipGoal,
    profile.relationshipStatus,
    ...(profile.desires ?? []),
  ].filter(Boolean) as string[];

  return (
    <>
    <GlassSheet open={open} onClose={onClose} labelledBy="profile-sheet-name">
      <div className="flex max-h-[85dvh] flex-col">
        <div className="flex-1 overflow-y-auto px-5 pb-4">
          {/* photo pager */}
          <div className="relative mt-2 aspect-[4/5] overflow-hidden rounded-[16px]">
            <AnimatePresence mode="wait">
              <motion.img
                key={photoIndex}
                src={photos[photoIndex % photos.length]}
                alt={t('profileSheet.photoAlt', { index: photoIndex + 1, name: profile.displayName })}
                className="absolute inset-0 h-full w-full object-cover"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.24 }}
              />
            </AnimatePresence>
            {photos.length > 1 && (
              <div className="absolute inset-x-0 bottom-3 flex justify-center gap-1.5">
                {photos.map((_, i) => (
                  <button
                    key={i}
                    type="button"
                    aria-label={t('profileSheet.photoDot', { index: i + 1 })}
                    onClick={() => setPhotoIndex(i)}
                    className="h-1.5 rounded-full transition-all duration-fast"
                    style={{
                      width: i === photoIndex ? 20 : 8,
                      background: i === photoIndex ? 'var(--violet)' : 'rgba(255,255,255,0.6)',
                    }}
                  />
                ))}
              </div>
            )}
          </div>

          {/* identity */}
          <div className="mt-4 flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-1.5">
                <h2 id="profile-sheet-name" className="t-title" style={{ color: 'var(--text)' }}>
                  {profile.displayName}, {profile.age}
                </h2>
                {profile.verified && <VerifiedBadge size={18} />}
              </div>
              <p className="t-caption mt-1 flex items-center gap-1.5" style={{ color: 'var(--text-secondary)' }}>
                {[distance, profile.city].filter(Boolean).join(' · ')}
                <span
                  className="inline-block h-1.5 w-1.5 rounded-full"
                  style={{ background: 'var(--ok)' }}
                  aria-hidden="true"
                />
                <span style={{ color: 'var(--ok)' }}>{t('profileSheet.activeToday')}</span>
              </p>
            </div>
            <CompatibilityArc value={compatibility} size={48} animateKey={profile.id} />
          </div>

          {chips.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {chips.map((c) => (
                <Chip key={c}>{c}</Chip>
              ))}
            </div>
          )}

          {profile.bio && (
            <p className="t-body mt-4" style={{ color: 'var(--text)' }}>
              {profile.bio}
            </p>
          )}

          {/* prompts as stacked GlassCards */}
          {(profile.prompts ?? []).map((prompt, i) => (
            <motion.div
              key={prompt.question}
              className="mt-3"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.07 * i, duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
            >
              <GlassCard edge="none" className="rounded-[20px] p-4">
                <p className="t-micro" style={{ color: 'var(--text-secondary)' }}>
                  {prompt.question}
                </p>
                <p className="t-value mt-1.5" style={{ color: 'var(--text)' }}>
                  {prompt.answer}
                </p>
              </GlassCard>
            </motion.div>
          ))}

          {lifestyle.length > 0 && (
            <>
              <p className="t-eyebrow mt-5">{t('profileSheet.lifestyle')}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {lifestyle.map((l) => (
                  <Chip key={l}>{l}</Chip>
                ))}
              </div>
            </>
          )}

          {/* safety row */}
          <div className="mt-5 flex items-center justify-center gap-6 pb-2">
            <button
              type="button"
              onClick={shareProfile}
              className="t-caption flex items-center gap-1.5"
              style={{ color: 'var(--text-secondary)' }}
              aria-label={t('profileSheet.shareAria')}
            >
              <Share2 size={14} aria-hidden="true" /> {t('profileSheet.share')}
            </button>
            <button
              type="button"
              onClick={() => setSafetyOpen(true)}
              className="t-caption flex items-center gap-1.5"
              style={{ color: 'var(--danger)' }}
              aria-label={t('profileSheet.reportBlockAria')}
            >
              <Flag size={14} aria-hidden="true" /> {t('profileSheet.reportBlock')}
            </button>
          </div>
        </div>

        {/* sticky footer — every gesture lives here: Pass · Wave · Flower · Like · Pulse */}
        <div
          className="flex items-center gap-2 border-t px-4 py-4"
          style={{ borderColor: 'var(--ring-stroke)' }}
        >
          <button
            type="button"
            disabled={pending}
            onClick={onPass}
            className="t-button flex items-center gap-1.5 px-2 transition-opacity duration-fast active:opacity-70 disabled:opacity-50"
            style={{ color: 'var(--text)' }}
          >
            <X size={16} aria-hidden="true" /> {t('gestures.pass')}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={onWave}
            aria-label={t('gestures.waveSayHi')}
            title={t('gestures.waveSayHi')}
            className="glass flex h-12 w-12 shrink-0 items-center justify-center rounded-full disabled:opacity-50"
          >
            <span className="glass-content flex items-center justify-center">
              <WaveHandIcon size={21} />
            </span>
          </button>
          <button
            type="button"
            disabled={pending || flowersLeft === 0}
            onClick={onRose}
            aria-label={
              flowersLeft === null
                ? t('gestures.sendRoses')
                : t('gestures.sendRosesLeft', { count: flowersLeft })
            }
            title={t('gestures.sendRoses')}
            className="glass relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full disabled:opacity-50"
          >
            <span className="glass-content flex items-center justify-center">
              <RoseIcon size={21} />
            </span>
            {flowersLeft !== null && flowersLeft < 99 && (
              <span
                className="t-micro absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-white"
                style={{ background: '#e35d7c' }}
                aria-hidden="true"
              >
                {flowersLeft}
              </span>
            )}
          </button>
          <button
            type="button"
            disabled={pending || kissesLeft === 0}
            onClick={onKiss}
            aria-label={
              kissesLeft === null
                ? t('gestures.sendKiss')
                : t('gestures.sendKissLeft', { count: kissesLeft })
            }
            title={t('gestures.sendKiss')}
            className="glass relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full disabled:opacity-50"
          >
            <span className="glass-content flex items-center justify-center">
              <LipsIcon size={21} />
            </span>
            {kissesLeft !== null && kissesLeft < 99 && (
              <span
                className="t-micro absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-white"
                style={{ background: '#d64070' }}
                aria-hidden="true"
              >
                {kissesLeft}
              </span>
            )}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={onLike}
            className="shadow-violet-glow t-button flex h-[52px] min-w-0 flex-1 items-center justify-center gap-2 rounded-full bg-violet text-white transition-transform duration-fast active:scale-[0.97] disabled:opacity-50"
          >
            <Heart size={18} fill="currentColor" strokeWidth={0} aria-hidden="true" /> {t('gestures.like')}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={onPulse}
            aria-label={t('gestures.sendPulse')}
            title={t('gestures.sendPulse')}
            className="glass flex h-12 w-12 shrink-0 items-center justify-center rounded-full disabled:opacity-50"
          >
            <span className="glass-content flex items-center justify-center">
              <Sparkle size={20} style={{ color: 'var(--violet)', fill: 'var(--violet)' }} aria-hidden="true" />
            </span>
          </button>
        </div>
      </div>
    </GlassSheet>

    {/* Report / block — reason chips pattern from chat SafetySheet */}
    <GlassSheet open={safetyOpen} onClose={() => setSafetyOpen(false)} labelledBy="profile-safety-title">
      <div className="max-h-[74dvh] overflow-y-auto px-5 pb-6 pt-1">
        <h2 id="profile-safety-title" className="t-title" style={{ color: 'var(--text)' }}>
          {t('safety.title')}
        </h2>
        <section className="mt-4">
          <p className="t-caption flex items-center gap-1.5 font-bold" style={{ color: 'var(--text)' }}>
            <Flag size={13} style={{ color: 'var(--danger)' }} aria-hidden="true" />
            {t('safety.reportName', { name: profile.displayName.split(' ')[0] })}
          </p>
          <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label={t('safety.reasonA11y')}>
            {REPORT_REASONS.map((r) => (
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
                {t(`safety.reasons.${REPORT_KEYS[r]}`)}
              </button>
            ))}
          </div>
          <div className="mt-3 flex items-center gap-3">
            <BtnGlass
              onClick={() => {
                setSafetyOpen(false);
                setReason(null);
              }}
              disabled={report.isPending}
              className="h-11 flex-1"
            >
              {t('safety.cancel')}
            </BtnGlass>
            <button
              type="button"
              onClick={submitReport}
              disabled={!reason || report.isPending}
              className="t-button h-11 min-h-[44px] flex-1 rounded-full disabled:opacity-50"
              style={{ color: 'var(--danger)', boxShadow: 'inset 0 0 0 1px var(--danger)' }}
            >
              {report.isPending ? t('safety.sending') : t('safety.sendReport')}
            </button>
          </div>
        </section>
        <section className="mt-5 border-t pt-4" style={{ borderColor: 'var(--ring-stroke)' }}>
          <p className="t-caption font-bold" style={{ color: 'var(--text)' }}>
            {t('safety.blockName', { name: profile.displayName.split(' ')[0] })}
          </p>
          <p className="t-caption mt-1" style={{ color: 'var(--text-secondary)' }}>
            {t('safety.blockNote')}
          </p>
          <button
            type="button"
            onClick={doBlock}
            disabled={block.isPending}
            className="t-button mt-2 h-11 min-h-[44px] w-full rounded-full disabled:opacity-50"
            style={{ color: 'var(--danger)', boxShadow: 'inset 0 0 0 1px var(--danger)' }}
          >
            {block.isPending ? t('safety.blocking') : t('safety.block')}
          </button>
        </section>
      </div>
    </GlassSheet>

    <AppToast toast={toast} onDismiss={() => setToast(null)} />
    </>
  );
}
