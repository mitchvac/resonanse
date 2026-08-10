import { useTranslation } from 'react-i18next';
import { BadgeCheck, Check, Clapperboard, IdCard, Minus, Shield, Video } from 'lucide-react';
import GlassSheet from '@/components/GlassSheet';
import { BtnGhost, BtnGlass, BtnPrimary } from '@/components/ui/buttons';

/**
 * TrustSheet — "Ways to verify {peer}" (chat trust surface).
 * Live status of the three identity checks: Photo verified (live selfie),
 * ID verified (government ID, in-browser scan), Video verified (this match
 * completed a 30s+ live video call). CTAs start the remaining checks.
 */

export type TrustCheckState = {
  photoVerified: boolean;
  idVerified: boolean;
  videoVerified: boolean;
};

function CheckRow({
  icon: Icon,
  name,
  explainer,
  ok,
}: {
  icon: typeof BadgeCheck;
  name: string;
  explainer: string;
  ok: boolean;
}) {
  const { t } = useTranslation('connect');
  return (
    <li
      className="flex items-center gap-3 rounded-[16px] px-3.5 py-3"
      style={{ background: 'var(--field)' }}
    >
      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
        style={{ background: 'var(--field)', color: ok ? 'var(--ok)' : 'var(--text-secondary)' }}
        aria-hidden="true"
      >
        <Icon size={17} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="t-value block font-bold" style={{ color: 'var(--text)' }}>
          {name}
        </span>
        <span className="t-caption block" style={{ color: 'var(--text-secondary)' }}>
          {explainer}
        </span>
      </span>
      {ok ? (
        <span
          className="t-micro flex shrink-0 items-center gap-1 font-bold"
          style={{ color: 'var(--ok)' }}
          aria-label={t('trust.done', { name })}
        >
          <Check size={11} strokeWidth={3} aria-hidden="true" />
          {t('trust.verified')}
        </span>
      ) : (
        <span
          className="t-micro flex shrink-0 items-center gap-1"
          style={{ color: 'var(--text-secondary)' }}
          aria-label={t('trust.notYet', { name })}
        >
          <Minus size={11} aria-hidden="true" />
          {t('trust.notYetLabel')}
        </span>
      )}
    </li>
  );
}

export default function TrustSheet({
  open,
  onClose,
  peerName,
  state,
  onVideoCall,
  onVideoNote,
  onSafety,
}: {
  open: boolean;
  onClose: () => void;
  peerName: string;
  state: TrustCheckState;
  onVideoCall: () => void;
  onVideoNote: () => void;
  onSafety: () => void;
}) {
  const { t } = useTranslation('connect');
  return (
    <GlassSheet open={open} onClose={onClose} labelledBy="trust-title">
      <div className="px-5 pb-7 pt-1">
        <h2 id="trust-title" className="t-title flex items-center gap-2" style={{ color: 'var(--text)' }}>
          <Shield size={19} style={{ color: 'var(--violet)' }} aria-hidden="true" />
          {t('trust.title', { name: peerName })}
        </h2>
        <p className="t-caption mt-1.5" style={{ color: 'var(--text-secondary)' }}>
          {t('trust.caption')}
        </p>

        <ul className="mt-4 flex flex-col gap-2">
          <CheckRow
            icon={BadgeCheck}
            name={t('trust.photoName')}
            explainer={t('trust.photoExplainer')}
            ok={state.photoVerified}
          />
          <CheckRow
            icon={IdCard}
            name={t('trust.idName')}
            explainer={t('trust.idExplainer')}
            ok={state.idVerified}
          />
          <CheckRow
            icon={Video}
            name={t('trust.videoName')}
            explainer={t('trust.videoExplainer')}
            ok={state.videoVerified}
          />
        </ul>

        <div className="mt-5 flex flex-col gap-2">
          <BtnPrimary onClick={onVideoCall} className="h-12 w-full">
            <Video size={16} aria-hidden="true" />
            {t('trust.startVideoCall')}
          </BtnPrimary>
          <BtnGlass onClick={onVideoNote} className="h-12 w-full">
            <Clapperboard size={16} aria-hidden="true" />
            {t('trust.sendVideoNote')}
          </BtnGlass>
          <BtnGhost onClick={onSafety} className="mx-auto">
            {t('trust.safetyReporting')}
          </BtnGhost>
        </div>
      </div>
    </GlassSheet>
  );
}
