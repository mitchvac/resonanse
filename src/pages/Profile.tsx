import type { ReactNode } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { motion, useReducedMotion } from 'framer-motion';
import {
  Settings as SettingsIcon,
  Share2,
  Eye,
  Heart,
  Sparkles,
  Lock,
  ChevronRight,
  Minus,
  Plus,
  EyeOff,
  IdCard,
  TriangleAlert,
  TrendingUp,
  Camera,
  ImagePlus,
  Pencil,
  Loader2,
} from 'lucide-react';
import GlassCard from '@/components/GlassCard';
import GlassSheet from '@/components/GlassSheet';
import IdVerifySheet from '@/components/verify/IdVerifySheet';
import TabBar from '@/components/TabBar';
import VerifiedBadge from '@/components/VerifiedBadge';
import CountUp from '@/components/CountUp';
import { BtnGlass, BtnPrimary, BtnGhost } from '@/components/ui/buttons';
import { LockChip, Chip, ToastHost, useToasts } from '@/components/settings/controls';
import { trpc } from '@/providers/trpc';
import { formatCoins } from '@/lib/walletTrpc';
import { useAuth } from '@/hooks/useAuth';
import { fileToPhotoDataUrl } from '@/lib/photoFile';

const FALLBACK_PHOTOS = ['/self-01.jpg', '/self-02.jpg', '/self-03.jpg', '/self-04.jpg'];
const FALLBACK_CHIPS = ['Explore', 'Night owl', 'Traveler'];

const EASE_OUT = [0.22, 1, 0.36, 1] as [number, number, number, number];
const EASE_SPRING = [0.34, 1.56, 0.64, 1] as [number, number, number, number];

/* ------------------------------------------------------------------ */
/* Profile-strength arc — profile.md §1: thin violet arc draws 400ms   */
/* (Night HUD renders it as a --viz-stroke ring gauge, §3.3 viz rule)  */
/* ------------------------------------------------------------------ */
function StrengthArc({ pct }: { pct: number }) {
  const reduced = useReducedMotion();
  const r = 15.9155; // circumference = 100
  return (
    <svg width="44" height="44" viewBox="0 0 40 40" aria-hidden="true">
      <circle
        cx="20"
        cy="20"
        r={r}
        fill="none"
        stroke="var(--field)"
        strokeWidth="3"
      />
      <motion.circle
        cx="20"
        cy="20"
        r={r}
        fill="none"
        style={{ stroke: 'var(--viz-stroke, var(--violet))' }}
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray={`${pct} ${100 - pct}`}
        transform="rotate(-90 20 20)"
        initial={{ strokeDasharray: '0 100' }}
        whileInView={{ strokeDasharray: `${pct} ${100 - pct}` }}
        viewport={{ once: true }}
        transition={reduced ? { duration: 0 } : { duration: 0.4, ease: 'easeOut' }}
      />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Mini stat card — profile.md §2                                      */
/* ------------------------------------------------------------------ */
function StatCard({
  micro,
  value,
  sub,
  onClick,
  delay,
}: {
  micro: string;
  value: ReactNode;
  sub?: ReactNode;
  onClick?: () => void;
  delay: number;
}) {
  const inner = (
    <GlassCard edge="none" className="h-full rounded-[20px] p-4">
      <p className="t-micro" style={{ color: 'var(--text)' }}>
        {micro}
      </p>
      <div className="t-title mt-1.5" style={{ color: 'var(--text)' }}>
        {value}
      </div>
      {sub && <div className="t-caption mt-1">{sub}</div>}
    </GlassCard>
  );
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.4 }}
      transition={{ duration: 0.38, delay, ease: EASE_OUT }}
      className="min-w-0"
    >
      {onClick ? (
        <button type="button" onClick={onClick} className="block h-full w-full text-left">
          {inner}
        </button>
      ) : (
        inner
      )}
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/* Quick row — profile.md §5 (var(--field) fills, chevrons)            */
/* ------------------------------------------------------------------ */
function QuickRow({
  label,
  value,
  right,
  onClick,
  delay,
}: {
  label: string;
  value?: ReactNode;
  right?: ReactNode;
  onClick?: () => void;
  delay: number;
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      className="flex min-h-[44px] w-full items-center gap-3 rounded-[16px] px-4 py-3"
      style={{ background: 'var(--field)' }}
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.4 }}
      transition={{ duration: 0.32, delay, ease: EASE_OUT }}
    >
      <span className="t-value flex-1 text-left" style={{ color: 'var(--text)' }}>
        {label}
      </span>
      {value && (
        <span className="t-caption" style={{ color: 'var(--text-secondary)' }}>
          {value}
        </span>
      )}
      {right}
      {onClick && (
        <ChevronRight size={18} style={{ color: 'var(--text-secondary)' }} aria-hidden="true" />
      )}
    </motion.button>
  );
}

