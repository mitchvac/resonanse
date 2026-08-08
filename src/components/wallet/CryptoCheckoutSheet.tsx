import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  Check,
  Clock,
  Coins,
  Copy,
  DollarSign,
  Loader2,
  TriangleAlert,
} from 'lucide-react';
import GlassSheet from '@/components/GlassSheet';
import BrandMark from '@/components/BrandMark';
import AppToast from '@/components/AppToast';
import type { ToastPayload } from '@/components/AppToast';
import { BtnGhost, BtnGlass, BtnPrimary } from '@/components/ui/buttons';
import { useWalletUtils, walletTrpc, formatCoins, formatUsdMicro, formatPriceMicro } from '@/lib/walletTrpc';
import { trpc } from '@/providers/trpc';
import type {
  PaymentIntent,
  PaymentStatusKind,
  WalletAsset,
  WalletPurpose,
} from '@/types/wallet-router';
import { cn } from '@/lib/utils';

/**
 * CryptoCheckoutSheet — wallet payment flow (design.md §8.3 sheet).
 *
 * Steps: amount (TOP_UP only, live buyQuote) → asset picker (XRP/RLUSD)
 * → payment (address + memo/tag as large copyable text — no QR lib in the
 * dependency set — exact amount, 30-min countdown from expiresAt, polls
 * paymentStatus every 5s). Statuses: waiting (pulsing) → confirmed
 * (celebration + invalidate wallet.state / premium.entitlements) → underpaid
 * (honest support copy) → expired (restart CTA).
 */

type Step = 'amount' | 'asset' | 'payment';

const ASSETS: { key: WalletAsset; label: string; caption: string; icon: typeof Coins }[] = [
  { key: 'XRP', label: 'XRP', caption: 'XRP Ledger · destination tag required', icon: Coins },
  { key: 'RLUSD', label: 'RLUSD', caption: 'USD stablecoin on the XRP Ledger', icon: DollarSign },
];

const AMOUNT_PRESETS = [10, 25, 50, 100] as const;

const PURPOSE_LABEL: Record<WalletPurpose, string> = {
  TOP_UP: 'Buy Date-Coin',
  SUBSCRIPTION_PLUS: 'Resonance+ with crypto',
  SUBSCRIPTION_X: 'Resonance X with crypto',
};

function mmss(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
}

function CopyRow({
  label,
  value,
  required,
  onCopy,
}: {
  label: string;
  value: string;
  required?: boolean;
  onCopy: (value: string) => void;
}) {
  return (
    <div className="rounded-[16px] px-4 py-3" style={{ background: 'var(--field)' }}>
      <div className="flex items-center justify-between gap-2">
        <span className="t-micro" style={{ color: 'var(--text)' }}>
          {label}
          {required && (
            <span className="ml-1.5 font-bold" style={{ color: 'var(--warn)' }}>
              REQUIRED
            </span>
          )}
        </span>
        <button
          type="button"
          onClick={() => onCopy(value)}
          className="t-caption flex min-h-[44px] items-center gap-1.5 rounded-full px-2 font-bold"
          style={{ color: 'var(--violet)' }}
          aria-label={`Copy ${label.toLowerCase()}`}
        >
          <Copy size={13} aria-hidden="true" />
          Copy
        </button>
      </div>
      <p
        className="t-value mt-1 break-all font-mono text-[15px] font-bold select-all"
        style={{ color: 'var(--text)', letterSpacing: '0.01em', overflowWrap: 'anywhere' }}
      >
        {value}
      </p>
    </div>
  );
}

