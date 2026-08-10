import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  Sun,
  Moon,
  MonitorSmartphone,
  MapPin,
  EyeOff,
  Camera,
  ShieldCheck,
  MessageSquareOff,
  Bell,
  Sparkles,
  Trash2,
  Download,
  LogOut,
  Plus,
  BadgeCheck,
  ExternalLink,
  PauseCircle,
  Wallet,
} from 'lucide-react';
import GlassCard from '@/components/GlassCard';
import GlassSheet from '@/components/GlassSheet';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import { BtnPrimary, BtnGlass, BtnGhost } from '@/components/ui/buttons';
import VerifiedBadge from '@/components/VerifiedBadge';
import {
  Section,
  SettingRow,
  Toggle,
  SegmentedControl,
  RangeSlider,
  DualRangeSlider,
  Chip,
  LockChip,
  ToastHost,
  useToasts,
  RangeStyleTag,
} from '@/components/settings/controls';
import HoldToConfirm from '@/components/settings/HoldToConfirm';
import { trpc } from '@/providers/trpc';
import { useAuth } from '@/hooks/useAuth';

/* ------------------------------------------------------------------ */
/* Theme — bootstrap contract (index.html): localStorage key            */
/* 'resonance-theme' holds 'light' | 'dark' | 'system'; the resolved     */
/* value is applied to <html data-theme>.                               */
/* ------------------------------------------------------------------ */
type ThemeChoice = 'light' | 'dark' | 'system';

function resolveTheme(choice: ThemeChoice): 'light' | 'dark' {
  if (choice !== 'system') return choice;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/* ------------------------------------------------------------------ */
/* Shared localStorage contracts — the Discover page reads these too.  */
/* ------------------------------------------------------------------ */
type DiscoveryPrefs = { minAge: number; maxAge: number; maxDistance: number; showMe: string[] };
const DISCOVERY_PREFS_KEY = 'resonance-discovery-prefs';
const DEFAULT_DISCOVERY: DiscoveryPrefs = {
  minAge: 24,
  maxAge: 34,
  maxDistance: 25,
  showMe: ['Women', 'Nonbinary'],
};

function readDiscoveryPrefs(): DiscoveryPrefs {
  try {
    const raw = localStorage.getItem(DISCOVERY_PREFS_KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<DiscoveryPrefs>;
      return {
        minAge: typeof p.minAge === 'number' ? p.minAge : DEFAULT_DISCOVERY.minAge,
        maxAge: typeof p.maxAge === 'number' ? p.maxAge : DEFAULT_DISCOVERY.maxAge,
        maxDistance:
          typeof p.maxDistance === 'number' ? p.maxDistance : DEFAULT_DISCOVERY.maxDistance,
        showMe: Array.isArray(p.showMe) ? p.showMe.filter((s) => typeof s === 'string') : DEFAULT_DISCOVERY.showMe,
      };
    }
  } catch {
    /* private mode */
  }
  return DEFAULT_DISCOVERY;
}

type QuietHours = { enabled: boolean; from: string; to: string };
const QUIET_HOURS_KEY = 'resonance-quiet-hours';

function readQuietHours(): QuietHours {
  try {
    const raw = localStorage.getItem(QUIET_HOURS_KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<QuietHours>;
      return {
        enabled: p.enabled === true,
        from: typeof p.from === 'string' ? p.from : '22:00',
        to: typeof p.to === 'string' ? p.to : '08:00',
      };
    }
  } catch {
    /* private mode */
  }
  return { enabled: false, from: '22:00', to: '08:00' };
}

function readThemeChoice(): ThemeChoice {
  try {
    const saved = localStorage.getItem('resonance-theme');
    if (saved === 'light' || saved === 'dark' || saved === 'system') return saved;
  } catch {
    /* private mode */
  }
  return 'light';
}

/* ------------------------------------------------------------------ */
/* Local persisted boolean toggle (notification prefs, discovery, etc.) */
/* ------------------------------------------------------------------ */
function useLocalToggle(key: string, initial: boolean): [boolean, (v: boolean) => void] {
  const [value, setValue] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem(key);
      if (saved !== null) return saved === 'true';
    } catch {
      /* private mode */
    }
    return initial;
  });
  const set = useCallback(
    (v: boolean) => {
      setValue(v);
      try {
        localStorage.setItem(key, String(v));
      } catch {
        /* private mode */
      }
    },
    [key],
  );
  return [value, set];
}

/* ------------------------------------------------------------------ */
/* Sub-view top bar — glass, back + title (settings.md intro)          */
/* ------------------------------------------------------------------ */
function TopBar({ title, onBack }: { title: string; onBack: () => void }) {
  const { t } = useTranslation('settings');
  return (
    <div className="sticky top-0 z-40 -mx-5 px-5 pb-2 pt-4">
      <div className="glass flex h-14 items-center gap-2 px-2" style={{ borderRadius: 24 }}>
        <button
          type="button"
          onClick={onBack}
          aria-label={t('common.back')}
          className="flex h-11 w-11 items-center justify-center rounded-full"
          style={{ color: 'var(--text)' }}
        >
          <ArrowLeft size={20} aria-hidden="true" />
        </button>
        <h1 className="t-title-sm flex-1" style={{ color: 'var(--text)' }}>
          {title}
        </h1>
      </div>
    </div>
  );
}

