import { useCallback, useEffect, useRef, useState } from 'react';
import { Clapperboard, Sparkles, X } from 'lucide-react';
import GlassSheet from '@/components/GlassSheet';
import { BtnGlass, BtnPrimary } from '@/components/ui/buttons';
import { trpc } from '@/providers/trpc';

/**
 * AdWatchModal — rewarded-ad gate for community games (V78).
 *
 * Flow: open → startWatch (server starts a rate-limited watch session) →
 * 20s non-skippable house ad → Claim → completeWatch (server verifies ≥15s
 * elapsed, grants 1 game pass). The server is the source of truth for watch
 * duration and grants — the client countdown is cosmetic only.
 *
 * Network-agnostic: the creative below is a Resonance house ad. A real ad
 * network (web offerwall / Google H5 game ads) later replaces the creative —
 * its completion callback calls the same completeWatch mutation.
 */

type Stage = 'starting' | 'playing' | 'claimable' | 'claiming' | 'granted' | 'error';

export default function AdWatchModal({
  open,
  onClose,
  onGranted,
}: {
  open: boolean;
  onClose: () => void;
  onGranted: () => void;
}) {
  const [stage, setStage] = useState<Stage>('starting');
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');
  const watchId = useRef<number | null>(null);
  const adLength = useRef(1);

  const startMut = trpc.ads.startWatch.useMutation();
  const completeMut = trpc.ads.completeWatch.useMutation();

  // Kick off a watch session whenever the sheet opens.
  useEffect(() => {
    if (!open) return;
    setStage('starting');
    setErrorMsg('');
    watchId.current = null;
    startMut.mutate(undefined, {
      onSuccess: (res) => {
        watchId.current = res.watchId;
        adLength.current = Math.max(1, res.adLengthSeconds);
        setSecondsLeft(res.adLengthSeconds);
        setStage('playing');
      },
      onError: (err) => {
        setErrorMsg(
          err.data?.code === 'CONFLICT'
            ? 'You’ve banked the maximum 5 game passes — play a game first.'
            : err.data?.code === 'TOO_MANY_REQUESTS'
              ? 'Easy — one ad at a time. Try again in a few seconds.'
              : 'Couldn’t start the ad. Please try again.',
        );
        setStage('error');
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Cosmetic countdown — the server independently enforces MIN_WATCH_SECONDS.
  useEffect(() => {
    if (stage !== 'playing') return;
    if (secondsLeft <= 0) {
      setStage('claimable');
      return;
    }
    const id = window.setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => window.clearTimeout(id);
  }, [stage, secondsLeft]);

  const claim = useCallback(() => {
    if (watchId.current == null) return;
    setStage('claiming');
    completeMut.mutate(
      { watchId: watchId.current },
      {
        onSuccess: () => {
          setStage('granted');
          onGranted();
        },
        onError: (err) => {
          setErrorMsg(
            err.data?.code === 'BAD_REQUEST'
              ? 'The full ad hasn’t finished yet.'
              : err.data?.code === 'CONFLICT'
                ? err.message
                : 'Couldn’t grant the pass. Please try again.',
          );
          setStage('error');
        },
      },
    );
  }, [completeMut, onGranted]);

  // Non-skippable: closing is disabled while the ad plays.
  const requestClose = useCallback(() => {
    if (stage === 'playing' || stage === 'starting') return;
    onClose();
  }, [stage, onClose]);

  return (
    <GlassSheet open={open} onClose={requestClose} labelledBy="ad-watch-title">
      <div className="px-6 pb-8 pt-2">
        <div className="flex items-center justify-between">
          <p className="t-eyebrow">WATCH · EARN · PLAY</p>
          {(stage === 'granted' || stage === 'error' || stage === 'claimable') && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="flex min-h-[44px] min-w-[44px] items-center justify-center"
              style={{ color: 'var(--text-secondary)' }}
            >
              <X size={18} aria-hidden="true" />
            </button>
          )}
        </div>

        <h2 id="ad-watch-title" className="t-title-sm mt-1">
          One ad = one game.
        </h2>
        <p className="t-caption mt-1" style={{ color: 'var(--text-secondary)' }}>
          Watch to the end and a game pass drops into your account. No coins, no purchases.
        </p>

        {/* ---- Ad creative slot (house ad; real network slot plugs in here) ---- */}
        <div
          className="relative mt-4 overflow-hidden rounded-[20px] p-5"
          style={{
            background:
              'radial-gradient(120% 90% at 50% -10%, rgba(255,206,138,.22), transparent 70%), linear-gradient(165deg, #241812 0%, #14100C 60%, #0C0A08 100%)',
            boxShadow: 'inset 0 0 0 1px rgba(255,206,138,.25)',
          }}
          aria-label="Advertisement"
        >
          <span
            className="absolute right-3 top-3 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em]"
            style={{ background: 'rgba(255,255,255,.08)', color: 'rgba(255,235,205,.75)' }}
          >
            Ad · Resonance
          </span>
          <Sparkles size={22} style={{ color: '#FFD88F' }} aria-hidden="true" />
          <p className="mt-2 text-[17px] font-semibold" style={{ color: '#FFF3E0' }}>
            Resonance+ removes this ad.
          </p>
          <p className="t-caption mt-1" style={{ color: 'rgba(255,235,205,.72)' }}>
            Unlimited games, no ad breaks, and every table unlocked — free with any plan.
          </p>

          {/* Countdown / state inside the ad slot */}
          <div className="mt-4 flex items-center gap-3">
            <Clapperboard size={18} style={{ color: 'rgba(255,235,205,.6)' }} aria-hidden="true" />
            {stage === 'starting' && (
              <p className="t-caption" style={{ color: 'rgba(255,235,205,.8)' }}>Loading your ad…</p>
            )}
            {stage === 'playing' && (
              <p className="t-caption" style={{ color: 'rgba(255,235,205,.8)' }} aria-live="polite">
                Ad playing · {secondsLeft}s left — keep this open
              </p>
            )}
            {stage === 'claimable' && (
              <p className="t-caption" style={{ color: '#9BE8B8' }}>Ad finished — claim your game below.</p>
            )}
            {stage === 'claiming' && (
              <p className="t-caption" style={{ color: 'rgba(255,235,205,.8)' }}>Granting your pass…</p>
            )}
            {stage === 'granted' && (
              <p className="t-caption" style={{ color: '#9BE8B8' }}>+1 game pass added. Have fun!</p>
            )}
            {stage === 'error' && (
              <p className="t-caption" style={{ color: '#FF9C9C' }}>{errorMsg}</p>
            )}
          </div>

          {/* Progress bar */}
          <div className="mt-3 h-1.5 overflow-hidden rounded-full" style={{ background: 'rgba(255,255,255,.10)' }}>
            <div
              className="h-full rounded-full transition-[width] duration-1000 ease-linear"
              style={{
                width:
                  stage === 'playing'
                    ? `${(1 - secondsLeft / adLength.current) * 100}%`
                    : stage === 'claimable' || stage === 'claiming' || stage === 'granted'
                      ? '100%'
                      : '0%',
                background: 'linear-gradient(90deg, #FFD88F, #FFB46A)',
              }}
            />
          </div>
        </div>

        {stage === 'claimable' && (
          <BtnPrimary className="mt-4 w-full" onClick={claim}>
            Claim 1 game
          </BtnPrimary>
        )}
        {stage === 'granted' && (
          <BtnPrimary className="mt-4 w-full" onClick={onClose}>
            Back to the table
          </BtnPrimary>
        )}
        {stage === 'error' && (
          <BtnGlass className="mt-4 w-full" onClick={onClose}>
            Close
          </BtnGlass>
        )}
      </div>
    </GlassSheet>
  );
}
