import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import {
  AnimatePresence,
  animate,
  motion,
  useInView,
  useReducedMotion,
} from 'framer-motion';
import {
  ArrowLeft,
  ArrowUp,
  Check,
  Loader2,
  Sparkle,
} from 'lucide-react';
import GlassCard from '@/components/GlassCard';
import GlassSheet from '@/components/GlassSheet';
import BrandMark from '@/components/BrandMark';
import AppToast from '@/components/AppToast';
import type { ToastPayload } from '@/components/AppToast';
import { BtnGlass, BtnGhost, BtnPrimary } from '@/components/ui/buttons';
import { trpc } from '@/providers/trpc';
import { useAuth } from '@/hooks/useAuth';
import { LOGIN_PATH } from '@/const';
import { cn } from '@/lib/utils';

type Tier = 'plus' | 'x';
type Billing = 'monthly' | 'yearly';

const PRICES: Record<Tier, Record<Billing, { card: string; perMonth: string }>> = {
  plus: {
    monthly: { card: '€14.99/mo', perMonth: '€14.99/mo' },
    yearly: { card: '€8.33/mo · billed €99.99', perMonth: '€8.33/mo' },
  },
  x: {
    monthly: { card: '€29.99/mo', perMonth: '€29.99/mo' },
    yearly: { card: '€16.67/mo · billed €199.99', perMonth: '€16.67/mo' },
  },
};

const PLUS_FEATURES = [
  'Unlimited likes',
  'Full Likes You view + sorting',
  'Advanced filters',
  'Travel mode',
  'Photo performance insights',
  'Enhanced AI coaching',
  '5 Pulses / month included',
];

const X_FEATURES = [
  'Everything in Resonance+',
  'Always-on boost (3× queue visibility)',
  'Message before matching',
  'Priority placement in Likes You',
  'X concierge: monthly profile review',
  'Unlimited Pulses',
];

const EXPLAINERS: Record<string, string> = {
  'Unlimited likes': 'No daily cap — like every profile that genuinely interests you.',
  'Full Likes You view + sorting': 'See everyone who liked you, unblurred, sorted by compatibility.',
  'Advanced filters': 'Height, education, family plans, politics — every filter, no gate.',
  'Travel mode': 'Set your city anywhere before you arrive.',
  'Photo performance insights': 'See which of your photos earn the most genuine interest.',
  'Enhanced AI coaching': 'Deeper prompt and opener suggestions tuned to your voice.',
  '5 Pulses / month included': 'Five pins at the top of their Likes, every month, on the house.',
  'Everything in Resonance+': 'Every + feature is included in X.',
  'Always-on boost (3× queue visibility)': 'Your profile carries triple visibility in every queue, always.',
  'Message before matching': 'Send one thoughtful note alongside your like.',
  'Priority placement in Likes You': 'You surface first whenever they open their Likes.',
  'X concierge: monthly profile review': 'A monthly one-on-one profile review with our team.',
  'Unlimited Pulses': 'Pin whenever it matters — no monthly cap.',
};

const PULSE_PACKS = [
  { count: 1, price: '€2.49', label: '1 for €2.49' },
  { count: 5, price: '€9.99', label: '5 for €9.99' },
] as const;

type Confirm =
  | { kind: 'pulses'; count: 1 | 5; price: string }
  | { kind: 'boost'; price: string };

/** Count-flip price swap (240ms) */
function FlipPrice({ text, className }: { text: string; className?: string }) {
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.p
        key={text}
        className={className}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
      >
        {text}
      </motion.p>
    </AnimatePresence>
  );
}

/** Number count-up on first viewport entry (600ms ease-out, §7.2) */
function CountUp({ to, decimals = 0 }: { to: number; decimals?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.6 });
  const reduced = useReducedMotion();
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (!inView) return;
    if (reduced) {
      setVal(to);
      return;
    }
    const controls = animate(0, to, {
      duration: 0.6,
      ease: 'easeOut',
      onUpdate: (v) => setVal(v),
    });
    return () => controls.stop();
  }, [inView, to, reduced]);
  return <span ref={ref}>{val.toFixed(decimals)}</span>;
}

