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
          aria-label={`${name}: done`}
        >
          <Check size={11} strokeWidth={3} aria-hidden="true" />
          VERIFIED
        </span>
      ) : (
        <span
          className="t-micro flex shrink-0 items-center gap-1"
          style={{ color: 'var(--text-secondary)' }}
          aria-label={`${name}: not yet`}
        >
          <Minus size={11} aria-hidden="true" />
          NOT YET
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
  return (
    <GlassSheet open={open} onClose={onClose} labelledBy="trust-title">
      <div className="px-5 pb-7 pt-1">
        <h2 id="trust-title" className="t-title flex items-center gap-2" style={{ color: 'var(--text)' }}>
          <Shield size={19} style={{ color: 'var(--violet)' }} aria-hidden="true" />
          Ways to verify {peerName}
        </h2>
        <p className="t-caption mt-1.5" style={{ color: 'var(--text-secondary)' }}>
          Three independent checks — the more that are green, the surer you can be.
        </p>

        <ul className="mt-4 flex flex-col gap-2">
          <CheckRow
            icon={BadgeCheck}
            name="Photo verified"
            explainer="A live selfie matched their profile photos."
            ok={state.photoVerified}
          />
          <CheckRow
            icon={IdCard}
            name="ID verified"
            explainer="Government ID checked in their browser — the photo is never stored."
            ok={state.idVerified}
          />
          <CheckRow
            icon={Video}
            name="Video verified"
            explainer="You two talked on a live video call for 30+ seconds."
            ok={state.videoVerified}
          />
        </ul>

        <div className="mt-5 flex flex-col gap-2">
          <BtnPrimary onClick={onVideoCall} className="h-12 w-full">
            <Video size={16} aria-hidden="true" />
            Start a video call
          </BtnPrimary>
          <BtnGlass onClick={onVideoNote} className="h-12 w-full">
            <Clapperboard size={16} aria-hidden="true" />
            Send a video note
          </BtnGlass>
          <BtnGhost onClick={onSafety} className="mx-auto">
            Safety &amp; reporting
          </BtnGhost>
        </div>
      </div>
    </GlassSheet>
  );
}