export default function CryptoCheckoutSheet({
  open,
  onClose,
  purpose,
  onConfirmed,
}: {
  open: boolean;
  onClose: () => void;
  purpose: WalletPurpose;
  onConfirmed?: () => void;
}) {
  const reduced = useReducedMotion();
  const utils = trpc.useUtils();
  const walletUtils = useWalletUtils();

  const [step, setStep] = useState<Step>(purpose === 'TOP_UP' ? 'amount' : 'asset');
  const [usd, setUsd] = useState<number>(25);
  const [asset, setAsset] = useState<WalletAsset | null>(null);
  const [intent, setIntent] = useState<PaymentIntent | null>(null);
  const [toast, setToast] = useState<ToastPayload | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const confirmedFired = useRef(false);

  const showToast = useCallback((message: string, icon?: ToastPayload['icon']) => {
    setToast({ id: Date.now(), message, icon });
  }, []);

  const reset = useCallback(() => {
    setStep(purpose === 'TOP_UP' ? 'amount' : 'asset');
    setAsset(null);
    setIntent(null);
    confirmedFired.current = false;
  }, [purpose]);

  /* Reset the flow each time the sheet opens */
  useEffect(() => {
    if (open) reset();
  }, [open, reset]);

  /* — Live quote for TOP_UP amounts — */
  const quoteQuery = walletTrpc.wallet.buyQuote.useQuery(
    { usdMicro: usd * 1_000_000 },
    { enabled: open && purpose === 'TOP_UP' && step !== 'payment', retry: 1 },
  );

  /* — Only offer assets whose deposit address is really configured — */
  const assetsQuery = walletTrpc.wallet.paymentAssets.useQuery(undefined, {
    enabled: open,
    retry: 1,
    staleTime: 300_000,
  });
  const availableAssets = useMemo(
    () =>
      ASSETS.filter((a) =>
        assetsQuery.data ? assetsQuery.data.assets.includes(a.key) : true,
      ),
    [assetsQuery.data],
  );

  /* — Create the payment intent — */
  const createPayment = walletTrpc.wallet.createPayment.useMutation({
    onSuccess: (data) => {
      setIntent(data);
      setStep('payment');
    },
    onError: (err) => {
      showToast(err.message || "Couldn't start the payment — try again.");
      setAsset(null);
    },
  });

  /* — Poll payment status every 5s until a terminal state — */
  const statusQuery = walletTrpc.wallet.paymentStatus.useQuery(
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    { intentId: intent?.intentId ?? '' },
    {
      enabled: open && !!intent,
      refetchInterval: (query) => {
        const status = query.state.data?.status;
        return !status || status === 'pending' ? 5000 : false;
      },
      retry: 1,
    },
  );
  const status: PaymentStatusKind = statusQuery.data?.status ?? 'pending';

  /* — Countdown ticker — */
  const expiresAtMs = useMemo(
    () => (intent ? new Date(intent.expiresAt).getTime() : 0),
    [intent],
  );
  useEffect(() => {
    if (!open || !intent || status !== 'pending') return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [open, intent, status]);
  const secondsLeft = intent ? Math.max(0, Math.floor((expiresAtMs - now) / 1000)) : 0;

  /* — Confirmed: celebrate + refresh wallet & entitlements — */
  useEffect(() => {
    if (status !== 'confirmed' || confirmedFired.current) return;
    confirmedFired.current = true;
    void walletUtils.wallet.state.invalidate();
    void walletUtils.wallet.history.invalidate();
    void utils.premium.entitlements.invalidate();
    onConfirmed?.();
  }, [status, walletUtils, utils, onConfirmed]);

  const handleCopy = useCallback(
    (value: string) => {
      void copyText(value).then((ok) =>
        showToast(
          ok ? 'Copied to clipboard.' : 'Copy failed — long-press to select.',
          ok ? (
            <Check size={14} style={{ color: 'var(--ok)' }} aria-hidden="true" />
          ) : undefined,
        ),
      );
    },
    [showToast],
  );

  const chooseAsset = (next: WalletAsset) => {
    setAsset(next);
    createPayment.mutate({
      purpose,
      asset: next,
      ...(purpose === 'TOP_UP' ? { usdMicro: usd * 1_000_000 } : {}),
    });
  };

  const requiredBit = intent?.memoOrTag ? 'destination tag' : 'exact amount';

  return (
    <>
      <GlassSheet open={open} onClose={onClose} labelledBy="crypto-checkout-title">
        <div className="max-h-[78dvh] overflow-y-auto no-scrollbar px-5 pb-8">
          <h2 id="crypto-checkout-title" className="t-title-sm mt-2">
            {PURPOSE_LABEL[purpose]}
          </h2>

          <AnimatePresence mode="wait" initial={false}>
            {/* ============ STEP: amount (TOP_UP) ============ */}
            {step === 'amount' && (
              <motion.div
                key="amount"
                initial={{ opacity: 0, x: 24 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -24 }}
                transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
              >
                <p className="t-caption mt-1" style={{ color: 'var(--text-secondary)' }}>
                  Choose an amount — coins are credited at the live system price, which only
                  goes up.
                </p>
                <div className="mt-4 grid grid-cols-4 gap-2" role="radiogroup" aria-label="Top-up amount">
                  {AMOUNT_PRESETS.map((amount) => {
                    const active = usd === amount;
                    return (
                      <button
                        key={amount}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        onClick={() => setUsd(amount)}
                        className={cn(
                          't-button flex h-11 items-center justify-center rounded-full',
                          active && 'font-bold',
                        )}
                        style={{
                          background: 'var(--field)',
                          color: 'var(--text)',
                          boxShadow: active
                            ? '0 0 0 1.5px var(--violet), 0 4px 14px rgba(123,73,245,0.25)'
                            : undefined,
                        }}
                      >
                        ${amount}
                      </button>
                    );
                  })}
                </div>
                <div
                  className="mt-3 flex items-center justify-between rounded-[16px] px-4 py-3"
                  style={{ background: 'var(--field)' }}
                  aria-live="polite"
                >
                  {quoteQuery.isLoading ? (
                    <span className="t-caption flex items-center gap-2" style={{ color: 'var(--text-secondary)' }}>
                      <Loader2 size={14} className="animate-spin" aria-hidden="true" />
                      Getting live quote…
                    </span>
                  ) : quoteQuery.isError ? (
                    <span className="t-caption" style={{ color: 'var(--warn)' }}>
                      Live quote unavailable — you can still continue.
                    </span>
                  ) : (
                    <>
                      <span className="t-caption" style={{ color: 'var(--text-secondary)' }}>
                        {formatUsdMicro(quoteQuery.data?.totalUsdMicro)} at{' '}
                        {quoteQuery.data?.pricePerCoin !== undefined ? formatPriceMicro(Number(quoteQuery.data.pricePerCoin)) : '—'} / coin
                      </span>
                      <span className="t-value font-bold" style={{ color: 'var(--text)' }}>
                        {formatCoins(quoteQuery.data?.coins)} DC
                      </span>
                    </>
                  )}
                </div>
                <BtnPrimary className="mt-5 w-full" onClick={() => setStep('asset')}>
                  Continue
                </BtnPrimary>
              </motion.div>
            )}

            {/* ============ STEP: asset picker ============ */}
            {step === 'asset' && (
              <motion.div
                key="asset"
                initial={{ opacity: 0, x: 24 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -24 }}
                transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
              >
                <p className="t-caption mt-1" style={{ color: 'var(--text-secondary)' }}>
                  Pay with crypto — pick the asset you&rsquo;re sending.
                </p>
                <div className="mt-4 flex flex-col gap-2.5" role="radiogroup" aria-label="Crypto asset">
                  {availableAssets.map((a) => {
                    const busy = createPayment.isPending && asset === a.key;
                    return (
                      <button
                        key={a.key}
                        type="button"
                        role="radio"
                        aria-checked={asset === a.key}
                        disabled={createPayment.isPending}
                        onClick={() => chooseAsset(a.key)}
                        className="flex min-h-[56px] w-full items-center gap-3 rounded-[16px] px-4 py-3 text-left transition-transform active:scale-[0.98]"
                        style={{ background: 'var(--field)', opacity: createPayment.isPending && !busy ? 0.6 : 1 }}
                      >
                        <span
                          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
                          style={{ background: 'var(--glass-solid)' }}
                        >
                          <a.icon size={20} style={{ color: 'var(--ember-text)' }} aria-hidden="true" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="t-value block font-bold" style={{ color: 'var(--text)' }}>
                            {a.label}
                          </span>
                          <span className="t-caption block" style={{ color: 'var(--text-secondary)' }}>
                            {a.caption}
                          </span>
                        </span>
                        {busy && (
                          <Loader2 size={18} className="animate-spin" style={{ color: 'var(--violet)' }} aria-hidden="true" />
                        )}
                      </button>
                    );
                  })}
                </div>
                {purpose === 'TOP_UP' && (
                  <BtnGhost className="mt-3" onClick={() => setStep('amount')}>
                    Back to amount
                  </BtnGhost>
                )}
              </motion.div>
            )}

            {/* ============ STEP: payment ============ */}
            {step === 'payment' && intent && (
              <motion.div
                key="payment"
                initial={{ opacity: 0, x: 24 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -24 }}
                transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
              >
                {status === 'pending' && (
                  <>
                    <div className="mt-2 flex items-center gap-2" role="status">
                      <motion.span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ background: 'var(--violet)' }}
                        animate={reduced ? { opacity: 1 } : { opacity: [1, 0.35, 1] }}
                        transition={reduced ? undefined : { duration: 1.6, repeat: Infinity }}
                        aria-hidden="true"
                      />
                      <p className="t-caption font-bold" style={{ color: 'var(--text)' }}>
                        Waiting for your {intent.asset} payment…
                      </p>
                      <span className="t-caption ml-auto flex items-center gap-1" style={{ color: secondsLeft < 300 ? 'var(--warn)' : 'var(--text-secondary)' }}>
                        <Clock size={13} aria-hidden="true" />
                        {mmss(secondsLeft)}
                      </span>
                    </div>

                    <p className="t-caption mt-3" style={{ color: 'var(--warn)' }}>
                      Send only {intent.asset} to this address. Include the {requiredBit} or we
                      cannot match your payment.
                    </p>

                    <div className="mt-3 flex flex-col gap-2.5">
                      <CopyRow label="ADDRESS" value={intent.address} onCopy={handleCopy} />
                      {intent.memoOrTag && (
                        <CopyRow
                          label="DESTINATION TAG"
                          value={intent.memoOrTag}
                          required
                          onCopy={handleCopy}
                        />
                      )}
                      <CopyRow
                        label="EXACT AMOUNT"
                        value={intent.expectedAmountText}
                        required={!intent.memoOrTag}
                        onCopy={handleCopy}
                      />
                    </div>

                    {(intent.coins !== undefined || intent.pricePerCoin !== undefined) && (
                      <p className="t-caption mt-3" style={{ color: 'var(--text-secondary)' }}>
                        {intent.coins !== undefined && <>You&rsquo;ll receive {formatCoins(intent.coins)} Date-Coin</>}
                        {intent.pricePerCoin !== undefined && <> at {formatPriceMicro(Number(intent.pricePerCoin))} / coin</>}.
                      </p>
                    )}
                  </>
                )}

                {status === 'confirmed' && (
                  <div className="flex flex-col items-center gap-4 py-6 text-center">
                    <div className="relative">
                      <BrandMark size={56} />
                      {!reduced && (
                        <motion.span
                          className="pointer-events-none absolute left-1/2 top-1/2 rounded-full"
                          style={{ width: 76, height: 76, x: '-50%', y: '-50%', border: '1.5px solid var(--violet)' }}
                          initial={{ scale: 0.7, opacity: 0.9 }}
                          animate={{ scale: 1.25, opacity: 0 }}
                          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
                          aria-hidden="true"
                        />
                      )}
                    </div>
                    <h3 className="t-title" style={{ color: 'var(--text)' }}>
                      Payment confirmed.
                    </h3>
                    <p className="t-caption" style={{ color: 'var(--text-secondary)' }}>
                      {purpose === 'TOP_UP'
                        ? 'Your Date-Coin balance has been updated.'
                        : 'Your membership is active — welcome.'}
                    </p>
                    <BtnPrimary className="w-full" onClick={onClose}>
                      Done
                    </BtnPrimary>
                  </div>
                )}

                {status === 'underpaid' && (
                  <div className="flex flex-col items-center gap-4 py-6 text-center">
                    <TriangleAlert size={40} style={{ color: 'var(--warn)' }} aria-hidden="true" />
                    <h3 className="t-title" style={{ color: 'var(--text)' }}>
                      Received less than expected.
                    </h3>
                    <p className="t-caption" style={{ color: 'var(--text-secondary)' }}>
                      We received {statusQuery.data?.receivedAmountText ?? 'less than the expected amount'}.
                      Nothing is lost — contact support and we&rsquo;ll make it right.
                    </p>
                    <BtnGlass className="w-full" onClick={onClose}>
                      Close
                    </BtnGlass>
                  </div>
                )}

                {status === 'expired' && (
                  <div className="flex flex-col items-center gap-4 py-6 text-center">
                    <Clock size={40} style={{ color: 'var(--text-secondary)' }} aria-hidden="true" />
                    <h3 className="t-title" style={{ color: 'var(--text)' }}>
                      Payment window expired.
                    </h3>
                    <p className="t-caption" style={{ color: 'var(--text-secondary)' }}>
                      The 30-minute window closed before payment arrived. Start a new payment
                      for a fresh address and lock in the current price.
                    </p>
                    <BtnPrimary
                      className="w-full"
                      onClick={() => {
                        setIntent(null);
                        setAsset(null);
                        confirmedFired.current = false;
                        setStep(purpose === 'TOP_UP' ? 'amount' : 'asset');
                      }}
                    >
                      Start a new payment
                    </BtnPrimary>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </GlassSheet>

      <AppToast toast={toast} onDismiss={() => setToast(null)} />
    </>
  );
}
