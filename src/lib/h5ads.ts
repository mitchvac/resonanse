/**
 * Google H5 Game Ads — Ad Placement API wrapper (V79).
 *
 * Rewarded video provider for the game-pass gate. Loaded lazily and ONLY when
 * VITE_H5_ADS_CLIENT (ca-pub-…) is configured at build time; without it the
 * app silently uses the house-ad path. VITE_H5_ADS_TEST=on enables Google's
 * placeholder test ads (data-adbreak-test) for pre-approval verification.
 *
 * The server remains the grant authority: this module only reports what the
 * player did (viewed / dismissed / no ad). The pass is granted server-side by
 * ads.completeWatch, which independently enforces the minimum watch duration.
 */

declare global {
  interface Window {
    adsbygoogle?: unknown[];
    adBreak?: (o: Record<string, unknown>) => void;
    adConfig?: (o: Record<string, unknown>) => void;
  }
}

const CLIENT = import.meta.env.VITE_H5_ADS_CLIENT as string | undefined;
const TEST_MODE = (import.meta.env.VITE_H5_ADS_TEST as string | undefined) === 'on';

/** True when a Google publisher ID was baked into this build. */
export const h5AdsConfigured = Boolean(CLIENT);

let readyPromise: Promise<boolean> | null = null;

/** Inject the Ad Placement API once. Resolves false on any load failure. */
export function loadH5Ads(): Promise<boolean> {
  if (!CLIENT) return Promise.resolve(false);
  if (readyPromise) return readyPromise;
  readyPromise = new Promise<boolean>((resolve) => {
    window.adsbygoogle = window.adsbygoogle || [];
    window.adBreak = window.adConfig = (o: Record<string, unknown>) => {
      (window.adsbygoogle as unknown[]).push(o);
    };
    // index.html already loads adsbygoogle.js for site verification (V80) —
    // reuse that tag; only inject when absent (older cached HTML, tests).
    const existing = document.querySelector('script[src*="pagead/js/adsbygoogle.js"]');
    if (!existing) {
      const script = document.createElement('script');
      script.crossOrigin = 'anonymous';
      if (TEST_MODE) script.setAttribute('data-adbreak-test', 'on');
      // Never auto-fire interstitials — we only call rewarded breaks manually.
      script.setAttribute('data-ad-frequency-hint', '120s');
      script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${CLIENT}`;
      script.onerror = () => resolve(false);
      document.head.appendChild(script);
    }
    const timeout = window.setTimeout(() => resolve(false), 8000);
    window.adConfig!({
      preloadAdBreaks: 'on',
      sound: 'on',
      onReady: () => {
        window.clearTimeout(timeout);
        resolve(true);
      },
    });
  });
  return readyPromise;
}

export type RewardOutcome =
  | 'viewed' // full ad watched — eligible to claim (server still verifies)
  | 'dismissed' // player closed the ad early — no reward
  | 'no-fill' // Google had no ad to show — caller falls back to house ad
  | 'unavailable'; // API broken/missing — caller falls back to house ad

/**
 * Play one rewarded ad break. The callback fires exactly once.
 * Docs: https://developers.google.com/ad-placement/apis/adbreak
 */
export function playRewardedAd(cb: (outcome: RewardOutcome) => void): void {
  if (!window.adBreak) {
    cb('unavailable');
    return;
  }
  let decided = false;
  const done = (o: RewardOutcome) => {
    if (!decided) {
      decided = true;
      cb(o);
    }
  };
  try {
    window.adBreak({
      type: 'reward',
      name: 'game-pass',
      // Ad is available → play it immediately (player already opted in).
      beforeReward: (showAdFn: () => void) => showAdFn(),
      adViewed: () => done('viewed'),
      adDismissed: () => done('dismissed'),
      // adBreakDone always fires (even after viewed/dismissed); `done` is
      // idempotent, so this only decides when nothing else did → no fill.
      adBreakDone: () => done('no-fill'),
    });
  } catch {
    done('unavailable');
  }
}
