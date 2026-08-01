import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { AnimatePresence, animate, motion, useInView, useReducedMotion } from 'framer-motion';
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowUpFromLine,
  CircleAlert,
  Coins,
  Loader2,
  Sparkle,
  TrendingUp,
  Wallet as WalletIcon,
} from 'lucide-react';
import GlassCard from '@/components/GlassCard';
import AppToast from '@/components/AppToast';
import type { ToastPayload } from '@/components/AppToast';
import { BtnGlass, BtnPrimary } from '@/components/ui/buttons';
import { Toggle } from '@/components/settings/controls';
import CryptoCheckoutSheet from '@/components/wallet/CryptoCheckoutSheet';
import { useAuth } from '@/hooks/useAuth';
import { useWalletUtils, walletTrpc, formatCoins, formatPriceMicro } from '@/lib/walletTrpc';
import { LOGIN_PATH } from '@/const';
import type { WalletSale, WalletState } from '@/types/wallet-router';

/**
 * Wallet — /wallet
 * Date-Coin balance hero (amber edge glow), live system price + total sales
 * ("the price only goes up"), Smart Custody Switch with honest explainer,
 * XRP rewards pending, Buy Date-Coin CTA (CryptoCheckoutSheet, TOP_UP) and
 * the bought/supplied sales history. Signed-out visitors get a demo-mode
 * sign-in prompt; every query has skeletons and every mutation error toasts.
 */

const EASE_OUT = [0.22, 1, 0.36, 1] as [number, number, number, number];

/** Balance count-up on first view (600ms ease-out, §7.2) */
function BalanceCountUp({ value }: { value: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.6 });
  const reduced = useReducedMotion();
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (!inView) return;
    if (reduced) {
      setVal(value);
      return;
    }
    const controls = animate(0, value, {
      duration: 0.6,
      ease: 'easeOut',
      onUpdate: (v) => setVal(v),
    });
    return () => controls.stop();
  }, [inView, value, reduced]);
  return <span ref={ref}>{Math.round(val).toLocaleString('en-US')}</span>;
}

function numericBalance(b: WalletState['balance']): number {
  const n = typeof b === 'number' ? b : Number(b ?? 0);
  return Number.isFinite(n) ? n : 0;
}

/* — Sales history: chained pages, each page offers "Load more" — */
function HistoryItems({
  cursor,
  onError,
}: {
  cursor?: string;
  onError: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const query = walletTrpc.wallet.history.useQuery({ cursor }, { retry: 1 });

  useEffect(() => {
    if (query.isError) onError();
  }, [query.isError, onError]);

  if (query.isLoading) {
    return (
      <div className="flex flex-col gap-2.5" aria-label="Loading history">
        <div className="skeleton-shimmer h-14 rounded-[16px]" style={{ background: 'var(--field)' }} />
        <div className="skeleton-shimmer h-14 rounded-[16px]" style={{ background: 'var(--field)' }} />
      </div>
    );
  }
  if (query.isError) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-[16px] px-4 py-3" style={{ background: 'var(--field)' }}>
        <span className="t-caption" style={{ color: 'var(--text-secondary)' }}>
          Couldn&rsquo;t load sales history.
        </span>
        <BtnGlass className="h-9 px-4" onClick={() => void query.refetch()}>
          Retry
        </BtnGlass>
      </div>
    );
  }

  const items = query.data?.items ?? [];
  const nextCursor = query.data?.nextCursor ?? null;

  return (
    <>
      {items.length === 0 && !cursor && (
        <p className="t-caption px-1 py-2" style={{ color: 'var(--text-secondary)' }}>
          No sales yet — your bought and supplied Date-Coin will show up here.
        </p>
      )}
      <div className="flex flex-col gap-2.5">
        {items.map((sale) => (
          <SaleRow key={sale.id} sale={sale} />
        ))}
      </div>
      {nextCursor && !expanded && (
        <BtnGlass className="mt-3 w-full" onClick={() => setExpanded(true)}>
          Load more
        </BtnGlass>
      )}
      {nextCursor && expanded && (
        <div className="mt-2.5">
          <HistoryItems cursor={nextCursor} onError={onError} />
        </div>
      )}
    </>
  );
}

