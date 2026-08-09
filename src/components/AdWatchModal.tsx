import { useCallback, useEffect, useRef, useState } from 'react';
import { Clapperboard, Sparkles, X } from 'lucide-react';
import GlassSheet from '@/components/GlassSheet';
import { BtnGlass, BtnPrimary } from '@/components/ui/buttons';
import { h5AdsConfigured, loadH5Ads, playRewardedAd } from '@/lib/h5ads';
import { trpc } from '@/providers/trpc';

/**
 * AdWatchModal — rewarded-ad gate for community games (V78 + V79 Google H5).
 *
 * Flow: open → startWatch (server starts a rate-limited watch session) →
 * play the ad → completeWatch (server verifies ≥15s elapsed, grants 1 pass).
 *
 * Ad provider (V79): when VITE_H5_ADS_CLIENT is configured, the ad is a real
 * Google H5 rewarded video (its adViewed event auto-claims, honoring the
 * server's 15s clock). On no-fill / load failure / dismissal-free exit we
 * fall back to the 20s non-skippable house ad with a manual Claim button.
 * The server is the source of truth for watch duration and grants either way.
 */

// Mirror of api/adsRouter MIN_WATCH_SECONDS — client-side scheduling only;
// the server enforces its own clock independently.
const MIN_WATCH_MS = 15_000;

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
  const [usingGoogle, setUsingGoogle] = useState(false);
  const watchId = useRef<number | null>(null);
  const adLength = useRef(1);
  const sessionStart = useRef(0);

  const startMut = trpc.ads.startWatch.useMutation();
  const completeMut = trpc.ads.completeWatch.useMutation();

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

  // House-ad fallback: cosmetic countdown, manual claim at the end.
  const startHouseCountdown = useCallback((secs: number) => {
    setUsingGoogle(false);
    setSecondsLeft(secs);
    setStage('playing');
  }, []);

  // Google H5 rewarded video: fullscreen ad managed by Google's own UI.
  const runGoogleAd = useCallback(
    async (fallbackSeconds: number) => {
      const ready = await loadH5Ads();
      if (!ready) {
        startHouseCountdown(fallbackSeconds);
        return;
      }
      setUsingGoogle(true);
      setStage('playing');
      playRewardedAd((outcome) => {
        if (outcome === 'viewed') {
          // Google confirmed the full view. Respect the server's min-duration
          // clock (a short bumper may finish before 15s) then claim.
          const wait = Math.max(0, MIN_WATCH_MS - (Date.now() - sessionStart.current));
          window.setTimeout(claim, wait);
        } else if (outcome === 'dismissed') {
          setErrorMsg('Ad closed early — no game pass this time.');
          setStage('error');
        } else {
          // no-fill / unavailable → seamless house ad
          startHouseCountdown(fallbackSeconds);
        }
      });
    },
    [claim, startHouseCountdown],
  );

  // Kick off a watch session whenever the sheet opens.
  useEffect(() => {
    if (!open) return;
    setStage('starting');
    setErrorMsg('');
    setUsingGoogle(false);
    watchId.current = null;
    startMut.mutate(undefined, {
      onSuccess: (res) => {
        watchId.current = res.watchId;
        adLength.current = Math.max(1, res.adLengthSeconds);
        sessionStart.current = Date.now();
        if (h5AdsConfigured) {
          void runGoogleAd(res.adLengthSeconds);
        } else {
          startHouseCountdown(res.adLengthSeconds);
        }
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

  // Cosmetic countdown for the HOUSE ad only — Google manages its own
  // fullscreen player. The server independently enforces MIN_WATCH_SECONDS.
  useEffect(() => {
    if (stage !== 'playing' || usingGoogle) return;
    if (secondsLeft <= 0) {
      setStage('claimable');
      return;
    }
    const id = window.setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => window.clearTimeout(id);
  }, [stage, secondsLeft, usingGoogle]);

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

        {/* ---- Ad slot: Google rewarded video runs fullscreen on its own UI;
             the house creative only renders as the fallback provider ---- */}
        {usingGoogle && (stage === 'playing' || stage === 'claiming' || stage === 'granted') ? (
          <div
            className="relative mt-4 overflow-hidden rounded-[20px] p-5"
            style={{
              background: 'linear-gradient(165deg, #1A1D24 0%, #101318 60%, #0B0D11 100%)',
              boxShadow: 'inset 0 0 0 1px rgba(160,190,255,.22)',
            }}
            aria-label="Advertisement"
          >
            <span
              className="absolute right-3 top-3 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em]"
              style={{ background: 'rgba(255,255,255,.08)', color: 'rgba(220,232,255,.75)' }}
            >
              Ad · Google
            </span>
            <Clapperboard size={22} style={{ color: '#A9C4FF' }} aria-hidden="true" />
            <p className="mt-2 text-[17px] font-semibold" style={{ color: '#EAF0FF' }}>
              {stage === 'granted'
                ? '+1 game pass added. Have fun!'
                : stage === 'claiming'
                  ? 'Verifying your view…'
                  : 'Ad playing — full screen.'}
            </p>
            <p className="t-caption mt-1" style={{ color: 'rgba(220,232,255,.7)' }} aria-live="polite">
              {stage === 'granted'
                ? 'Your seat is waiting.'
                : stage === 'claiming'
                  ? 'Adding your game pass…'
                  : 'It closes itself when it’s done. Watch to the end to earn your pass.'}
            </p>
          </div>
        ) : (
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
        )}

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
