import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
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
  TriangleAlert,
  TrendingUp,
} from 'lucide-react';
import GlassCard from '@/components/GlassCard';
import GlassSheet from '@/components/GlassSheet';
import TabBar from '@/components/TabBar';
import VerifiedBadge from '@/components/VerifiedBadge';
import CountUp from '@/components/CountUp';
import { BtnGlass, BtnPrimary, BtnGhost } from '@/components/ui/buttons';
import { LockChip, Chip } from '@/components/settings/controls';
import { trpc } from '@/providers/trpc';
import { useAuth } from '@/hooks/useAuth';

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
  const reduced = useReducedMotion();
  const { user } = useAuth();
  const { data, isLoading } = trpc.profile.me.useQuery();
  const profile = data?.profile ?? null;
  const entitlement = data?.entitlement ?? null;

  const [goalOpen, setGoalOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [weeklyGoal, setWeeklyGoal] = useState(1);
  const [mainPhotoIdx, setMainPhotoIdx] = useState(0);

  const photos = useMemo(() => {
    const p = profile?.photos?.filter(Boolean) ?? [];
    return p.length >= 4 ? p.slice(0, 4) : FALLBACK_PHOTOS;
  }, [profile?.photos]);

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
    entitlement?.tier === 'x' ? 'Resonance X' : entitlement?.tier === 'plus' ? 'Resonance+' : 'Free';

  // Demo outcome stats (no backend endpoint — profile.md fixed values)
  const queueViews = 142;
  const likesReceived = 17;
  const datesThisWeek = 1;

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
      <div className="no-scrollbar h-full overflow-y-auto px-5 pb-28">
        {/* ── Top chrome: t-heading "You" + settings / share ─────────── */}
        <header className="flex items-center justify-between pt-4">
          <h1 className="t-heading" style={{ color: 'var(--text-ink)' }}>
            You
          </h1>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => navigate('/settings')}
              aria-label="Settings"
              className="flex h-11 w-11 items-center justify-center rounded-full"
              style={{ color: 'var(--text)' }}
            >
              <SettingsIcon size={22} aria-hidden="true" />
            </button>
            <button
              type="button"
              aria-label="Share your profile"
              className="flex h-11 w-11 items-center justify-center rounded-full"
              style={{ color: 'var(--text)' }}
            >
              <Share2 size={22} aria-hidden="true" />
            </button>
          </div>
        </header>

        {isLoading ? (
          /* ── Loading skeleton (§7.2: glass blocks + shimmer) ──────── */
          <div className="mt-5 flex flex-col gap-4" aria-busy="true" aria-label="Loading profile">
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
                      alt={`${displayName}'s main profile photo`}
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
                          PROFILE STRENGTH {strength}%
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
                        Hidden from non-matches
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
                    Verification pending — we'll notify you when it's reviewed.
                  </p>
                )}
                <div className="mt-4 grid grid-cols-1 gap-2">
                  <BtnGlass onClick={() => navigate('/profile-setup')} className="h-11 w-full">
                    Edit profile
                  </BtnGlass>
                  <BtnGlass onClick={() => setPreviewOpen(true)} className="h-11 w-full">
                    <Eye size={16} aria-hidden="true" />
                    Preview as others see you
                  </BtnGlass>
                </div>
              </GlassCard>
            </motion.div>

            {/* ── §2 This week — outcome stats ───────────────────────── */}
            <h3 className="t-eyebrow mb-3 mt-8">This week</h3>
            <div className="grid grid-cols-3 gap-3">
              <StatCard
                micro="QUEUE VIEWS"
                value={<CountUp value={queueViews} />}
                delay={0}
              />
              <StatCard
                micro="LIKES RECEIVED"
                value={<CountUp value={likesReceived} />}
                sub={
                  <span className="inline-flex items-center gap-0.5" style={{ color: 'var(--ok)' }}>
                    <TrendingUp size={12} aria-hidden="true" /> +5 this week
                  </span>
                }
                onClick={() => navigate('/likes')}
                delay={0.08}
              />
              <StatCard
                micro="DATES"
                value={
                  <span className="inline-flex items-baseline gap-1">
                    <CountUp value={datesThisWeek} />
                    <span className="t-caption" style={{ color: 'var(--text-secondary)' }}>
                      /{weeklyGoal} goal
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
                          width: `${Math.min(100, (datesThisWeek / weeklyGoal) * 100)}%`,
                          background: 'var(--violet)',
                        }}
                      />
                    </span>
                    Met
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
                aria-label="Photo insights — Resonance+ feature"
              >
                <GlassCard edge="none" className="rounded-[20px] p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2" style={{ filter: 'blur(4px)' }} aria-hidden="true">
                      <span className="t-title-sm" style={{ color: 'var(--text)' }}>Photo insights</span>
                    </div>
                    <LockChip label="Resonance+" />
                  </div>
                  <p className="t-caption mt-1.5" style={{ color: 'var(--text-secondary)' }}>
                    See which photos earn likes.
                  </p>
                </GlassCard>
              </motion.button>
            )}

            {/* ── §3 Photo performance (Resonance+ preview) ──────────── */}
            <h3 className="t-eyebrow mb-3 mt-8">Photo performance</h3>
            {isPremium ? (
              <div>
                <div className="grid grid-cols-4 gap-2">
                  {photos.map((src, i) => (
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
                        alt={`Profile photo ${i + 1}`}
                        className="aspect-[4/5] w-full rounded-[16px] object-cover"
                      />
                      {i === bestIdx && (
                        <span
                          className="t-micro absolute left-1.5 top-1.5 rounded-full px-1.5 py-0.5 font-bold text-white"
                          style={{ background: 'var(--ok)' }}
                        >
                          TOP
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
                      Photo 3 (hiking) outperforms at 2.4× — consider making it main.
                    </p>
                    <BtnGhost
                      onClick={() => setMainPhotoIdx(bestIdx)}
                      className="shrink-0 px-2 text-violet"
                    >
                      Make main
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
                    Photo performance is a Resonance+ feature — see exactly which photos earn your likes.
                  </p>
                  <BtnPrimary to="/premium" className="h-9 shrink-0 px-4" ariaLabel="Upgrade to Resonance+">
                    Upgrade
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
                <p className="t-eyebrow">Dating goal</p>
                <p className="t-value mt-2 font-bold" style={{ color: 'var(--text)' }}>
                  {weeklyGoal} date{weeklyGoal > 1 ? 's' : ''} per week
                </p>
                <p className="t-caption mt-1" style={{ color: 'var(--text-secondary)' }}>
                  On track — 4-week streak.
                </p>
                <div className="mt-3 flex gap-1.5" aria-label="4 week streak of 7 weeks shown">
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
                    Retake Reflections
                  </BtnGlass>
                </div>
                <p className="t-micro mt-2" style={{ color: 'var(--text-secondary)' }}>
                  LAST TAKEN 3 WEEKS AGO — RETAKING IMPROVES YOUR QUEUE
                </p>
              </GlassCard>
            </motion.div>

            {/* ── §5 Account quick rows ──────────────────────────────── */}
            <h3 className="t-eyebrow mb-3 mt-8">Account</h3>
            <div className="flex flex-col gap-2">
              <QuickRow
                label="Membership"
                value={tierLabel}
                right={
                  !isPremium ? (
                    <span
                      className="t-caption rounded-full px-2 py-1 font-bold text-white"
                      style={{ background: 'var(--violet)', fontSize: 10 }}
                    >
                      Upgrade
                    </span>
                  ) : undefined
                }
                onClick={() => navigate('/premium')}
                delay={0}
              />
              <QuickRow
                label="Pulses"
                value={`${pulses} left`}
                onClick={() => navigate('/premium')}
                delay={0.04}
              />
              <QuickRow
                label="Verification status"
                right={
                  verified ? (
                    <span className="t-caption inline-flex items-center gap-1 font-bold" style={{ color: 'var(--ok)' }}>
                      <VerifiedBadge size={14} /> Verified
                    </span>
                  ) : (
                    <span className="t-caption font-bold" style={{ color: 'var(--warn)' }}>
                      {verificationPending ? 'Pending' : 'Not verified'}
                    </span>
                  )
                }
                delay={0.08}
              />
              <QuickRow label="Constellation" value="1 linked partner" delay={0.12} />
              <QuickRow
                label="Notification preferences"
                onClick={() => navigate('/settings')}
                delay={0.16}
              />
            </div>
          </>
        )}
      </div>

      {/* ── TabBar (Profile is a tab root — Settings hides it, §2.3) ── */}
      <TabBar likesCount={likesReceived} />

      {/* ── Goal sheet — edit weekly goal (stepper 1–3) ────────────── */}
      <GlassSheet open={goalOpen} onClose={() => setGoalOpen(false)} labelledBy="goal-title">
        <div className="px-6 pb-8 pt-2">
          <h3 id="goal-title" className="t-title-sm" style={{ color: 'var(--text)' }}>
            Weekly dating goal
          </h3>
          <p className="t-body mt-1" style={{ color: 'var(--text-secondary)' }}>
            We pace your queue and reminders around this. Small goals count.
          </p>
          <div className="mt-5 flex items-center justify-center gap-6">
            <button
              type="button"
              aria-label="Decrease weekly goal"
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
              aria-label="Increase weekly goal"
              disabled={weeklyGoal >= 3}
              onClick={() => setWeeklyGoal((g) => Math.min(3, g + 1))}
              className="glass flex h-11 w-11 items-center justify-center rounded-full disabled:opacity-40"
              style={{ borderRadius: 999, color: 'var(--text)' }}
            >
              <Plus size={18} aria-hidden="true" />
            </button>
          </div>
          <p className="t-caption mt-2 text-center" style={{ color: 'var(--text-secondary)' }}>
            {weeklyGoal} date{weeklyGoal > 1 ? 's' : ''} per week
          </p>
          <BtnPrimary onClick={() => setGoalOpen(false)} className="mt-6 w-full">
            Save goal
          </BtnPrimary>
        </div>
      </GlassSheet>

      {/* ── Preview sheet — own data, as others see you ────────────── */}
      <GlassSheet open={previewOpen} onClose={() => setPreviewOpen(false)} labelledBy="preview-title">
        <div className="px-6 pb-8 pt-2">
          <h3 id="preview-title" className="t-title-sm" style={{ color: 'var(--text)' }}>
            How others see you
          </h3>
          <div className="relative mt-4 overflow-hidden rounded-[24px]">
            <img
              src={photos[mainPhotoIdx] ?? photos[0]}
              alt={`Preview of ${displayName}'s profile card`}
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
                  {profile?.prompts?.[0]?.answer ?? profile?.bio ?? 'Here for something real — coffee first, hikes second.'}
                </p>
              </GlassCard>
            </div>
          </div>
          <div className="mt-4 flex items-center gap-2">
            <Heart size={16} style={{ color: 'var(--violet)' }} aria-hidden="true" />
            <p className="t-caption" style={{ color: 'var(--text-secondary)' }}>
              This is the card people in your queue swipe on.
            </p>
          </div>
          <BtnPrimary onClick={() => setPreviewOpen(false)} className="mt-5 w-full">
            Done
          </BtnPrimary>
        </div>
      </GlassSheet>
    </div>
  );
}