/** Feature row with inline explainer popover (200ms) */
function FeatureRow({
  label,
  open,
  onToggle,
}: {
  label: string;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
        className="flex min-h-[32px] w-full items-center gap-2 py-0.5 text-left"
      >
        <Check size={14} strokeWidth={2.5} style={{ color: 'var(--ok)' }} aria-hidden="true" />
        <span className="t-caption" style={{ color: 'var(--text)' }}>
          {label}
        </span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <p
              className="t-caption mb-1.5 ml-6 rounded-xl px-3 py-2"
              style={{ background: 'var(--field)', color: 'var(--text-secondary)' }}
            >
              {EXPLAINERS[label] ?? label}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function Premium() {
  const navigate = useNavigate();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const utils = trpc.useUtils();
  const reduced = useReducedMotion();

  const [billing, setBilling] = useState<Billing>('yearly');
  const [selected, setSelected] = useState<Tier>('plus');
  const [energized, setEnergized] = useState(false);
  const [openExplainer, setOpenExplainer] = useState<string | null>(null);
  const [pulsePack, setPulsePack] = useState<(typeof PULSE_PACKS)[number]>(PULSE_PACKS[0]);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [success, setSuccess] = useState<Tier | null>(null);
  const [toast, setToast] = useState<ToastPayload | null>(null);

  const showToast = useCallback((message: string, icon?: ToastPayload['icon']) => {
    setToast({ id: Date.now(), message, icon });
  }, []);

  const entitlementsQuery = trpc.premium.entitlements.useQuery(undefined, {
    enabled: isAuthenticated,
  });
  const entitlement = entitlementsQuery.data?.entitlement ?? null;
  const currentTier: Tier | 'free' = entitlement?.tier ?? 'free';

  /* X card edge glow energizes once after settle (§7.2 / premium.md §1) */
  useEffect(() => {
    const t = setTimeout(() => setEnergized(true), 900);
    return () => clearTimeout(t);
  }, []);

  const subscribe = trpc.premium.subscribe.useMutation({
    onSuccess: (_d, vars) => {
      setTimeout(() => {
        setProcessing(false);
        setSuccess(vars.tier);
        utils.premium.entitlements.invalidate();
      }, 900);
    },
    onError: () => {
      setProcessing(false);
      showToast('Store hiccup — nothing was charged. Try again.');
    },
  });

  const buyPulses = trpc.premium.buyPulses.useMutation({
    onSuccess: (_d, vars) => {
      setConfirm(null);
      utils.premium.entitlements.invalidate();
      showToast(
        `+${vars.count} Pulse${vars.count > 1 ? 's' : ''} added — use them where it counts.`,
        <Sparkle size={14} style={{ color: 'var(--violet)' }} aria-hidden="true" />,
      );
    },
    onError: () => showToast('Store hiccup — nothing was charged. Try again.'),
  });

  const buyBoost = trpc.premium.buyBoost.useMutation({
    onSuccess: () => {
      setConfirm(null);
      utils.premium.entitlements.invalidate();
      showToast('Boost armed — 30 minutes at the front of nearby queues.');
    },
    onError: () => showToast('Store hiccup — nothing was charged. Try again.'),
  });

  const cancel = trpc.premium.cancel.useMutation({
    onSuccess: () => {
      setCancelOpen(false);
      utils.premium.entitlements.invalidate();
      showToast("You're back on Free — no further charges.");
    },
    onError: () => showToast("Couldn't cancel right now — try again."),
  });

  const headline = 'Better outcomes. Not more swipes.';
  const isMember = currentTier !== 'free';
  const pulses = entitlement?.pulses ?? 0;

  return (
    <div className="relative h-full overflow-hidden">
      <div className="h-full overflow-y-auto pb-44">
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
              Resonance Premium
            </span>
          </div>
        </div>

        {/* — Header — */}
        <header className="mt-8 flex flex-col items-center px-8 text-center">
          <motion.div
            initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.7 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.42, ease: [0.34, 1.56, 0.64, 1] }}
          >
            <BrandMark size={56} />
          </motion.div>
          <p className="t-eyebrow mt-4">DATE WITH INTENT</p>
          <h1 className="t-heading mt-2" style={{ color: 'var(--text-ink)' }}>
            {headline.split(' ').map((word, i) => (
              <motion.span
                key={`${word}-${i}`}
                className="inline-block"
                initial={reduced ? { opacity: 0 } : { opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  duration: 0.32,
                  delay: reduced ? 0 : 0.2 + i * 0.05,
                  ease: [0.22, 1, 0.36, 1],
                }}
              >
                {word}
                {i < headline.split(' ').length - 1 ? ' ' : ''}
              </motion.span>
            ))}
          </h1>
        </header>

        {/* — Loading skeleton — */}
        {isAuthenticated && entitlementsQuery.isLoading && (
          <div className="mt-8 flex flex-col gap-4 px-5" aria-label="Loading plans">
            <div className="glass skeleton-shimmer h-56 rounded-[24px]" />
            <div className="glass skeleton-shimmer h-56 rounded-[24px]" />
          </div>
        )}

        {/* — Auth prompt — */}
        {!authLoading && !isAuthenticated && (
          <section className="mt-12 flex flex-col items-center gap-4 px-8 text-center">
            <p className="t-body" style={{ color: 'var(--text-secondary)' }}>
              Sign in to manage your plan.
            </p>
            <BtnPrimary to={LOGIN_PATH}>Sign in</BtnPrimary>
          </section>
        )}

        {/* ============ MANAGEMENT VIEW (already subscribed) ============ */}
        {isAuthenticated && !entitlementsQuery.isLoading && isMember && !success && (
          <motion.section
            className="mt-8 flex flex-col gap-4 px-5"
            initial={reduced ? { opacity: 0 } : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
          >
            <GlassCard edge={currentTier === 'x' ? 'amber' : 'none'} className="p-5">
              <p className="t-eyebrow">CURRENT PLAN</p>
              <h2 className="t-title mt-1">
                {currentTier === 'x' ? 'Resonance X' : 'Resonance+'}
              </h2>
              <div className="mt-4 flex flex-col gap-2.5">
                <div className="flex items-center justify-between">
                  <span className="t-micro" style={{ color: 'var(--text)' }}>
                    DAILY LIKES
                  </span>
                  <span className="t-caption font-bold" style={{ color: 'var(--text)' }}>
                    {(entitlement?.dailyLikeLimit ?? 0) >= 999
                      ? 'Unlimited'
                      : String(entitlement?.dailyLikeLimit ?? 0)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="t-micro" style={{ color: 'var(--text)' }}>
                    PULSES LEFT
                  </span>
                  <span className="t-caption font-bold" style={{ color: 'var(--text)' }}>
                    {currentTier === 'x' ? 'Unlimited' : pulses}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="t-micro" style={{ color: 'var(--text)' }}>
                    BOOSTS
                  </span>
                  <span className="t-caption font-bold" style={{ color: 'var(--text)' }}>
                    {currentTier === 'x'
                      ? 'Always-on'
                      : `${entitlement?.boosts ?? 0} ready`}
                  </span>
                </div>
              </div>
              <div className="mt-5">
                {currentTier === 'plus' ? (
                  <BtnPrimary
                    className="w-full"
                    disabled={processing}
                    onClick={() => {
                      setProcessing(true);
                      subscribe.mutate({ tier: 'x' });
                    }}
                  >
                    Upgrade to Resonance X
                  </BtnPrimary>
                ) : (
                  <BtnGhost
                    className="w-full"
                    disabled={processing}
                    onClick={() => {
                      setProcessing(true);
                      subscribe.mutate({ tier: 'plus' });
                    }}
                  >
                    Switch to Resonance+
                  </BtnGhost>
                )}
              </div>
              <div className="mt-2">
                <BtnGhost className="w-full" onClick={() => setCancelOpen(true)}>
                  Switch to Free
                </BtnGhost>
              </div>
            </GlassCard>
          </motion.section>
        )}

        {/* ============ PAYWALL (free tier) ============ */}
        {isAuthenticated && !entitlementsQuery.isLoading && !isMember && !success && (
          <>
            {/* — §1 Billing segmented control — */}
            <div className="mt-8 flex items-center justify-center gap-2 px-5">
              <div
                className="relative flex rounded-full p-1"
                style={{ background: 'var(--field)' }}
                role="tablist"
                aria-label="Billing period"
              >
                {(['monthly', 'yearly'] as const).map((b) => (
                  <button
                    key={b}
                    type="button"
                    role="tab"
                    aria-selected={billing === b}
                    onClick={() => setBilling(b)}
                    className="relative flex h-9 items-center rounded-full px-5"
                  >
                    {billing === b && (
                      <motion.span
                        layoutId="billing-pill"
                        className="absolute inset-0 rounded-full"
                        style={{
                          background: 'var(--glass-solid)',
                          boxShadow: 'var(--glass-hi)',
                        }}
                        transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
                      />
                    )}
                    <span
                      className="t-caption relative z-10 font-bold"
                      style={{ color: 'var(--text)' }}
                    >
                      {b === 'monthly' ? 'Monthly' : 'Yearly'}
                    </span>
                  </button>
                ))}
              </div>
              <span className="t-micro font-bold" style={{ color: 'var(--ember-text)' }}>
                SAVE 44%
              </span>
            </div>

            {/* — §1 Tier cards — */}
            <section className="mt-5 flex flex-col gap-4 px-5" aria-label="Plans">
              {/* Resonance+ — quiet slab */}
              <motion.div
                initial={reduced ? { opacity: 0 } : { opacity: 0, y: 28 }}
                animate={{ opacity: 1, y: selected === 'plus' ? -4 : 0 }}
                transition={{ duration: 0.42, delay: reduced ? 0 : 0.1, ease: [0.22, 1, 0.36, 1] }}
              >
                <div
                  role="radio"
                  aria-checked={selected === 'plus'}
                  tabIndex={0}
                  onClick={() => setSelected('plus')}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setSelected('plus');
                    }
                  }}
                  className="relative cursor-pointer rounded-[24px]"
                >
                  <GlassCard className="p-5">
                    <div className="flex items-baseline justify-between gap-3">
                      <h2 className="t-title-sm">Resonance+</h2>
                      <FlipPrice text={PRICES.plus[billing].card} className="t-title" />
                    </div>
                    <div className="mt-3">
                      {PLUS_FEATURES.map((f) => (
                        <FeatureRow
                          key={f}
                          label={f}
                          open={openExplainer === f}
                          onToggle={() => setOpenExplainer(openExplainer === f ? null : f)}
                        />
                      ))}
                    </div>
                  </GlassCard>
                  <motion.span
                    className="pointer-events-none absolute inset-0 rounded-[24px]"
                    style={{ boxShadow: '0 0 0 2px var(--violet)' }}
                    animate={{ opacity: selected === 'plus' ? 1 : 0 }}
                    transition={{ duration: 0.3 }}
                    aria-hidden="true"
                  />
                </div>
              </motion.div>

              {/* Resonance X — edge glow tier signal */}
              <motion.div
                initial={reduced ? { opacity: 0 } : { opacity: 0, y: 28 }}
                animate={{ opacity: 1, y: selected === 'x' ? -4 : 0 }}
                transition={{ duration: 0.42, delay: reduced ? 0 : 0.2, ease: [0.22, 1, 0.36, 1] }}
              >
                <div
                  role="radio"
                  aria-checked={selected === 'x'}
                  tabIndex={0}
                  onClick={() => setSelected('x')}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setSelected('x');
                    }
                  }}
                  className="relative cursor-pointer rounded-[24px]"
                >
                  <GlassCard
                    edge="amber"
                    className={cn('p-5', energized ? 'edge-energize' : 'edge-gated')}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <h2 className="t-title-sm">Resonance X</h2>
                      <span className="t-eyebrow">HIGHEST SIGNAL</span>
                    </div>
                    <FlipPrice text={PRICES.x[billing].card} className="t-title mt-1" />
                    <div className="mt-3">
                      {X_FEATURES.map((f) => (
                        <FeatureRow
                          key={f}
                          label={f}
                          open={openExplainer === f}
                          onToggle={() => setOpenExplainer(openExplainer === f ? null : f)}
                        />
                      ))}
                    </div>
                  </GlassCard>
                  <motion.span
                    className="pointer-events-none absolute inset-0 rounded-[24px]"
                    style={{ boxShadow: '0 0 0 2px var(--violet)' }}
                    animate={{ opacity: selected === 'x' ? 1 : 0 }}
                    transition={{ duration: 0.3 }}
                    aria-hidden="true"
                  />
                </div>
              </motion.div>
            </section>

            {/* — §2 Social proof strip — */}
            <section className="mt-8 flex items-center gap-3 px-6" aria-label="Member outcomes">
              <div className="flex items-center">
                {['/avatar-t1.jpg', '/avatar-t2.jpg', '/avatar-t3.jpg'].map((src, i) => (
                  <motion.img
                    key={src}
                    src={src}
                    alt=""
                    loading="lazy"
                    className="-ml-2.5 h-9 w-9 rounded-full border-2 object-cover first:ml-0"
                    style={{ borderColor: 'var(--stage-base)' }}
                    initial={reduced ? false : { scale: 0 }}
                    whileInView={{ scale: 1 }}
                    viewport={{ once: true, amount: 0.6 }}
                    transition={{
                      duration: 0.24,
                      delay: reduced ? 0 : i * 0.06,
                      ease: [0.34, 1.56, 0.64, 1],
                    }}
                  />
                ))}
              </div>
              <div>
                <p className="t-caption" style={{ color: 'var(--text)' }}>
                  Members on + get to a first date <CountUp to={2.3} decimals={1} />×
                  faster (beta).
                </p>
                <p className="t-micro mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                  BASED ON WE MET FEEDBACK
                </p>
              </div>
            </section>
          </>
        )}

        {/* — §3 À la carte (both views) — */}
        {isAuthenticated && !entitlementsQuery.isLoading && !success && (
          <section className="mt-8 px-5" aria-label="À la carte">
            <h2 className="t-title-sm" style={{ color: 'var(--text-ink)' }}>
              À la carte
            </h2>
            <div className="no-scrollbar mt-3 flex gap-3 overflow-x-auto pb-1">
              {/* Pulses */}
              <motion.div
                initial={reduced ? { opacity: 0 } : { opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.3 }}
                transition={{ duration: 0.38, ease: [0.22, 1, 0.36, 1] }}
                className="w-[270px] shrink-0"
              >
                <GlassCard className="flex h-full flex-col p-4">
                  <div className="flex items-center gap-2">
                    <Sparkle size={18} style={{ color: 'var(--violet)', fill: 'var(--violet)' }} aria-hidden="true" />
                    <h3 className="t-value font-bold">Pulses</h3>
                  </div>
                  <p className="t-caption mt-1.5" style={{ color: 'var(--text-secondary)' }}>
                    Pin yourself at the top of their Likes with a note.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {PULSE_PACKS.map((pack) => {
                      const active = pulsePack.count === pack.count;
                      return (
                        <button
                          key={pack.count}
                          type="button"
                          aria-pressed={active}
                          onClick={() => setPulsePack(pack)}
                          className={cn(
                            't-caption flex h-8 items-center rounded-full px-3',
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
                          {pack.label}
                        </button>
                      );
                    })}
                  </div>
                  <div className="mt-3 flex items-center justify-between">
                    <span className="t-micro" style={{ color: 'var(--text-secondary)' }}>
                      YOU HAVE{' '}
                      <motion.span
                        key={pulses}
                        className="inline-block font-bold"
                        style={{ color: 'var(--text)' }}
                        initial={reduced ? false : { scale: 1.35 }}
                        animate={{ scale: 1 }}
                        transition={{ duration: 0.38, ease: [0.34, 1.56, 0.64, 1] }}
                      >
                        {currentTier === 'x' ? '∞' : pulses}
                      </motion.span>
                    </span>
                    <BtnGlass
                      className="h-10 px-4"
                      onClick={() =>
                        setConfirm({ kind: 'pulses', count: pulsePack.count, price: pulsePack.price })
                      }
                    >
                      Buy Pulses
                    </BtnGlass>
                  </div>
                </GlassCard>
              </motion.div>

              {/* Boost */}
              <motion.div
                initial={reduced ? { opacity: 0 } : { opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.3 }}
                transition={{ duration: 0.38, delay: reduced ? 0 : 0.08, ease: [0.22, 1, 0.36, 1] }}
                className="w-[270px] shrink-0"
              >
                <GlassCard className="flex h-full flex-col p-4">
                  <div className="flex items-center gap-2">
                    <ArrowUp size={18} style={{ color: 'var(--violet)' }} aria-hidden="true" />
                    <h3 className="t-value font-bold">Boost</h3>
                  </div>
                  <p className="t-caption mt-1.5 flex-1" style={{ color: 'var(--text-secondary)' }}>
                    30 minutes at the front of nearby queues.
                  </p>
                  <div className="mt-3 flex items-center justify-between">
                    <span className="t-title-sm" style={{ color: 'var(--text)' }}>
                      €3.99
                    </span>
                    <BtnGlass
                      className="h-10 px-4"
                      onClick={() => setConfirm({ kind: 'boost', price: '€3.99' })}
                    >
                      Boost me
                    </BtnGlass>
                  </div>
                </GlassCard>
              </motion.div>
            </div>
          </section>
        )}

        {/* — §4 Free-tier honesty block — */}
        {isAuthenticated && !entitlementsQuery.isLoading && !success && (
          <section className="mt-6 px-5">
            <GlassCard className="p-5">
              <h2 className="t-title-sm">Free stays good.</h2>
              <p className="t-caption mt-1.5" style={{ color: 'var(--text-secondary)' }}>
                Daily queue · limited likes · every filter & dealbreaker · verified
                community · events. Premium makes it faster — never functional.
              </p>
            </GlassCard>
          </section>
        )}
      </div>

      {/* — §5 Sticky footer — */}
      {isAuthenticated && !entitlementsQuery.isLoading && !success && (
        <div
          className="absolute inset-x-0 bottom-0 px-5 pb-5 pt-10"
          style={{
            background:
              'linear-gradient(180deg, transparent 0%, var(--stage-base) 55%)',
          }}
        >
          {!isMember && (
            <BtnPrimary
              className="w-full"
              disabled={processing}
              onClick={() => {
                setProcessing(true);
                subscribe.mutate({ tier: selected });
              }}
            >
              {processing ? (
                <Loader2 size={18} className="animate-spin" aria-hidden="true" />
              ) : (
                `Continue with Resonance${selected === 'x' ? ' X' : '+'} — ${PRICES[selected][billing].perMonth}`
              )}
            </BtnPrimary>
          )}
          <div className="mt-3 flex items-center justify-center gap-4">
            <button
              type="button"
              className="t-micro min-h-[32px]"
              style={{ color: 'var(--text-secondary)' }}
              onClick={() => {
                void entitlementsQuery.refetch();
                showToast('Synced with your account.');
              }}
            >
              Restore purchase
            </button>
            <button
              type="button"
              className="t-micro min-h-[32px]"
              style={{ color: 'var(--text-secondary)' }}
              onClick={() => showToast('Terms open at resonance.date/terms.')}
            >
              Terms
            </button>
            <Link
              to="/settings"
              className="t-micro flex min-h-[32px] items-center"
              style={{ color: 'var(--text-secondary)' }}
            >
              Cancel anytime in Settings
            </Link>
          </div>
        </div>
      )}

      {/* — Buy confirm sheet — */}
      <GlassSheet
        open={!!confirm}
        onClose={() => !processing && setConfirm(null)}
        labelledBy="buy-confirm-title"
      >
        <div className="px-5 pb-8">
          <h2 id="buy-confirm-title" className="t-title-sm mt-2">
            {confirm?.kind === 'pulses'
              ? `${confirm.count} Pulse${confirm.count > 1 ? 's' : ''}`
              : 'Boost'}
          </h2>
          <p className="t-caption mt-1" style={{ color: 'var(--text-secondary)' }}>
            {confirm?.kind === 'pulses'
              ? 'Pin yourself at the top of their Likes with a note.'
              : '30 minutes at the front of nearby queues.'}
          </p>
          <div className="mt-4 flex items-center justify-between">
            <span className="t-title" style={{ color: 'var(--text)' }}>
              {confirm?.price}
            </span>
            <BtnPrimary
              className="h-11 px-6"
              disabled={processing || buyPulses.isPending || buyBoost.isPending}
              onClick={() => {
                if (!confirm) return;
                if (confirm.kind === 'pulses') {
                  buyPulses.mutate({ count: confirm.count });
                } else {
                  buyBoost.mutate({ count: 1 });
                }
              }}
            >
              {processing || buyPulses.isPending || buyBoost.isPending ? (
                <Loader2 size={16} className="animate-spin" aria-hidden="true" />
              ) : (
                'Buy'
              )}
            </BtnPrimary>
          </div>
        </div>
      </GlassSheet>

      {/* — Switch to Free confirm sheet — */}
      <GlassSheet
        open={cancelOpen}
        onClose={() => !cancel.isPending && setCancelOpen(false)}
        labelledBy="cancel-title"
      >
        <div className="px-5 pb-8">
          <h2 id="cancel-title" className="t-title-sm mt-2">
            Switch to Free?
          </h2>
          <p className="t-caption mt-1" style={{ color: 'var(--text-secondary)' }}>
            You'll keep {currentTier === 'x' ? 'Resonance X' : 'Resonance+'} until the end of
            the paid period — then Free stays good: daily queue, every filter, events.
          </p>
          <div className="mt-5 flex gap-2">
            <BtnGlass className="flex-1" onClick={() => setCancelOpen(false)}>
              Keep my plan
            </BtnGlass>
            <BtnPrimary
              className="flex-1"
              disabled={cancel.isPending}
              onClick={() => cancel.mutate()}
            >
              {cancel.isPending ? (
                <Loader2 size={16} className="animate-spin" aria-hidden="true" />
              ) : (
                'Switch to Free'
              )}
            </BtnPrimary>
          </div>
        </div>
      </GlassSheet>

      {/* — Success screen — */}
      <AnimatePresence>
        {success && (
          <motion.div
            key="premium-success"
            className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-6 px-8 text-center"
            style={{ background: 'var(--stage-base)' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.32 }}
          >
            <div className="relative">
              <BrandMark size={72} />
              <motion.span
                className="absolute -inset-5 rounded-full"
                style={{ border: '1px solid var(--violet)' }}
                initial={reduced ? { opacity: 0 } : { scale: 0.72, opacity: 1 }}
                animate={reduced ? { opacity: 0 } : { scale: 1.24, opacity: 0 }}
                transition={{ duration: 0.4, ease: 'easeOut', delay: 0.2 }}
                aria-hidden="true"
              />
            </div>
            <h2 className="t-heading" style={{ color: 'var(--text-ink)' }}>
              {success === 'x' ? 'Welcome to X.' : 'Welcome to +.'}
            </h2>
            <BtnPrimary to="/likes">See who likes you</BtnPrimary>
            <BtnGhost onClick={() => setSuccess(null)}>Back to my plan</BtnGhost>
          </motion.div>
        )}
      </AnimatePresence>

      <AppToast toast={toast} onDismiss={() => setToast(null)} />

      {/* Decorative check for screen readers announcing plan state */}
      <span className="sr-only" role="status">
        {isMember ? `Current plan: Resonance${currentTier === 'x' ? ' X' : '+'}` : ''}
      </span>
    </div>
  );
}