/* ================================================================== */
export default function Profile() {
  const navigate = useNavigate();
  const { t } = useTranslation('settings');
  const reduced = useReducedMotion();
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.profile.me.useQuery();
  const profile = data?.profile ?? null;
  const entitlement = data?.entitlement ?? null;
  const { toasts, push } = useToasts();
  const likesQuery = trpc.likes.received.useQuery();
  const matchesQuery = trpc.matches.list.useQuery();
  const walletQuery = trpc.wallet.state.useQuery(undefined, { staleTime: 60_000, retry: 1 });
  const walletSecQuery = trpc.walletSecurity.status.useQuery(undefined, { staleTime: 60_000, retry: 1 });
  const upsertProfile = trpc.profile.upsert.useMutation({
    onSuccess: () => void utils.profile.me.invalidate(),
  });
  const updateSettings = trpc.profile.updateSettings.useMutation({
    onSuccess: () => void utils.profile.me.invalidate(),
  });

  const [goalOpen, setGoalOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [idVerifyOpen, setIdVerifyOpen] = useState(false);
  const [weeklyGoal, setWeeklyGoal] = useState(1);
  const [mainPhotoIdx, setMainPhotoIdx] = useState(0);

  /* Always show the user's REAL photos (any count ≥1) — stock visuals only
     when there are zero photos at all. */
  const photos = useMemo(() => {
    const p = profile?.photos?.filter(Boolean) ?? [];
    return p.length > 0 ? p : FALLBACK_PHOTOS;
  }, [profile?.photos]);
  const realPhotoCount = profile?.photos?.filter(Boolean).length ?? 0;

  const chips = useMemo(() => {
    const d = profile?.desires?.filter(Boolean) ?? [];
    return d.length ? d.slice(0, 3) : FALLBACK_CHIPS;
  }, [profile?.desires]);

  const displayName = profile?.displayName ?? user?.name?.split(' ')[0] ?? 'Alex';
  const age = profile?.age ?? 28;
  const verified = profile?.verificationStatus === 'verified' || profile?.verified === true;
  const verificationPending = profile?.verificationStatus === 'pending';
  const anonymity = profile?.anonymityMode === true;
  const isPremium = !!entitlement && entitlement.tier !== 'free';
  const pulses = entitlement?.pulses ?? 3;
  const tierLabel =
    entitlement?.tier === 'x' ? 'Resonance X' : entitlement?.tier === 'plus' ? 'Resonance+' : t('tiers.free');

  /* Share — copy the profile link to the clipboard */
  const shareProfile = async () => {
    const url = `${window.location.origin}/profile`;
    try {
      await navigator.clipboard.writeText(url);
      push(t('profile.toasts.linkCopied'));
    } catch {
      try {
        const ta = document.createElement('textarea');
        ta.value = url;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
        push(t('profile.toasts.linkCopied'));
      } catch {
        push(t('profile.toasts.linkCopyError'));
      }
    }
  };

  /* Make-main — persist the reordered photos array (any count ≥2) */
  const makeMain = (idx: number) => {
    const real = profile?.photos?.filter(Boolean) ?? [];
    if (real.length > 1 && idx < real.length) {
      const reordered = [real[idx], ...real.filter((_, i) => i !== idx)];
      setMainPhotoIdx(0);
      upsertProfile.mutate({ photos: reordered });
    } else {
      setMainPhotoIdx(idx);
    }
  };

  /* ---- Photo management (add / replace / remove) — persists via upsert;
     no optimistic keep: a failed save leaves the old photos in place. ---- */
  const [photoSheet, setPhotoSheet] = useState<'add' | number | null>(null);
  const [photoPending, setPhotoPending] = useState<'add' | number | null>(null);
  const photoTarget = useRef<'add' | number>('add');
  const libraryInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);

  const pickPhotoFile = (target: 'add' | number, source: 'library' | 'camera') => {
    photoTarget.current = target;
    setPhotoSheet(null);
    const input = source === 'camera' ? cameraInput.current : libraryInput.current;
    if (input) {
      input.value = '';
      input.click();
    }
  };

  const handlePhotoFile = async (file: File | null | undefined) => {
    if (!file || photoPending !== null) return;
    setPhotoPending(photoTarget.current);
    try {
      const dataUrl = await fileToPhotoDataUrl(file);
      const real = profile?.photos?.filter(Boolean) ?? [];
      const target = photoTarget.current;
      const next =
        target === 'add'
          ? [...real, dataUrl].slice(0, 6)
          : real.map((p, i) => (i === target ? dataUrl : p));
      await upsertProfile.mutateAsync({ photos: next });
      push(target === 'add' ? t('profile.toasts.photoAdded') : t('profile.toasts.photoUpdated'));
    } catch {
      push(t('profile.toasts.photoSaveError'));
    } finally {
      setPhotoPending(null);
    }
  };

  const removeRealPhoto = async (idx: number) => {
    setPhotoSheet(null);
    if (photoPending !== null) return;
    setPhotoPending(idx);
    try {
      const real = profile?.photos?.filter(Boolean) ?? [];
      await upsertProfile.mutateAsync({ photos: real.filter((_, i) => i !== idx) });
      setMainPhotoIdx(0);
      push(t('profile.toasts.photoRemoved'));
    } catch {
      push(t('profile.toasts.photoRemoveError'));
    } finally {
      setPhotoPending(null);
    }
  };

  /* Weekly goal — server value wins once loaded */
  useEffect(() => {
    const g = profile?.weeklyGoal;
    if (typeof g === 'number' && g >= 1 && g <= 3) setWeeklyGoal(g);
  }, [profile?.weeklyGoal]);

  const saveWeeklyGoal = (goal: number) => {
    updateSettings.mutate({ weeklyGoal: goal });
    setGoalOpen(false);
    push(t('profile.toasts.goalSaved'));
  };

  // Honest outcome stats — real likes, matches, and We Met check-ins
  const likesReceived = (likesQuery.data?.likes.length ?? 0) + (likesQuery.data?.pulses.length ?? 0);
  const matchEntries = matchesQuery.data?.matches ?? [];
  const matchCount = matchEntries.length;
  const datesCount = matchEntries.filter(
    (m) => m.match.weMet === 'met' || m.match.weMet === 'dated',
  ).length;
  const constellationCount = profile?.constellation?.length ?? 0;

  // Profile strength — completeness heuristic over real fields, floored at spec demo value
  const strength = useMemo(() => {
    if (!profile) return 86;
    let s = 30;
    s += Math.min(4, profile.photos?.length ?? 0) * 10;
    s += Math.min(3, profile.prompts?.length ?? 0) * 7;
    if (profile.bio) s += 10;
    if (profile.desires?.length) s += 8;
    if (verified) s += 11;
    return Math.min(98, Math.max(52, s));
  }, [profile, verified]);

  // Photo like-rates for §3 premium preview (relative %, best = 100)
  const likeRates = [62, 48, 100, 74];
  const bestIdx = likeRates.indexOf(Math.max(...likeRates));

  return (
    <div className="relative h-full">
      <ToastHost toasts={toasts} />
      <div className="no-scrollbar h-full overflow-y-auto px-5 pb-32">
        {/* ── Top chrome: t-heading "You" + settings / share ─────────── */}
        <header className="flex items-center justify-between pt-4">
          <h1 className="t-heading" style={{ color: 'var(--text-ink)' }}>
            {t('profile.title')}
          </h1>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => navigate('/settings')}
              aria-label={t('profile.settingsAria')}
              className="flex h-11 w-11 items-center justify-center rounded-full"
              style={{ color: 'var(--text)' }}
            >
              <SettingsIcon size={22} aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => void shareProfile()}
              aria-label={t('profile.shareAria')}
              className="flex h-11 w-11 items-center justify-center rounded-full"
              style={{ color: 'var(--text)' }}
            >
              <Share2 size={22} aria-hidden="true" />
            </button>
          </div>
        </header>

        {isLoading ? (
          /* ── Loading skeleton (§7.2: glass blocks + shimmer) ──────── */
          <div className="mt-5 flex flex-col gap-4" aria-busy="true" aria-label={t('profile.loadingAria')}>
            <div className="glass skeleton-shimmer h-44 rounded-[24px]" />
            <div className="grid grid-cols-3 gap-3">
              <div className="glass skeleton-shimmer h-24 rounded-[20px]" />
              <div className="glass skeleton-shimmer h-24 rounded-[20px]" />
              <div className="glass skeleton-shimmer h-24 rounded-[20px]" />
            </div>
            <div className="glass skeleton-shimmer h-28 rounded-[24px]" />
          </div>
        ) : (
          <>
            {/* ── §1 Profile hero — the page's edge-glow surface ─────── */}
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.42, ease: EASE_SPRING }}
              className="mt-5"
            >
              <GlassCard edge="amber" ringX={-40} className="p-5">
                <div className="flex gap-4">
                  <div className="relative shrink-0">
                    <motion.img
                      src={photos[mainPhotoIdx] ?? photos[0]}
                      alt={t('profile.mainPhotoAlt', { name: displayName })}
                      className="h-[88px] w-[88px] rounded-[16px] object-cover"
                      initial={reduced ? { opacity: 0 } : { opacity: 0, filter: 'blur(8px)' }}
                      animate={reduced ? { opacity: 1 } : { opacity: 1, filter: 'blur(0px)' }}
                      transition={{ duration: 0.4, ease: 'easeOut' }}
                    />
                    {verified && (
                      <span className="absolute -bottom-1.5 -right-1.5 rounded-full" style={{ background: 'var(--stage-base)' }}>
                        <VerifiedBadge size={20} />
                      </span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <h2 className="t-title truncate" style={{ color: 'var(--text)' }}>
                        {displayName}, {age}
                      </h2>
                      <div className="flex shrink-0 flex-col items-center">
                        <StrengthArc pct={strength} />
                        <span className="t-micro mt-1" style={{ color: 'var(--text)' }}>
                          {t('profile.strengthLabel', { pct: strength })}
                        </span>
                      </div>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {chips.map((c) => (
                        <Chip key={c}>{c}</Chip>
                      ))}
                    </div>
                    {anonymity && (
                      <p className="t-caption mt-2 inline-flex items-center gap-1" style={{ color: 'var(--text-secondary)' }}>
                        <EyeOff size={12} aria-hidden="true" />
                        {t('profile.hiddenFromNonMatches')}
                      </p>
                    )}
                  </div>
                </div>
                {verificationPending && (
                  <p
                    className="t-caption mt-3 flex items-center gap-1.5 rounded-[12px] px-3 py-2"
                    style={{ background: 'var(--field)', color: 'var(--warn)' }}
                    role="status"
                  >
                    <TriangleAlert size={14} aria-hidden="true" />
                    {t('profile.verificationPending')}
                  </p>
                )}
                {/* ID verification — badge row when done, CTA row otherwise */}
                {profile?.idVerifiedAt ? (
                  <p
                    className="t-caption mt-3 flex items-center gap-1.5 rounded-[12px] px-3 py-2 font-bold"
                    style={{ background: 'var(--field)', color: 'var(--ok)' }}
                  >
                    <IdCard size={14} aria-hidden="true" />
                    {t('profile.idVerified')}
                  </p>
                ) : (
                  <button
                    type="button"
                    onClick={() => setIdVerifyOpen(true)}
                    className="t-caption mt-3 flex min-h-[44px] w-full items-center gap-1.5 rounded-[12px] px-3 py-2 text-left font-bold"
                    style={{ background: 'var(--field)', color: 'var(--text)' }}
                  >
                    <IdCard size={14} style={{ color: 'var(--violet)' }} aria-hidden="true" />
                    <span className="flex-1">{t('profile.verifyId')}</span>
                    <span className="font-normal" style={{ color: 'var(--text-secondary)' }}>
                      {t('profile.verifyIdHint')}
                    </span>
                    <ChevronRight size={15} style={{ color: 'var(--text-secondary)' }} aria-hidden="true" />
                  </button>
                )}
                <div className="mt-4 grid grid-cols-1 gap-2">
                  <BtnGlass onClick={() => navigate('/profile-setup')} className="h-11 w-full">
                    {t('profile.editProfile')}
                  </BtnGlass>
                  <BtnGlass onClick={() => setPreviewOpen(true)} className="h-11 w-full">
                    <Eye size={16} aria-hidden="true" />
                    {t('profile.previewAsOthers')}
                  </BtnGlass>
                </div>
              </GlassCard>
            </motion.div>

            {/* ── Your photos — add / replace / make main / remove ────── */}
            <h3 className="t-eyebrow mb-3 mt-8">{t('profile.yourPhotos')}</h3>
            <div className="grid grid-cols-3 gap-2">
              {photos.slice(0, 6).map((src, i) => {
                const isReal = i < realPhotoCount;
                return (
                  <motion.button
                    key={src.slice(0, 48) + i}
                    type="button"
                    disabled={!isReal}
                    onClick={() => setPhotoSheet(i)}
                    aria-label={isReal ? t('profile.editPhotoAria', { n: i + 1 }) : t('profile.photoAria', { n: i + 1 })}
                    className="relative aspect-[4/5] overflow-hidden rounded-[16px] text-left disabled:cursor-default"
                    initial={{ opacity: 0, y: 12 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.3, delay: i * 0.05 }}
                  >
                    <img
                      src={src}
                      alt={t('profile.photoAlt', { n: i + 1 })}
                      className="h-full w-full object-cover"
                    />
                    {i === 0 && isReal && (
                      <span className="t-micro absolute left-1.5 top-1.5 rounded-full bg-black/45 px-2 py-0.5 text-white">
                        {t('profile.mainTag')}
                      </span>
                    )}
                    {isReal && (
                      <span
                        className="absolute bottom-1.5 right-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-black/45 text-white"
                        aria-hidden="true"
                      >
                        {photoPending === i ? (
                          <Loader2 size={13} className="animate-spin" />
                        ) : (
                          <Pencil size={13} />
                        )}
                      </span>
                    )}
                  </motion.button>
                );
              })}
              {realPhotoCount < 6 && (
                <motion.button
                  type="button"
                  onClick={() => setPhotoSheet('add')}
                  disabled={photoPending !== null}
                  aria-label={t('profile.addPhotoAria')}
                  className="relative flex aspect-[4/5] items-center justify-center rounded-[16px] disabled:opacity-50"
                  initial={{ opacity: 0, y: 12 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.3, delay: Math.min(realPhotoCount, 6) * 0.05 }}
                >
                  <span
                    className="absolute inset-0 rounded-[16px]"
                    style={{ border: '1.5px dashed var(--text)', opacity: 0.25 }}
                    aria-hidden="true"
                  />
                  {photoPending === 'add' ? (
                    <Loader2 size={20} className="animate-spin" style={{ color: 'var(--text)' }} aria-hidden="true" />
                  ) : (
                    <Plus size={20} style={{ color: 'var(--text)', opacity: 0.5 }} aria-hidden="true" />
                  )}
                </motion.button>
              )}
            </div>

            {/* ── §2 This week — outcome stats ───────────────────────── */}
            <h3 className="t-eyebrow mb-3 mt-8">{t('profile.thisWeek')}</h3>
            <div className="grid grid-cols-3 gap-3">
              <StatCard
                micro={t('profile.matchesMicro')}
                value={<CountUp value={matchCount} />}
                onClick={() => navigate('/matches')}
                delay={0}
              />
              <StatCard
                micro={t('profile.likesMicro')}
                value={<CountUp value={likesReceived} />}
                sub={
                  likesReceived > 0 ? (
                    <span className="inline-flex items-center gap-0.5" style={{ color: 'var(--ok)' }}>
                      <TrendingUp size={12} aria-hidden="true" /> {t('profile.inLikesTab')}
                    </span>
                  ) : undefined
                }
                onClick={() => navigate('/likes')}
                delay={0.08}
              />
              <StatCard
                micro={t('profile.datesMicro')}
                value={
                  <span className="inline-flex items-baseline gap-1">
                    <CountUp value={datesCount} />
                    <span className="t-caption" style={{ color: 'var(--text-secondary)' }}>
                      {t('profile.datesGoal', { goal: weeklyGoal })}
                    </span>
                  </span>
                }
                sub={
                  <span className="inline-flex items-center gap-1" style={{ color: 'var(--violet)' }}>
                    <span
                      className="h-1.5 w-8 overflow-hidden rounded-full"
                      style={{ background: 'var(--field)' }}
                      aria-hidden="true"
                    >
                      <span
                        className="block h-full rounded-full"
                        style={{
                          width: `${Math.min(100, (datesCount / weeklyGoal) * 100)}%`,
                          background: 'var(--violet)',
                        }}
                      />
                    </span>
                    {t('profile.met')}
                  </span>
                }
                onClick={() => setGoalOpen(true)}
                delay={0.16}
              />
            </div>

            {/* Premium teaser — blurred-locked fourth card */}
            {!isPremium && (
              <motion.button
                type="button"
                onClick={() => navigate('/premium')}
                className="mt-3 block w-full text-left"
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.4 }}
                transition={{ duration: 0.38, delay: 0.24, ease: EASE_OUT }}
                aria-label={t('profile.photoInsightsAria')}
              >
                <GlassCard edge="none" className="rounded-[20px] p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2" style={{ filter: 'blur(4px)' }} aria-hidden="true">
                      <span className="t-title-sm" style={{ color: 'var(--text)' }}>{t('profile.photoInsights')}</span>
                    </div>
                    <LockChip label="Resonance+" />
                  </div>
                  <p className="t-caption mt-1.5" style={{ color: 'var(--text-secondary)' }}>
                    {t('profile.photoInsightsCaption')}
                  </p>
                </GlassCard>
              </motion.button>
            )}

            {/* ── §3 Photo performance (Resonance+ preview) ──────────── */}
            <h3 className="t-eyebrow mb-3 mt-8">{t('profile.photoPerformance')}</h3>
            {isPremium ? (
              <div>
                <div className="grid grid-cols-4 gap-2">
                  {photos.slice(0, 4).map((src, i) => (
                    <motion.div
                      key={src + i}
                      className="relative"
                      initial={{ opacity: 0, y: 12 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true }}
                      transition={{ duration: 0.3, delay: i * 0.06 }}
                    >
                      <img
                        src={src}
                        alt={t('profile.photoAlt', { n: i + 1 })}
                        className="aspect-[4/5] w-full rounded-[16px] object-cover"
                      />
                      {i === bestIdx && (
                        <span
                          className="t-micro absolute left-1.5 top-1.5 rounded-full px-1.5 py-0.5 font-bold text-white"
                          style={{ background: 'var(--ok)' }}
                        >
                          {t('profile.topTag')}
                        </span>
                      )}
                      <div
                        className="mt-1.5 flex h-9 items-end justify-center"
                        aria-hidden="true"
                      >
                        <motion.div
                          className="w-1 rounded-full"
                          style={{
                            height: `${Math.max(12, likeRates[i] * 0.36)}px`,
                            background: 'var(--viz-stroke, var(--violet))',
                            transformOrigin: 'bottom',
                          }}
                          initial={{ scaleY: 0 }}
                          whileInView={{ scaleY: 1 }}
                          viewport={{ once: true }}
                          transition={{ duration: 0.4, delay: i * 0.06 }}
                        />
                      </div>
                      <p className="t-micro mt-1 text-center" style={{ color: 'var(--text)' }}>
                        {likeRates[i]}%
                      </p>
                    </motion.div>
                  ))}
                </div>
                <motion.div
                  initial={{ opacity: 0, y: 12 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.3, delay: 0.24 }}
                  className="mt-3"
                >
                  <GlassCard edge="none" className="flex items-center gap-2.5 rounded-[20px] p-4">
                    <Sparkles size={18} style={{ color: 'var(--violet)' }} aria-hidden="true" />
                    <p className="t-caption flex-1" style={{ color: 'var(--text)' }}>
                      {t('profile.photoTip')}
                    </p>
                    <BtnGhost
                      onClick={() => makeMain(bestIdx)}
                      className="shrink-0 px-2 text-violet"
                    >
                      {t('profile.makeMain')}
                    </BtnGhost>
                  </GlassCard>
                </motion.div>
              </div>
            ) : (
              /* Free state — single GateCard row (§8.11: gates may carry edge) */
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.3 }}
              >
                <GlassCard edge="amber" className="flex items-center gap-3 rounded-[20px] p-4">
                  <Lock size={18} style={{ color: 'var(--text)' }} aria-hidden="true" />
                  <p className="t-caption flex-1" style={{ color: 'var(--text)' }}>
                    {t('profile.performanceGate')}
                  </p>
                  <BtnPrimary to="/premium" className="h-9 shrink-0 px-4" ariaLabel={t('profile.upgradeAria')}>
                    {t('profile.upgrade')}
                  </BtnPrimary>
                </GlassCard>
              </motion.div>
            )}

            {/* ── §4 Goal & reflections ──────────────────────────────── */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{ duration: 0.38, ease: EASE_OUT }}
              className="mt-8"
            >
              <GlassCard edge="none" className="p-5">
                <p className="t-eyebrow">{t('profile.datingGoal')}</p>
                <p className="t-value mt-2 font-bold" style={{ color: 'var(--text)' }}>
                  {t('profile.datesPerWeek', { count: weeklyGoal })}
                </p>
                <p className="t-caption mt-1" style={{ color: 'var(--text-secondary)' }}>
                  {t('profile.onTrack')}
                </p>
                <div className="mt-3 flex gap-1.5" aria-label={t('profile.streakAria', { done: 4, total: 7 })}>
                  {Array.from({ length: 7 }, (_, i) => (
                    <motion.span
                      key={i}
                      className="h-2 w-2 rounded-full"
                      style={{ background: i < 4 ? 'var(--violet)' : 'var(--field)' }}
                      initial={{ scale: 0 }}
                      whileInView={{ scale: 1 }}
                      viewport={{ once: true }}
                      transition={{ duration: 0.24, delay: i * 0.06, ease: EASE_SPRING }}
                    />
                  ))}
                </div>
                <div className="mt-4 flex items-center justify-between gap-3">
                  <BtnGlass onClick={() => navigate('/profile-setup')} className="h-11 flex-1">
                    {t('profile.retakeReflections')}
                  </BtnGlass>
                </div>
                <p className="t-micro mt-2" style={{ color: 'var(--text-secondary)' }}>
                  {t('profile.lastTaken')}
                </p>
              </GlassCard>
            </motion.div>

            {/* ── §5 Account quick rows ──────────────────────────────── */}
            <h3 className="t-eyebrow mb-3 mt-8">{t('profile.accountSection')}</h3>
            <div className="flex flex-col gap-2">
              <QuickRow
                label={t('profile.membership')}
                value={tierLabel}
                right={
                  !isPremium ? (
                    <span
                      className="t-caption rounded-full px-2 py-1 font-bold text-white"
                      style={{ background: 'var(--violet)', fontSize: 10 }}
                    >
                      {t('profile.upgrade')}
                    </span>
                  ) : undefined
                }
                onClick={() => navigate('/premium')}
                delay={0}
              />
              <QuickRow
                label={t('profile.pulses')}
                value={t('profile.pulsesLeft', { count: pulses })}
                onClick={() => navigate('/premium')}
                delay={0.04}
              />
              <QuickRow
                label={t('profile.wallet')}
                value={
                  walletQuery.data
                    ? walletQuery.data.hasWallet
                      ? `${formatCoins(walletQuery.data.balance)} DC`
                      : t('profile.setUpDateCoin')
                    : undefined
                }
                right={
                  walletSecQuery.data?.hasWallet ? (
                    walletSecQuery.data.delegation?.status === 'active' ? (
                      <span className="t-caption font-bold" style={{ color: 'var(--ok)' }}>
                        {t('profile.ecosystemOn')}
                      </span>
                    ) : (
                      <span
                        className="t-caption font-bold"
                        style={{ color: 'var(--text-secondary)' }}
                      >
                        {t('profile.ecosystemOff')}
                      </span>
                    )
                  ) : undefined
                }
                onClick={() => navigate('/wallet')}
                delay={0.06}
              />
              <QuickRow
                label={t('profile.verificationStatus')}
                right={
                  verified ? (
                    <span className="t-caption inline-flex items-center gap-1 font-bold" style={{ color: 'var(--ok)' }}>
                      <VerifiedBadge size={14} /> {t('profile.verified')}
                    </span>
                  ) : (
                    <span className="t-caption font-bold" style={{ color: 'var(--warn)' }}>
                      {verificationPending ? t('profile.pending') : t('profile.notVerified')}
                    </span>
                  )
                }
                delay={0.08}
              />
              <QuickRow
                label={t('profile.constellation')}
                value={
                  constellationCount > 0
                    ? t('profile.linkedPartners', { count: constellationCount })
                    : t('profile.linkPartner')
                }
                onClick={() => navigate('/profile-setup')}
                delay={0.12}
              />
              <QuickRow
                label={t('profile.notificationPrefs')}
                onClick={() => navigate('/settings')}
                delay={0.16}
              />
            </div>
          </>
        )}
      </div>

      {/* ── TabBar (Profile is a tab root — Settings hides it, §2.3) ── */}
      <TabBar likesCount={likesReceived} />

      {/* ── ID verification takeover (privacy-first, in-browser scan) ── */}
      <IdVerifySheet open={idVerifyOpen} onClose={() => setIdVerifyOpen(false)} />

      {/* ── Photo pickers — hidden library input + camera capture input ── */}
      <input
        ref={libraryInput}
        type="file"
        accept="image/*"
        className="hidden"
        aria-hidden="true"
        tabIndex={-1}
        onChange={(e) => void handlePhotoFile(e.target.files?.[0])}
      />
      <input
        ref={cameraInput}
        type="file"
        accept="image/*"
        capture="user"
        className="hidden"
        aria-hidden="true"
        tabIndex={-1}
        onChange={(e) => void handlePhotoFile(e.target.files?.[0])}
      />

      {/* ── Add-photo sheet — Camera / Library ──────────────────────── */}
      <GlassSheet open={photoSheet === 'add'} onClose={() => setPhotoSheet(null)} labelledBy="add-photo-title">
        <div className="px-6 pb-8 pt-2">
          <h3 id="add-photo-title" className="t-title-sm" style={{ color: 'var(--text)' }}>
            {t('profile.addPhotoSheet.title')}
          </h3>
          <div className="mt-4 flex flex-col gap-2">
            {(
              [
                { icon: Camera, label: t('profile.addPhotoSheet.camera'), hint: t('profile.addPhotoSheet.cameraHint'), source: 'camera' },
                { icon: ImagePlus, label: t('profile.addPhotoSheet.library'), hint: t('profile.addPhotoSheet.libraryHint'), source: 'library' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.label}
                type="button"
                onClick={() => pickPhotoFile('add', opt.source)}
                className="flex min-h-[52px] items-center gap-3 rounded-2xl px-4 text-left transition-colors duration-fast"
                style={{ background: 'var(--field)' }}
              >
                <opt.icon size={20} style={{ color: 'var(--text)' }} aria-hidden="true" />
                <span>
                  <span className="t-button block" style={{ color: 'var(--text)' }}>
                    {opt.label}
                  </span>
                  <span className="t-caption block" style={{ color: 'var(--text-secondary)' }}>
                    {opt.hint}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </div>
      </GlassSheet>

      {/* ── Edit-photo sheet — Replace / Make main / Remove ─────────── */}
      <GlassSheet
        open={typeof photoSheet === 'number'}
        onClose={() => setPhotoSheet(null)}
        labelledBy="edit-photo-title"
      >
        <div className="px-6 pb-8 pt-2">
          <h3 id="edit-photo-title" className="t-title-sm" style={{ color: 'var(--text)' }}>
            {t('profile.editPhotoSheet.title')}
          </h3>
          <div className="mt-4 flex flex-col gap-2">
            {(
              [
                {
                  label: t('profile.editPhotoSheet.replace'),
                  action: () => typeof photoSheet === 'number' && pickPhotoFile(photoSheet, 'library'),
                },
                {
                  label: t('profile.editPhotoSheet.takeNew'),
                  action: () => typeof photoSheet === 'number' && pickPhotoFile(photoSheet, 'camera'),
                },
                {
                  label: t('profile.makeMain'),
                  action: () => {
                    if (typeof photoSheet === 'number') makeMain(photoSheet);
                    setPhotoSheet(null);
                  },
                },
                {
                  label: t('profile.editPhotoSheet.remove'),
                  danger: true,
                  action: () => typeof photoSheet === 'number' && void removeRealPhoto(photoSheet),
                },
              ] as { label: string; action: () => void; danger?: boolean }[]
            ).map((opt) => (
              <button
                key={opt.label}
                type="button"
                onClick={opt.action}
                className="flex min-h-[52px] items-center rounded-2xl px-4 text-left transition-colors duration-fast"
                style={{ background: 'var(--field)' }}
              >
                <span
                  className="t-button"
                  style={{ color: opt.danger ? 'var(--danger)' : 'var(--text)' }}
                >
                  {opt.label}
                </span>
              </button>
            ))}
          </div>
        </div>
      </GlassSheet>

      {/* ── Goal sheet — edit weekly goal (stepper 1–3) ────────────── */}
      <GlassSheet open={goalOpen} onClose={() => setGoalOpen(false)} labelledBy="goal-title">
        <div className="px-6 pb-8 pt-2">
          <h3 id="goal-title" className="t-title-sm" style={{ color: 'var(--text)' }}>
            {t('profile.goalSheet.title')}
          </h3>
          <p className="t-body mt-1" style={{ color: 'var(--text-secondary)' }}>
            {t('profile.goalSheet.body')}
          </p>
          <div className="mt-5 flex items-center justify-center gap-6">
            <button
              type="button"
              aria-label={t('profile.goalSheet.decreaseAria')}
              disabled={weeklyGoal <= 1}
              onClick={() => setWeeklyGoal((g) => Math.max(1, g - 1))}
              className="glass flex h-11 w-11 items-center justify-center rounded-full disabled:opacity-40"
              style={{ borderRadius: 999, color: 'var(--text)' }}
            >
              <Minus size={18} aria-hidden="true" />
            </button>
            <span className="t-heading w-16 text-center" style={{ color: 'var(--text)' }} aria-live="polite">
              {weeklyGoal}
            </span>
            <button
              type="button"
              aria-label={t('profile.goalSheet.increaseAria')}
              disabled={weeklyGoal >= 3}
              onClick={() => setWeeklyGoal((g) => Math.min(3, g + 1))}
              className="glass flex h-11 w-11 items-center justify-center rounded-full disabled:opacity-40"
              style={{ borderRadius: 999, color: 'var(--text)' }}
            >
              <Plus size={18} aria-hidden="true" />
            </button>
          </div>
          <p className="t-caption mt-2 text-center" style={{ color: 'var(--text-secondary)' }}>
            {t('profile.datesPerWeek', { count: weeklyGoal })}
          </p>
          <BtnPrimary onClick={() => saveWeeklyGoal(weeklyGoal)} className="mt-6 w-full">
            {t('profile.goalSheet.save')}
          </BtnPrimary>
        </div>
      </GlassSheet>

      {/* ── Preview sheet — own data, as others see you ────────────── */}
      <GlassSheet open={previewOpen} onClose={() => setPreviewOpen(false)} labelledBy="preview-title">
        <div className="px-6 pb-8 pt-2">
          <h3 id="preview-title" className="t-title-sm" style={{ color: 'var(--text)' }}>
            {t('profile.previewSheet.title')}
          </h3>
          <div className="relative mt-4 overflow-hidden rounded-[24px]">
            <img
              src={photos[mainPhotoIdx] ?? photos[0]}
              alt={t('profile.previewSheet.alt', { name: displayName })}
              className="aspect-[4/5] w-full object-cover"
            />
            <div className="photo-scrim absolute inset-0" aria-hidden="true" />
            <div className="absolute inset-x-4 bottom-4">
              <GlassCard edge="none" className="p-4">
                <div className="flex items-center gap-1.5">
                  <span className="t-title" style={{ color: 'var(--text)' }}>
                    {displayName}, {age}
                  </span>
                  {verified && <VerifiedBadge size={16} />}
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {chips.map((c) => (
                    <Chip key={c}>{c}</Chip>
                  ))}
                </div>
                <p className="t-value mt-2" style={{ color: 'var(--text)' }}>
                  {profile?.prompts?.[0]?.answer ?? profile?.bio ?? t('profile.previewSheet.bioFallback')}
                </p>
              </GlassCard>
            </div>
          </div>
          <div className="mt-4 flex items-center gap-2">
            <Heart size={16} style={{ color: 'var(--violet)' }} aria-hidden="true" />
            <p className="t-caption" style={{ color: 'var(--text-secondary)' }}>
              {t('profile.previewSheet.cardNote')}
            </p>
          </div>
          <BtnPrimary onClick={() => setPreviewOpen(false)} className="mt-5 w-full">
            {t('profile.previewSheet.done')}
          </BtnPrimary>
        </div>
      </GlassSheet>
    </div>
  );
}