function SaleRow({ sale }: { sale: WalletSale }) {
  const bought = sale.kind === 'BOUGHT';
  const at = new Date(sale.at);
  const dateText = Number.isNaN(at.getTime())
    ? ''
    : at.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  return (
    <div
      className="flex items-center gap-3 rounded-[16px] px-4 py-3"
      style={{ background: 'var(--field)' }}
    >
      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
        style={{ background: 'var(--glass-solid)' }}
      >
        {bought ? (
          <ArrowDownToLine size={16} style={{ color: 'var(--ok)' }} aria-hidden="true" />
        ) : (
          <ArrowUpFromLine size={16} style={{ color: 'var(--ember-text)' }} aria-hidden="true" />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="t-caption block font-bold" style={{ color: 'var(--text)' }}>
          {bought ? 'Bought Date-Coin' : 'Supplied to new members'}
        </span>
        <span className="t-micro block" style={{ color: 'var(--text-secondary)' }}>
          {dateText}
          {sale.pricePerCoin !== undefined && ` · ${formatPriceMicro(Number(sale.pricePerCoin))} / coin`}
        </span>
      </span>
      <span className="t-value shrink-0 pl-2 font-bold" style={{ color: 'var(--text)' }}>
        {bought ? '+' : '−'}
        {formatCoins(sale.coins)} DC
      </span>
    </div>
  );
}

/* — Grant gate for signed-in users whose wallet isn't created yet — */
function WalletGrantGate({
  onGranted,
  onError,
}: {
  onGranted: () => void;
  onError: () => void;
}) {
  const [agreed, setAgreed] = useState(false);
  const grant = walletTrpc.wallet.grantAuthority.useMutation({
    onSuccess: () => onGranted(),
    onError: () => onError(),
  });
  return (
    <GlassCard className="p-5">
      <p className="t-eyebrow">REQUIRED</p>
      <h2 className="t-title-sm mt-1">Smart Custody Wallet</h2>
      <ul className="t-caption mt-3 flex flex-col gap-2" style={{ color: 'var(--text-secondary)' }}>
        <li>· The platform creates a wallet for you.</li>
        <li>· While your switch is ON, your wallet may automatically supply Date-Coin tokens to new users.</li>
        <li>· You receive rewards only in XRP.</li>
        <li>· The system never takes your balance below 2,000 Date-Coin.</li>
        <li>· You can turn the switch OFF at any time.</li>
      </ul>
      <label className="mt-4 flex min-h-[44px] cursor-pointer items-center gap-3">
        <input
          type="checkbox"
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
          className="h-5 w-5 shrink-0 accent-[#7B49F5]"
        />
        <span className="t-caption" style={{ color: 'var(--text)' }}>
          I understand and agree to the Smart Custody Wallet terms.
        </span>
      </label>
      <BtnPrimary
        className="mt-4 w-full"
        disabled={!agreed || grant.isPending}
        onClick={() => grant.mutate()}
      >
        {grant.isPending ? (
          <Loader2 size={18} className="animate-spin" aria-hidden="true" />
        ) : (
          'Create my wallet'
        )}
      </BtnPrimary>
    </GlassCard>
  );
}

export default function Wallet() {
  const navigate = useNavigate();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const walletUtils = useWalletUtils();
  const reduced = useReducedMotion();

  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [toast, setToast] = useState<ToastPayload | null>(null);

  const showToast = useCallback((message: string, icon?: ToastPayload['icon']) => {
    setToast({ id: Date.now(), message, icon });
  }, []);
  const showError = useCallback(
    (message: string) =>
      showToast(message, <CircleAlert size={14} style={{ color: 'var(--danger)' }} aria-hidden="true" />),
    [showToast],
  );

  const stateQuery = walletTrpc.wallet.state.useQuery(undefined, {
    enabled: isAuthenticated,
    retry: 1,
  });
  const state = stateQuery.data ?? null;

  const setSwitch = walletTrpc.wallet.setSwitch.useMutation({
    onSuccess: () => void walletUtils.wallet.state.invalidate(),
    onError: () => showError("Couldn't update the switch — try again."),
  });

  const balance = numericBalance(state?.balance);

  return (
    <div className="relative h-full overflow-hidden">
      <div className="h-full overflow-y-auto pb-16">
        {/* — Glass top bar (pushed route) — */}
        <div className="px-4 pt-2">
          <div className="glass flex h-[52px] items-center rounded-full pl-1 pr-4">
            <button
              type="button"
              aria-label="Back"
              onClick={() => navigate(-1)}
              className="glass-content flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full"
              style={{ color: 'var(--text)' }}
            >
              <ArrowLeft size={20} aria-hidden="true" />
            </button>
            <span
              className="t-value flex-1 pr-11 text-center font-bold"
              style={{ color: 'var(--text)', position: 'relative', zIndex: 1 }}
            >
              Wallet
            </span>
          </div>
        </div>

        {/* — Loading skeletons — */}
        {isAuthenticated && stateQuery.isLoading && (
          <div className="mt-6 flex flex-col gap-4 px-5" aria-label="Loading wallet">
            <div className="glass skeleton-shimmer h-44 rounded-[24px]" />
            <div className="glass skeleton-shimmer h-24 rounded-[24px]" />
            <div className="glass skeleton-shimmer h-28 rounded-[24px]" />
          </div>
        )}

        {/* — Error state — */}
        {isAuthenticated && stateQuery.isError && (
          <div className="mt-10 px-5">
            <GlassCard className="flex flex-col items-center gap-4 p-6 text-center">
              <CircleAlert size={32} style={{ color: 'var(--danger)' }} aria-hidden="true" />
              <p className="t-body" style={{ color: 'var(--text-secondary)' }}>
                We couldn&rsquo;t reach your wallet. Check your connection and try again.
              </p>
              <BtnGlass className="w-full" onClick={() => void stateQuery.refetch()}>
                Retry
              </BtnGlass>
            </GlassCard>
          </div>
        )}

        {/* — Demo mode (signed out) — */}
        {!authLoading && !isAuthenticated && (
          <section className="mt-12 flex flex-col items-center gap-4 px-8 text-center">
            <WalletIcon size={36} style={{ color: 'var(--text-secondary)' }} aria-hidden="true" />
            <p className="t-body" style={{ color: 'var(--text-secondary)' }}>
              Sign in to see your Date-Coin balance and Smart Custody Wallet.
            </p>
            <BtnPrimary to={LOGIN_PATH}>Sign in</BtnPrimary>
          </section>
        )}

        {/* — Wallet gate (no wallet yet) — */}
        {isAuthenticated && state && !state.hasWallet && (
          <motion.section
            className="mt-6 px-5"
            initial={reduced ? { opacity: 0 } : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.32, ease: EASE_OUT }}
          >
            <WalletGrantGate
              onGranted={() => {
                void walletUtils.wallet.state.invalidate();
                showToast(
                  'Wallet created — welcome aboard.',
                  <Sparkle size={14} style={{ color: 'var(--violet)' }} aria-hidden="true" />,
                );
              }}
              onError={() => showError("Couldn't create the wallet — try again.")}
            />
          </motion.section>
        )}

        {/* — Wallet content — */}
        {isAuthenticated && state && state.hasWallet && (
          <>
            {/* Balance hero — the one amber edge-glow surface of this view */}
            <motion.section
              className="mt-6 px-5"
              initial={reduced ? { opacity: 0 } : { opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.32, ease: EASE_OUT }}
            >
              <GlassCard edge="amber" className="p-5">
                <div className="flex items-center justify-between">
                  <p className="t-eyebrow">DATE-COIN BALANCE</p>
                  {state.isOriginalHundredK && (
                    <span
                      className="t-micro flex items-center gap-1 rounded-full px-2 py-1 font-bold"
                      style={{ background: 'var(--field)', color: 'var(--ember-text)' }}
                    >
                      <Sparkle size={11} aria-hidden="true" />
                      EARLY MEMBER
                    </span>
                  )}
                </div>
                <p className="mt-2 flex items-baseline gap-2">
                  <span className="t-heading" style={{ color: 'var(--text)' }}>
                    <BalanceCountUp value={balance} />
                  </span>
                  <span className="t-title-sm" style={{ color: 'var(--text-secondary)' }}>
                    DC
                  </span>
                </p>
                <p className="t-caption mt-1" style={{ color: 'var(--text-secondary)' }}>
                  Smart Custody switch is {state.switchOn ? 'ON — earning XRP rewards' : 'OFF'}.
                </p>
                <div className="mt-5">
                  <BtnPrimary className="w-full" onClick={() => setCheckoutOpen(true)}>
                    <Coins size={17} aria-hidden="true" />
                    Buy Date-Coin
                  </BtnPrimary>
                </div>
              </GlassCard>
            </motion.section>

            {/* Live price + total sales */}
            <motion.section
              className="mt-4 px-5"
              initial={reduced ? { opacity: 0 } : { opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.32, delay: reduced ? 0 : 0.06, ease: EASE_OUT }}
            >
              <GlassCard className="p-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="t-micro" style={{ color: 'var(--text)' }}>
                      LIVE SYSTEM PRICE
                    </p>
                    <p className="t-title mt-0.5" style={{ color: 'var(--text)' }}>
                      {formatPriceMicro(Number(state.price))}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="t-micro" style={{ color: 'var(--text)' }}>
                      TOTAL SOLD
                    </p>
                    <p className="t-title mt-0.5" style={{ color: 'var(--text)' }}>
                      {Number(state.totalSalesCount ?? 0).toLocaleString('en-US')}
                    </p>
                  </div>
                </div>
                <p
                  className="t-caption mt-3 flex items-center gap-1.5"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  <TrendingUp size={14} style={{ color: 'var(--ok)' }} aria-hidden="true" />
                  The price only goes up — it never comes back down.
                </p>
              </GlassCard>
            </motion.section>

            {/* Smart Custody Switch */}
            <motion.section
              className="mt-4 px-5"
              initial={reduced ? { opacity: 0 } : { opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.32, delay: reduced ? 0 : 0.12, ease: EASE_OUT }}
            >
              <GlassCard className="p-5">
                <div className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <h2 className="t-title-sm" style={{ color: 'var(--text)' }}>
                      Smart Custody Switch
                    </h2>
                  </div>
                  <Toggle
                    checked={!!state.switchOn}
                    disabled={setSwitch.isPending}
                    ariaLabel="Smart Custody Switch"
                    onChange={(on) => setSwitch.mutate({ on })}
                  />
                </div>
                <p className="t-caption mt-2.5" style={{ color: 'var(--text-secondary)' }}>
                  ON = your wallet can supply Date-Coin to new members and earn XRP rewards from
                  the platform&rsquo;s treasury. You can turn this off anytime.
                </p>
              </GlassCard>
            </motion.section>

            {/* XRP rewards pending */}
            <motion.section
              className="mt-4 px-5"
              initial={reduced ? { opacity: 0 } : { opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.32, delay: reduced ? 0 : 0.18, ease: EASE_OUT }}
            >
              <GlassCard className="p-5">
                <p className="t-micro" style={{ color: 'var(--text)' }}>
                  XRP REWARDS
                </p>
                <p className="t-title-sm mt-1" style={{ color: 'var(--text)' }}>
                  {state.rewardsPendingText}
                </p>
                <p className="t-caption mt-1.5" style={{ color: 'var(--text-secondary)' }}>
                  Rewards are paid only in XRP, straight from the platform treasury.
                </p>
              </GlassCard>
            </motion.section>

            {/* Sales history */}
            <motion.section
              className="mt-6 px-5"
              initial={reduced ? { opacity: 0 } : { opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.32, delay: reduced ? 0 : 0.24, ease: EASE_OUT }}
              aria-label="Sales history"
            >
              <h2 className="t-title-sm" style={{ color: 'var(--text-ink)' }}>
                Sales history
              </h2>
              <div className="mt-3">
                <HistoryItems onError={() => showError("Couldn't load sales history.")} />
              </div>
            </motion.section>
          </>
        )}
      </div>

      {/* — Buy Date-Coin checkout — */}
      <CryptoCheckoutSheet
        open={checkoutOpen}
        onClose={() => setCheckoutOpen(false)}
        purpose="TOP_UP"
        onConfirmed={() => void walletUtils.wallet.state.invalidate()}
      />

      <AnimatePresence>
        {setSwitch.isPending && (
          <span className="sr-only" role="status">
            Updating Smart Custody switch…
          </span>
        )}
      </AnimatePresence>

      <AppToast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}