/* ================================================================== */
export default function Settings() {
  const navigate = useNavigate();
  const { t } = useTranslation('settings');
  const { logout } = useAuth();
  const utils = trpc.useUtils();
  const { data: meData, isLoading: meLoading } = trpc.profile.me.useQuery();
  const profile = meData?.profile ?? null;
  const entitlement = meData?.entitlement ?? null;
  const isPremium = !!entitlement && entitlement.tier !== 'free';
  const verified = profile?.verificationStatus === 'verified' || profile?.verified === true;

  const { toasts, push } = useToasts();
  const [view, setView] = useState<'main' | 'hidden-words' | 'blocked'>('main');

  /* ── §1 Appearance ──────────────────────────────────────────────── */
  const [theme, setThemeState] = useState<ThemeChoice>(readThemeChoice);
  const applyTheme = useCallback((choice: ThemeChoice) => {
    setThemeState(choice);
    try {
      localStorage.setItem('resonance-theme', choice);
    } catch {
      /* private mode */
    }
    document.documentElement.dataset.theme = resolveTheme(choice);
  }, []);
  // Keep in sync with the OS while "system" is selected.
  useEffect(() => {
    if (theme !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      document.documentElement.dataset.theme = mq.matches ? 'dark' : 'light';
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [theme]);

  const [reduceMotion, setReduceMotion] = useLocalToggle(
    'resonance-reduce-motion',
    typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  const [reduceTransparency, setReduceTransparency] = useLocalToggle(
    'resonance-reduce-transparency',
    typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-transparency: reduce)').matches,
  );

  /* ── §2 Discovery (persisted prefs — Discover reads the same key) ── */
  const [locationOn, setLocationOn] = useLocalToggle('resonance-pref-location', true);
  const [discovery, setDiscoveryState] = useState<DiscoveryPrefs>(readDiscoveryPrefs);
  const setDiscovery = useCallback((patch: Partial<DiscoveryPrefs>) => {
    setDiscoveryState((prev) => {
      const next = { ...prev, ...patch };
      try {
        localStorage.setItem(DISCOVERY_PREFS_KEY, JSON.stringify(next));
      } catch {
        /* private mode */
      }
      return next;
    });
  }, []);
  const [womenFirst, setWomenFirst] = useLocalToggle('resonance-pref-women-first', false);

  /* ── §3 Notifications (local prefs) ─────────────────────────────── */
  const [notifMaster, setNotifMaster] = useLocalToggle('resonance-notif-master', true);
  const [notifLikes, setNotifLikes] = useLocalToggle('resonance-notif-likes', true);
  const [notifMatches, setNotifMatches] = useLocalToggle('resonance-notif-matches', true);
  const [notifMessages, setNotifMessages] = useLocalToggle('resonance-notif-messages', true);
  const [notifQueue, setNotifQueue] = useLocalToggle('resonance-notif-queue', true);
  const [notifEvents, setNotifEvents] = useLocalToggle('resonance-notif-events', false);
  const [notifDates, setNotifDates] = useLocalToggle('resonance-notif-dates', true);
  const [quietOpen, setQuietOpen] = useState(false);
  const [quiet, setQuietState] = useState<QuietHours>(readQuietHours);
  const setQuiet = (patch: Partial<QuietHours>) => setQuietState((q) => ({ ...q, ...patch }));
  const saveQuietHours = () => {
    const next = { ...quiet, enabled: true };
    setQuietState(next);
    try {
      localStorage.setItem(QUIET_HOURS_KEY, JSON.stringify(next));
    } catch {
      /* private mode */
    }
    setQuietOpen(false);
    push(t('toasts.quietSet', { from: next.from, to: next.to }));
  };

  /* ── §4 Privacy & safety ────────────────────────────────────────── */
  const [anonSheetOpen, setAnonSheetOpen] = useState(false);
  const [screenshotAlerts, setScreenshotAlerts] = useLocalToggle('resonance-screenshot-alerts', true);
  const [ephemeral, setEphemeral] = useLocalToggle('resonance-ephemeral', false);
  const [deleteStep, setDeleteStep] = useState<0 | 1 | 2>(0);
  const [deleted, setDeleted] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [safetyOpen, setSafetyOpen] = useState(false);
  const [legalSheet, setLegalSheet] = useState<'help' | null>(null);

  const updateSettings = trpc.profile.updateSettings.useMutation({
    onSuccess: () => {
      void utils.profile.me.invalidate();
    },
  });
  const deleteAccount = trpc.safety.deleteAccount.useMutation({
    onSuccess: () => setDeleted(true),
    onError: () => push(t('toasts.deleteError')),
  });
  const resetMatching = trpc.safety.resetMatching.useMutation({
    onSuccess: () => {
      setResetOpen(false);
      push(t('toasts.resetDone'));
    },
    onError: () => push(t('toasts.resetError')),
  });
  const anonymityOn = profile?.anonymityMode === true;
  const paused = profile?.pausedAt != null;

  /* Keep the ephemeral toggle's instant-UI mirror in sync with the server
     value on first load (LS wins once the user has toggled locally). */
  useEffect(() => {
    if (profile?.ephemeralDefault === undefined) return;
    try {
      if (localStorage.getItem('resonance-ephemeral') === null) {
        setEphemeral(profile.ephemeralDefault);
      }
    } catch {
      /* private mode */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.ephemeralDefault]);

  const setEphemeralDefault = (v: boolean) => {
    setEphemeral(v); // instant UI + LS mirror
    updateSettings.mutate({ ephemeralDefault: v });
    push(v ? t('toasts.ephemeralOn') : t('toasts.ephemeralOff'));
  };

  const setPaused = (pause: boolean) => {
    updateSettings.mutate(
      { paused: pause },
      {
        onError: () =>
          push(pause ? t('toasts.pauseError') : t('toasts.resumeError')),
      },
    );
    if (!pause) push(t('toasts.welcomeBack'));
  };

  const downloadMyData = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const data = await utils.safety.exportData.fetch();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'resonance-data.json';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      push('Your data export downloaded as resonance-data.json.');
    } catch {
      push("Couldn't export your data — check your connection and try again.");
    } finally {
      setExporting(false);
    }
  };

  /* Re-check entitlements with the server and report the real result. */
  const restorePurchases = async () => {
    if (restoring) return;
    setRestoring(true);
    try {
      await utils.premium.entitlements.invalidate();
      await utils.profile.me.invalidate();
      const result = await utils.premium.entitlements.fetch();
      const tier = result?.entitlement?.tier ?? 'free';
      push(
        tier !== 'free'
          ? t('toasts.premiumRestored')
          : t('toasts.noPurchase'),
      );
    } catch {
      push(t('toasts.restoreError'));
    } finally {
      setRestoring(false);
    }
  };

  const setAnonymity = (on: boolean) => {
    updateSettings.mutate({ anonymityMode: on });
    push(
      on
        ? t('toasts.anonymityOn')
        : t('toasts.anonymityOff'),
    );
  };

  /* Hidden words — only what the real profile holds (no demo seeds) */
  const hiddenWords = profile?.hiddenWords ?? [];
  const [newWord, setNewWord] = useState('');
  const saveHiddenWords = (words: string[]) => {
    updateSettings.mutate({ hiddenWords: words });
  };

  /* Blocked accounts */
  const blockedQuery = trpc.safety.blocked.useQuery(undefined, {
    enabled: view === 'blocked' || view === 'main',
  });
  const blocked = blockedQuery.data?.blocked ?? [];
  const unblock = trpc.safety.unblock.useMutation({
    onSuccess: () => {
      void utils.safety.blocked.invalidate();
      push(t('toasts.unblocked'));
    },
  });
  const [unblockTarget, setUnblockTarget] = useState<number | null>(null);

  /* ── §5 AI & matching ───────────────────────────────────────────── */
  const [aiStarters, setAiStarters] = useLocalToggle('resonance-ai-starters', true);
  const [weMetFeedback, setWeMetFeedback] = useLocalToggle('resonance-wemet-feedback', true);
  const [resetOpen, setResetOpen] = useState(false);

  const tierLabel =
    entitlement?.tier === 'x' ? 'Resonance X' : entitlement?.tier === 'plus' ? 'Resonance+' : t('tiers.free');

  const toggleShowMe = (opt: string) => {
    setDiscovery({
      showMe: discovery.showMe.includes(opt)
        ? discovery.showMe.filter((o) => o !== opt)
        : [...discovery.showMe, opt],
    });
  };

  /* ================================================================ */
  /* Hidden-words manager — settings.md §4 (sub-screen)                */
  /* ================================================================ */
  const addWord = () => {
    const w = newWord.trim().toLowerCase();
    if (!w || hiddenWords.includes(w)) return;
    saveHiddenWords([...hiddenWords, w]);
    setNewWord('');
    push(t('toasts.hiddenWordAdded'));
  };

  if (view === 'hidden-words') {
    return (
      <div className="relative h-full">
        <RangeStyleTag />
        <ToastHost toasts={toasts} />
        <div className="no-scrollbar h-full overflow-y-auto px-5 pb-10">
          <TopBar title={t('hiddenWords.title')} onBack={() => setView('main')} />
          <p className="t-body mt-4 px-1" style={{ color: 'var(--text-secondary)' }}>
            {t('hiddenWords.intro')}
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <AnimatePresence>
              {hiddenWords.map((w) => (
                <Chip key={w} onRemove={() => saveHiddenWords(hiddenWords.filter((x) => x !== w))}>
                  {w}
                </Chip>
              ))}
            </AnimatePresence>
            {hiddenWords.length === 0 && (
              <p className="t-caption" style={{ color: 'var(--text-secondary)' }}>
                {t('hiddenWords.empty')}
              </p>
            )}
          </div>
          <div className="mt-6 flex gap-2">
            <input
              type="text"
              value={newWord}
              onChange={(e) => setNewWord(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addWord()}
              placeholder={t('hiddenWords.placeholder')}
              aria-label={t('hiddenWords.inputAria')}
              className="t-value h-12 min-w-0 flex-1 rounded-[16px] px-4 outline-none"
              style={{ background: 'var(--field)', color: 'var(--text)' }}
            />
            <BtnPrimary onClick={addWord} className="h-12 shrink-0 px-5" ariaLabel={t('hiddenWords.addAria')}>
              <Plus size={16} aria-hidden="true" /> {t('hiddenWords.add')}
            </BtnPrimary>
          </div>
          <p className="t-caption mt-3 px-1" style={{ color: 'var(--text-secondary)' }}>
            {t('hiddenWords.hint')}
          </p>
        </div>
      </div>
    );
  }

  /* ================================================================ */
  /* Blocked accounts — settings.md §4 (sub-screen)                    */
  /* ================================================================ */
  if (view === 'blocked') {
    return (
      <div className="relative h-full">
        <RangeStyleTag />
        <ToastHost toasts={toasts} />
        <div className="no-scrollbar h-full overflow-y-auto px-5 pb-10">
          <TopBar title={t('blocked.title')} onBack={() => setView('main')} />
          <p className="t-body mt-4 px-1" style={{ color: 'var(--text-secondary)' }}>
            {t('blocked.intro')}
          </p>
          <div className="mt-5 flex flex-col gap-2">
            {blockedQuery.isLoading ? (
              <>
                <div className="glass skeleton-shimmer h-16 rounded-[16px]" />
                <div className="glass skeleton-shimmer h-16 rounded-[16px]" />
              </>
            ) : blocked.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-12 text-center">
                <ShieldCheck size={32} style={{ color: 'var(--ok)' }} aria-hidden="true" />
                <p className="t-title-sm" style={{ color: 'var(--text)' }}>
                  {t('blocked.emptyTitle')}
                </p>
                <p className="t-body" style={{ color: 'var(--text-secondary)' }}>
                  {t('blocked.emptyBody')}
                </p>
              </div>
            ) : (
              blocked.map((b) => (
                <SettingRow
                  key={b.id}
                  title={b.profile?.displayName ?? t('blocked.memberFallback')}
                  caption={
                    b.profile
                      ? `${b.profile.age} · ${b.profile.city ?? t('blocked.nearbyFallback')}`
                      : t('blocked.profileUnavailable')
                  }
                  right={
                    <BtnGhost
                      onClick={() => setUnblockTarget(b.blockedId)}
                      className="shrink-0 text-violet"
                    >
                      {t('blocked.unblock')}
                    </BtnGhost>
                  }
                />
              ))
            )}
          </div>
        </div>

        {/* Unblock confirm sheet */}
        <GlassSheet
          open={unblockTarget !== null}
          onClose={() => setUnblockTarget(null)}
          labelledBy="unblock-title"
        >
          <div className="px-6 pb-8 pt-2">
            <h3 id="unblock-title" className="t-title-sm" style={{ color: 'var(--text)' }}>
              {t('blocked.sheetTitle')}
            </h3>
            <p className="t-body mt-2" style={{ color: 'var(--text-secondary)' }}>
              {t('blocked.sheetBody')}
            </p>
            <div className="mt-6 flex flex-col gap-2">
              <BtnPrimary
                onClick={() => {
                  if (unblockTarget !== null) unblock.mutate({ targetUserId: unblockTarget });
                  setUnblockTarget(null);
                }}
                className="w-full"
              >
                {t('blocked.unblock')}
              </BtnPrimary>
              <BtnGhost onClick={() => setUnblockTarget(null)} className="w-full">
                {t('blocked.keepBlocked')}
              </BtnGhost>
            </div>
          </div>
        </GlassSheet>
      </div>
    );
  }

  /* ================================================================ */
  /* Main settings view — settings.md §1–§6                            */
  /* ================================================================ */
  return (
    <div className="relative h-full">
      <RangeStyleTag />
      <ToastHost toasts={toasts} />

      {/* Local overrides for §1 reduce-motion / reduce-transparency.
          index.css is shared/read-only, so the overrides are scoped here. */}
      <style>{`
        ${reduceTransparency ? `
        .glass, .glass-edge {
          backdrop-filter: none !important;
          -webkit-backdrop-filter: none !important;
          background: var(--glass-solid) !important;
          border: var(--glass-quiet-border) !important;
        }` : ''}
        ${reduceMotion ? `
        *, *::before, *::after {
          animation-duration: 200ms !important;
          animation-iteration-count: 1 !important;
          transition-duration: 200ms !important;
        }
        .glass-edge::after { animation: none !important; opacity: 0.75 !important; }
        .stage-ringfield { animation: none !important; }` : ''}
      `}</style>

      <div className="no-scrollbar h-full overflow-y-auto px-0 pb-12">
        <TopBar title={t('topBar.settings')} onBack={() => navigate('/profile')} />

        {meLoading ? (
          <div className="mt-4 flex flex-col gap-2 px-5" aria-busy="true" aria-label={t('common.loadingSettings')}>
            <div className="glass skeleton-shimmer h-14 rounded-[16px]" />
            <div className="glass skeleton-shimmer h-14 rounded-[16px]" />
            <div className="glass skeleton-shimmer h-14 rounded-[16px]" />
          </div>
        ) : (
          <>
            {/* ── §1 Appearance ─────────────────────────────────────── */}
            <Section eyebrow={t('sections.appearance')}>
              {/* Preview swatch — crossfades with the live theme rebloom */}
              <GlassCard edge="none" className="p-4 transition-colors duration-300">
                <div className="flex items-center gap-3">
                  <span
                    className="flex h-10 w-10 items-center justify-center rounded-[12px]"
                    style={{ background: 'var(--stage-base)', border: 'var(--glass-quiet-border)' }}
                    aria-hidden="true"
                  >
                    <span className="t-title-sm" style={{ color: 'var(--text)' }}>Aa</span>
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="t-value font-bold" style={{ color: 'var(--text)', fontSize: 15 }}>
                      {theme === 'system'
                        ? t('theme.systemName', {
                            name: resolveTheme('system') === 'dark' ? t('theme.nightHud') : t('theme.warmGlass'),
                          })
                        : theme === 'dark'
                          ? t('theme.nightHud')
                          : t('theme.warmGlass')}
                    </p>
                    <p className="t-caption" style={{ color: 'var(--text-secondary)' }}>
                      {t('theme.caption')}
                    </p>
                  </div>
                  <span
                    className="h-6 w-6 rounded-full"
                    style={{
                      background: 'var(--edge-glow-gradient)',
                      boxShadow: 'var(--edge-glow-outer)',
                    }}
                    aria-hidden="true"
                  />
                </div>
              </GlassCard>
              <div className="pt-1">
                <SegmentedControl<ThemeChoice>
                  id="theme"
                  ariaLabel={t('theme.ariaLabel')}
                  value={theme}
                  onChange={applyTheme}
                  options={[
                    { value: 'light', label: t('theme.light'), icon: <Sun size={14} aria-hidden="true" /> },
                    { value: 'dark', label: t('theme.dark'), icon: <Moon size={14} aria-hidden="true" /> },
                    { value: 'system', label: t('theme.systemOption'), icon: <MonitorSmartphone size={14} aria-hidden="true" /> },
                  ]}
                />
              </div>
              <SettingRow
                title={t('rows.reduceMotion.title')}
                caption={t('rows.reduceMotion.caption')}
                right={
                  <Toggle checked={reduceMotion} onChange={setReduceMotion} ariaLabel={t('rows.reduceMotion.title')} />
                }
              />
              <SettingRow
                title={t('rows.reduceTransparency.title')}
                caption={t('rows.reduceTransparency.caption')}
                right={
                  <Toggle
                    checked={reduceTransparency}
                    onChange={setReduceTransparency}
                    ariaLabel={t('rows.reduceTransparency.title')}
                  />
                }
              />
            </Section>

            {/* ── §1b Language — V89 site-wide i18n ─────────────────── */}
            <Section eyebrow={t('sections.language')}>
              <GlassCard edge="none" className="p-4">
                <LanguageSwitcher />
              </GlassCard>
            </Section>

            {/* ── §2 Discovery ──────────────────────────────────────── */}
            <Section eyebrow={t('sections.discovery')}>
              <SettingRow
                icon={<MapPin size={16} aria-hidden="true" />}
                title={t('rows.location.title')}
                caption={locationOn ? t('rows.location.captionOn') : t('rows.location.captionOff')}
                right={
                  <Toggle checked={locationOn} onChange={setLocationOn} ariaLabel={t('rows.location.title')} />
                }
              />
              <SettingRow
                title={t('rows.maxDistance.title')}
                caption={t('rows.maxDistance.caption')}
                right={undefined}
              />
              <div className="rounded-[16px] px-4 pb-4 pt-1" style={{ background: 'var(--field)' }}>
                <RangeSlider
                  min={1}
                  max={100}
                  value={discovery.maxDistance}
                  onChange={(v) => setDiscovery({ maxDistance: v })}
                  ariaLabel={t('rows.maxDistance.aria')}
                  format={(v) => t('rows.maxDistance.format', { value: v })}
                />
              </div>
              <SettingRow title={t('rows.ageRange.title')} caption={t('rows.ageRange.caption')} />
              <div className="rounded-[16px] px-4 pb-4 pt-2" style={{ background: 'var(--field)' }}>
                <DualRangeSlider
                  min={18}
                  max={60}
                  value={[discovery.minAge, discovery.maxAge]}
                  onChange={([minAge, maxAge]) => setDiscovery({ minAge, maxAge })}
                  ariaLabel={t('rows.ageRange.title')}
                />
              </div>
              <SettingRow title={t('rows.showMe.title')} caption={t('rows.showMe.caption')} />
              <div className="flex flex-wrap gap-2 rounded-[16px] px-4 py-3" style={{ background: 'var(--field)' }}>
                {[
                  { value: 'Women', label: t('rows.showMe.women') },
                  { value: 'Men', label: t('rows.showMe.men') },
                  { value: 'Nonbinary', label: t('rows.showMe.nonbinary') },
                ].map((opt) => (
                  <Chip
                    key={opt.value}
                    selected={discovery.showMe.includes(opt.value)}
                    onClick={() => toggleShowMe(opt.value)}
                  >
                    {opt.label}
                  </Chip>
                ))}
              </div>
              <SettingRow
                title={t('rows.globalTravel.title')}
                caption={t('rows.globalTravel.caption')}
                right={!isPremium ? <LockChip label="Resonance+" /> : undefined}
                chevron
                onClick={() => navigate('/premium')}
              />
              <SettingRow
                title={t('rows.womenFirst.title')}
                caption={t('rows.womenFirst.caption')}
                right={
                  <Toggle
                    checked={womenFirst}
                    onChange={(v) => {
                      setWomenFirst(v);
                      push(v ? t('toasts.womenFirstOn') : t('toasts.womenFirstOff'));
                    }}
                    ariaLabel={t('rows.womenFirst.aria')}
                  />
                }
              />
              <SettingRow
                title={t('rows.dealbreakers.title')}
                caption={t('rows.dealbreakers.caption')}
                chevron
                onClick={() => navigate('/discover?filters=1')}
              />
            </Section>

            {/* ── §3 Notifications ──────────────────────────────────── */}
            <Section eyebrow={t('sections.notifications')}>
              <SettingRow
                icon={<Bell size={16} aria-hidden="true" />}
                title={t('rows.notificationsMaster.title')}
                caption={t('rows.notificationsMaster.caption')}
                right={
                  <Toggle checked={notifMaster} onChange={setNotifMaster} ariaLabel={t('rows.notificationsMaster.aria')} />
                }
              />
              {(
                [
                  ['newLikes', notifLikes, setNotifLikes],
                  ['matches', notifMatches, setNotifMatches],
                  ['messages', notifMessages, setNotifMessages],
                  ['queueDrop', notifQueue, setNotifQueue],
                  ['events', notifEvents, setNotifEvents],
                  ['dateReminders', notifDates, setNotifDates],
                ] as [string, boolean, (v: boolean) => void][]
              ).map(([key, val, set]) => (
                <SettingRow
                  key={key}
                  title={t(`notifications.items.${key}.title`)}
                  caption={t(`notifications.items.${key}.caption`)}
                  right={
                    <Toggle
                      checked={val && notifMaster}
                      onChange={set}
                      disabled={!notifMaster}
                      ariaLabel={t('notifications.itemAria', { label: t(`notifications.items.${key}.title`) })}
                    />
                  }
                />
              ))}
              <SettingRow
                title={t('rows.quietHours.title')}
                caption={
                  quiet.enabled
                    ? t('rows.quietHours.captionOn', { from: quiet.from, to: quiet.to })
                    : t('rows.quietHours.captionOff')
                }
                chevron
                onClick={() => setQuietOpen(true)}
              />
            </Section>

            {/* ── §4 Privacy & safety (flagship) ────────────────────── */}
            <Section eyebrow={t('sections.privacySafety')}>
              <SettingRow
                icon={<BadgeCheck size={16} aria-hidden="true" />}
                title={t('rows.photoVerification.title')}
                caption={verified ? t('rows.photoVerification.captionVerified') : t('rows.photoVerification.captionNotVerified')}
                right={
                  verified ? (
                    <span className="t-caption inline-flex items-center gap-1 font-bold" style={{ color: 'var(--ok)' }}>
                      <VerifiedBadge size={14} /> {t('rows.photoVerification.verified')}
                    </span>
                  ) : undefined
                }
              />
              <div className="-mt-1 flex justify-end">
                <BtnGhost onClick={() => navigate('/onboarding')} className="px-2">
                  {t('rows.photoVerification.reverify')}
                </BtnGhost>
              </div>
              <SettingRow
                icon={
                  <EyeOff
                    size={16}
                    aria-hidden="true"
                    style={anonymityOn ? { color: 'var(--violet)' } : undefined}
                  />
                }
                title={
                  <span className="inline-flex items-center gap-1.5">
                    {t('rows.anonymity.title')}
                    {anonymityOn && (
                      <EyeOff size={14} style={{ color: 'var(--violet)' }} aria-label={t('rows.anonymity.ariaActive')} />
                    )}
                  </span>
                }
                caption={t('rows.anonymity.caption')}
                right={
                  <Toggle
                    checked={anonymityOn}
                    onChange={(v) => {
                      if (v) setAnonSheetOpen(true);
                      else setAnonymity(false);
                    }}
                    ariaLabel={t('rows.anonymity.title')}
                  />
                }
              />
              <SettingRow
                icon={<MessageSquareOff size={16} aria-hidden="true" />}
                title={t('rows.hiddenWords.title')}
                caption={
                  hiddenWords.length
                    ? t(hiddenWords.length > 3 ? 'rows.hiddenWords.captionMutedMore' : 'rows.hiddenWords.captionMuted', {
                        count: hiddenWords.length,
                        words: hiddenWords.slice(0, 3).join(', '),
                      })
                    : t('rows.hiddenWords.captionEmpty')
                }
                chevron
                onClick={() => setView('hidden-words')}
              />
              <SettingRow
                icon={<Camera size={16} aria-hidden="true" />}
                title={t('rows.screenshot.title')}
                caption={t('rows.screenshot.caption')}
                right={
                  <Toggle
                    checked={screenshotAlerts}
                    onChange={setScreenshotAlerts}
                    ariaLabel={t('rows.screenshot.title')}
                  />
                }
              />
              <SettingRow
                title={t('rows.ephemeral.title')}
                caption={t('rows.ephemeral.caption')}
                right={
                  <Toggle
                    checked={ephemeral}
                    onChange={setEphemeralDefault}
                    ariaLabel={t('rows.ephemeral.title')}
                  />
                }
              />
              <SettingRow
                title={t('rows.blocked.title')}
                caption={blocked.length ? t('rows.blocked.captionCount', { count: blocked.length }) : t('rows.blocked.captionEmpty')}
                chevron
                onClick={() => setView('blocked')}
              />
              <SettingRow
                icon={<Download size={16} aria-hidden="true" />}
                title={t('rows.download.title')}
                caption={
                  exporting
                    ? t('rows.download.captionBusy')
                    : t('rows.download.caption')
                }
                chevron
                onClick={() => void downloadMyData()}
              />
              <SettingRow
                icon={<Trash2 size={16} aria-hidden="true" />}
                title={t('rows.deleteAccount.title')}
                caption={t('rows.deleteAccount.caption')}
                danger
                chevron
                onClick={() => setDeleteStep(1)}
              />
              <SettingRow title={t('rows.privacyPolicy')} chevron onClick={() => navigate('/privacy')} />
              <SettingRow title={t('rows.cookiePreferences')} chevron onClick={() => navigate('/cookies')} />
            </Section>

            {/* ── §5 AI & matching ──────────────────────────────────── */}
            <Section eyebrow={t('sections.aiMatching')}>
              <SettingRow
                icon={<Sparkles size={16} aria-hidden="true" />}
                title={t('rows.aiStarters.title')}
                caption={t('rows.aiStarters.caption')}
                right={<Toggle checked={aiStarters} onChange={setAiStarters} ariaLabel={t('rows.aiStarters.title')} />}
              />
              <SettingRow
                title={t('rows.aiCoaching.title')}
                caption={t('rows.aiCoaching.caption')}
                right={!isPremium ? <LockChip label="Resonance+" /> : undefined}
                chevron
                onClick={() => navigate('/premium')}
              />
              <SettingRow
                title={t('rows.weMet.title')}
                caption={t('rows.weMet.caption')}
                right={
                  <Toggle checked={weMetFeedback} onChange={setWeMetFeedback} ariaLabel={t('rows.weMet.aria')} />
                }
              />
              <SettingRow
                title={t('rows.resetMatching.title')}
                caption={t('rows.resetMatching.caption')}
                danger
                chevron
                onClick={() => setResetOpen(true)}
              />
            </Section>

            {/* ── §6 Account & support ──────────────────────────────── */}
            <Section eyebrow={t('sections.accountSupport')}>
              <SettingRow
                title={t('rows.membership.title')}
                caption={tierLabel}
                chevron
                onClick={() => navigate('/premium')}
                right={
                  !isPremium ? (
                    <span
                      className="t-caption rounded-full px-2 py-1 font-bold text-white"
                      style={{ background: 'var(--violet)', fontSize: 10 }}
                    >
                      {t('rows.membership.upgrade')}
                    </span>
                  ) : undefined
                }
              />
              <SettingRow
                icon={<Wallet size={16} aria-hidden="true" />}
                title={t('rows.wallet.title')}
                caption={t('rows.wallet.caption')}
                chevron
                onClick={() => navigate('/wallet')}
              />
              <SettingRow
                title={t('rows.restorePurchases.title')}
                caption={restoring ? t('rows.restorePurchases.captionBusy') : undefined}
                chevron
                onClick={() => void restorePurchases()}
              />
              <SettingRow title={t('rows.helpCenter')} chevron onClick={() => setLegalSheet('help')} />
              <SettingRow title={t('rows.communityGuidelines')} chevron onClick={() => navigate('/guidelines')} />
              <SettingRow
                icon={<ShieldCheck size={16} style={{ color: 'var(--ok)' }} aria-hidden="true" />}
                title={t('rows.safetyResources.title')}
                caption={t('rows.safetyResources.caption')}
                chevron
                onClick={() => setSafetyOpen(true)}
              />
              <SettingRow
                icon={<LogOut size={16} aria-hidden="true" />}
                title={t('rows.logout')}
                onClick={() => logout()}
              />
              <p className="t-micro mt-6 text-center" style={{ color: 'var(--text-secondary)' }}>
                {t('footer')}
              </p>
            </Section>
          </>
        )}
      </div>

      {/* ── Anonymity confirm sheet (honest tradeoff, §4) ──────────── */}
      <GlassSheet open={anonSheetOpen} onClose={() => setAnonSheetOpen(false)} labelledBy="anon-title">
        <div className="px-6 pb-8 pt-2">
          <h3 id="anon-title" className="t-title-sm" style={{ color: 'var(--text)' }}>
            {t('sheets.anonymity.title')}
          </h3>
          <div className="t-body mt-3 flex flex-col gap-2" style={{ color: 'var(--text-secondary)' }}>
            <p>{t('sheets.anonymity.p1')}</p>
            <p>{t('sheets.anonymity.p2')}</p>
            <p>{t('sheets.anonymity.p3')}</p>
          </div>
          <div className="mt-6 flex flex-col gap-2">
            <BtnPrimary
              onClick={() => {
                setAnonymity(true);
                setAnonSheetOpen(false);
              }}
              className="w-full"
            >
              {t('sheets.anonymity.confirm')}
            </BtnPrimary>
            <BtnGhost onClick={() => setAnonSheetOpen(false)} className="w-full">
              {t('sheets.anonymity.cancel')}
            </BtnGhost>
          </div>
        </div>
      </GlassSheet>

      {/* ── Quiet hours sheet ───────────────────────────────────────── */}
      <GlassSheet open={quietOpen} onClose={() => setQuietOpen(false)} labelledBy="quiet-title">
        <div className="px-6 pb-8 pt-2">
          <h3 id="quiet-title" className="t-title-sm" style={{ color: 'var(--text)' }}>
            {t('sheets.quiet.title')}
          </h3>
          <p className="t-body mt-2" style={{ color: 'var(--text-secondary)' }}>
            {t('sheets.quiet.body')}
          </p>
          {quiet.enabled && (
            <div className="mt-4 flex items-center justify-between rounded-[16px] px-4 py-3" style={{ background: 'var(--field)' }}>
              <span className="t-body" style={{ color: 'var(--text)' }}>
                {t('sheets.quiet.on')}
              </span>
              <Toggle
                checked={quiet.enabled}
                onChange={(v) => {
                  const next = { ...quiet, enabled: v };
                  setQuietState(next);
                  try {
                    localStorage.setItem(QUIET_HOURS_KEY, JSON.stringify(next));
                  } catch {
                    /* private mode */
                  }
                }}
                ariaLabel={t('sheets.quiet.toggleAria')}
              />
            </div>
          )}
          <div className="mt-5 grid grid-cols-2 gap-3">
            <label className="t-caption" style={{ color: 'var(--text-secondary)' }}>
              {t('sheets.quiet.from')}
              <input
                type="time"
                value={quiet.from}
                onChange={(e) => setQuiet({ from: e.target.value })}
                className="t-value mt-1 h-12 w-full rounded-[16px] px-4 outline-none"
                style={{ background: 'var(--field)', color: 'var(--text)' }}
              />
            </label>
            <label className="t-caption" style={{ color: 'var(--text-secondary)' }}>
              {t('sheets.quiet.to')}
              <input
                type="time"
                value={quiet.to}
                onChange={(e) => setQuiet({ to: e.target.value })}
                className="t-value mt-1 h-12 w-full rounded-[16px] px-4 outline-none"
                style={{ background: 'var(--field)', color: 'var(--text)' }}
              />
            </label>
          </div>
          <BtnPrimary onClick={saveQuietHours} className="mt-6 w-full">
            {t('sheets.quiet.save')}
          </BtnPrimary>
        </div>
      </GlassSheet>

      {/* ── Reset matching history confirm ──────────────────────────── */}
      <GlassSheet open={resetOpen} onClose={() => setResetOpen(false)} labelledBy="reset-title">
        <div className="px-6 pb-8 pt-2">
          <h3 id="reset-title" className="t-title-sm" style={{ color: 'var(--text)' }}>
            {t('sheets.reset.title')}
          </h3>
          <p className="t-body mt-2" style={{ color: 'var(--text-secondary)' }}>
            {t('sheets.reset.body')}
          </p>
          <div className="mt-6 flex flex-col gap-2">
            <HoldToConfirm
              label={t('sheets.reset.hold')}
              holdingLabel={t('sheets.reset.holding')}
              onConfirm={() => resetMatching.mutate()}
            />
            <BtnGhost onClick={() => setResetOpen(false)} className="w-full">
              {t('sheets.reset.keep')}
            </BtnGhost>
          </div>
        </div>
      </GlassSheet>

      {/* ── Delete account — 2-step, calm offboarding + hold ───────── */}
      <GlassSheet
        open={deleteStep !== 0}
        onClose={() => setDeleteStep(0)}
        labelledBy="delete-title"
      >
        <div className="px-6 pb-8 pt-2">
          {deleteStep === 1 ? (
            paused ? (
              <>
                <h3 id="delete-title" className="t-title-sm" style={{ color: 'var(--text)' }}>
                  {t('sheets.delete.pausedTitle')}
                </h3>
                <div className="t-body mt-3 flex flex-col gap-2" style={{ color: 'var(--text-secondary)' }}>
                  <p>{t('sheets.delete.pausedP1')}</p>
                  <p>{t('sheets.delete.pausedP2')}</p>
                </div>
                <div className="mt-6 flex flex-col gap-2">
                  <BtnPrimary
                    onClick={() => {
                      setPaused(false);
                      setDeleteStep(0);
                    }}
                    className="w-full"
                  >
                    {t('sheets.delete.resume')}
                  </BtnPrimary>
                  <BtnGhost onClick={() => setDeleteStep(2)} className="w-full" ariaLabel={t('sheets.delete.continueAria')}>
                    <span style={{ color: 'var(--danger)' }}>{t('sheets.delete.continueDelete')}</span>
                  </BtnGhost>
                </div>
              </>
            ) : (
              <>
                <h3 id="delete-title" className="t-title-sm" style={{ color: 'var(--text)' }}>
                  {t('sheets.delete.beforeTitle')}
                </h3>
                <div className="t-body mt-3 flex flex-col gap-2" style={{ color: 'var(--text-secondary)' }}>
                  <p>{t('sheets.delete.beforeP1')}</p>
                  <p>{t('sheets.delete.beforeP2')}</p>
                </div>
                <div className="mt-6 flex flex-col gap-2">
                  <BtnGlass
                    onClick={() => setPaused(true)}
                    className="w-full"
                  >
                    <PauseCircle size={16} aria-hidden="true" /> {t('sheets.delete.pauseInstead')}
                  </BtnGlass>
                  <BtnGhost onClick={() => setDeleteStep(2)} className="w-full" ariaLabel={t('sheets.delete.continueAria')}>
                    <span style={{ color: 'var(--danger)' }}>{t('sheets.delete.continueDelete')}</span>
                  </BtnGhost>
                </div>
              </>
            )
          ) : (
            <>
              <h3 id="delete-title" className="t-title-sm" style={{ color: 'var(--text)' }}>
                {deleted ? t('sheets.delete.deletedTitle') : t('sheets.delete.title')}
              </h3>
              {deleted ? (
                <>
                  <p className="t-body mt-3" style={{ color: 'var(--text-secondary)' }}>
                    {t('sheets.delete.deletedBody')}
                  </p>
                  <BtnPrimary onClick={() => logout()} className="mt-6 w-full">
                    {t('sheets.delete.backToSignIn')}
                  </BtnPrimary>
                </>
              ) : (
                <>
                  <p className="t-body mt-3" style={{ color: 'var(--text-secondary)' }}>
                    {t('sheets.delete.lastStep')}
                  </p>
                  <div className="mt-6 flex flex-col gap-2">
                    <HoldToConfirm
                      label={t('sheets.delete.hold')}
                      holdingLabel={t('sheets.delete.holding')}
                      onConfirm={() => deleteAccount.mutate()}
                    />
                    <BtnGhost onClick={() => setDeleteStep(0)} className="w-full">
                      {t('common.cancel')}
                    </BtnGhost>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </GlassSheet>

      {/* ── Safety resources — real external hotlines ─────────────── */}
      <GlassSheet open={safetyOpen} onClose={() => setSafetyOpen(false)} labelledBy="safety-title">
        <div className="px-6 pb-8 pt-2">
          <h3 id="safety-title" className="t-title-sm" style={{ color: 'var(--text)' }}>
            {t('sheets.safety.title')}
          </h3>
          <p className="t-body mt-2" style={{ color: 'var(--text-secondary)' }}>
            {t('sheets.safety.body')}
          </p>
          <div className="mt-5 flex flex-col gap-2">
            {[
              {
                href: 'https://rainn.org',
                title: 'RAINN',
                caption: t('sheets.safety.rainnCaption'),
              },
              {
                href: 'https://www.crisistextline.org',
                title: 'Crisis Text Line',
                caption: t('sheets.safety.crisisCaption'),
              },
            ].map((r) => (
              <a
                key={r.href}
                href={r.href}
                target="_blank"
                rel="noreferrer"
                className="flex min-h-[56px] items-center gap-3 rounded-2xl px-4 transition-opacity duration-fast active:opacity-70"
                style={{ background: 'var(--field)' }}
              >
                <span className="min-w-0 flex-1">
                  <span className="t-button block" style={{ color: 'var(--text)' }}>
                    {r.title}
                  </span>
                  <span className="t-caption block" style={{ color: 'var(--text-secondary)' }}>
                    {r.caption}
                  </span>
                </span>
                <ExternalLink size={16} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} aria-hidden="true" />
              </a>
            ))}
          </div>
          <p className="t-caption mt-4" style={{ color: 'var(--text-secondary)' }}>
            {t('sheets.safety.emergency')}
          </p>
        </div>
      </GlassSheet>

      {/* ── Help center — quick answers + direct support ─────────── */}
      <GlassSheet open={legalSheet !== null} onClose={() => setLegalSheet(null)} labelledBy="legal-title">
        <div className="px-6 pb-8 pt-2">
          <h3 id="legal-title" className="t-title-sm" style={{ color: 'var(--text)' }}>
            {t('sheets.help.title')}
          </h3>
          <p className="t-body mt-2" style={{ color: 'var(--text-secondary)' }}>
            {t('sheets.help.body')}
          </p>
          <a
            href="mailto:support@resonanse.app"
            className="mt-4 flex min-h-[56px] items-center gap-3 rounded-2xl px-4 transition-opacity duration-fast active:opacity-70"
            style={{ background: 'var(--field)' }}
          >
            <span className="min-w-0 flex-1">
              <span className="t-button block" style={{ color: 'var(--text)' }}>
                {t('sheets.help.emailSupport')}
              </span>
              <span className="t-caption block" style={{ color: 'var(--text-secondary)' }}>
                {t('sheets.help.emailCaption')}
              </span>
            </span>
            <ExternalLink size={16} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} aria-hidden="true" />
          </a>
          <BtnPrimary onClick={() => setLegalSheet(null)} className="mt-6 w-full">
            {t('sheets.help.gotIt')}
          </BtnPrimary>
        </div>
      </GlassSheet>
    </div>
  );
}
