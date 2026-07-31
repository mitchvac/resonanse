import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
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
} from 'lucide-react';
import GlassCard from '@/components/GlassCard';
import GlassSheet from '@/components/GlassSheet';
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
  return (
    <div className="sticky top-0 z-40 -mx-5 px-5 pb-2 pt-4">
      <div className="glass flex h-14 items-center gap-2 px-2" style={{ borderRadius: 24 }}>
        <button
          type="button"
          onClick={onBack}
          aria-label="Back"
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

  /* ── §2 Discovery (local prefs) ─────────────────────────────────── */
  const [locationOn, setLocationOn] = useLocalToggle('resonance-pref-location', true);
  const [maxDistance, setMaxDistance] = useState(25);
  const [ageRange, setAgeRange] = useState<[number, number]>([24, 34]);
  const [showMe, setShowMe] = useState<string[]>(['Women', 'Nonbinary']);
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
  const [quietFrom, setQuietFrom] = useState('22:00');
  const [quietTo, setQuietTo] = useState('08:00');

  /* ── §4 Privacy & safety ────────────────────────────────────────── */
  const [anonSheetOpen, setAnonSheetOpen] = useState(false);
  const [screenshotAlerts, setScreenshotAlerts] = useLocalToggle('resonance-screenshot-alerts', true);
  const [ephemeral, setEphemeral] = useLocalToggle('resonance-ephemeral', false);
  const [deleteStep, setDeleteStep] = useState<0 | 1 | 2>(0);
  const [deleted, setDeleted] = useState(false);

  const updateSettings = trpc.profile.updateSettings.useMutation({
    onSuccess: () => {
      void utils.profile.me.invalidate();
    },
  });
  const anonymityOn = profile?.anonymityMode === true;

  const setAnonymity = (on: boolean) => {
    updateSettings.mutate({ anonymityMode: on });
    push(
      on
        ? 'Anonymity on — only people you like can see you.'
        : 'Anonymity off — you’re visible in queues again.',
    );
  };

  /* Hidden words (demo seeds when the profile has none yet) */
  const hiddenWords = profile?.hiddenWords?.length ? profile.hiddenWords : ['hey', 'u up'];
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
      push('Unblocked. They can appear in your queue again.');
    },
  });
  const [unblockTarget, setUnblockTarget] = useState<number | null>(null);

  /* ── §5 AI & matching ───────────────────────────────────────────── */
  const [aiStarters, setAiStarters] = useLocalToggle('resonance-ai-starters', true);
  const [weMetFeedback, setWeMetFeedback] = useLocalToggle('resonance-wemet-feedback', true);
  const [resetOpen, setResetOpen] = useState(false);

  const tierLabel =
    entitlement?.tier === 'x' ? 'Resonance X' : entitlement?.tier === 'plus' ? 'Resonance+' : 'Free';

  const toggleShowMe = (opt: string) => {
    setShowMe((prev) =>
      prev.includes(opt) ? prev.filter((o) => o !== opt) : [...prev, opt],
    );
  };

  /* ================================================================ */
  /* Hidden-words manager — settings.md §4 (sub-screen)                */
  /* ================================================================ */
  const addWord = () => {
    const w = newWord.trim().toLowerCase();
    if (!w || hiddenWords.includes(w)) return;
    saveHiddenWords([...hiddenWords, w]);
    setNewWord('');
    push(`“${w}” hidden — matching messages go to your hidden folder.`);
  };

  if (view === 'hidden-words') {
    return (
      <div className="relative h-full">
        <RangeStyleTag />
        <ToastHost toasts={toasts} />
        <div className="no-scrollbar h-full overflow-y-auto px-5 pb-10">
          <TopBar title="Hidden words" onBack={() => setView('main')} />
          <p className="t-body mt-4 px-1" style={{ color: 'var(--text-secondary)' }}>
            Messages containing these are filtered to a hidden folder you can review.
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
                No hidden words yet.
              </p>
            )}
          </div>
          <div className="mt-6 flex gap-2">
            <input
              type="text"
              value={newWord}
              onChange={(e) => setNewWord(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addWord()}
              placeholder="Add a word or phrase"
              aria-label="Add a hidden word or phrase"
              className="t-value h-12 min-w-0 flex-1 rounded-[16px] px-4 outline-none"
              style={{ background: 'var(--field)', color: 'var(--text)' }}
            />
            <BtnPrimary onClick={addWord} className="h-12 shrink-0 px-5" ariaLabel="Add hidden word">
              <Plus size={16} aria-hidden="true" /> Add
            </BtnPrimary>
          </div>
          <p className="t-caption mt-3 px-1" style={{ color: 'var(--text-secondary)' }}>
            Tap the × on a chip to remove it. Filtering is silent — senders aren’t told.
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
          <TopBar title="Blocked accounts" onBack={() => setView('main')} />
          <p className="t-body mt-4 px-1" style={{ color: 'var(--text-secondary)' }}>
            Blocked people can’t see you, like you, or message you.
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
                  No blocked accounts
                </p>
                <p className="t-body" style={{ color: 'var(--text-secondary)' }}>
                  If you block someone, they’ll show up here.
                </p>
              </div>
            ) : (
              blocked.map((b) => (
                <SettingRow
                  key={b.id}
                  title={b.profile?.displayName ?? 'Member'}
                  caption={
                    b.profile
                      ? `${b.profile.age} · ${b.profile.city ?? 'Nearby'}`
                      : 'Profile unavailable'
                  }
                  right={
                    <BtnGhost
                      onClick={() => setUnblockTarget(b.blockedId)}
                      className="shrink-0 text-violet"
                    >
                      Unblock
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
              Unblock this person?
            </h3>
            <p className="t-body mt-2" style={{ color: 'var(--text-secondary)' }}>
              They’ll be able to see your profile and message you again. You can re-block any time.
            </p>
            <div className="mt-6 flex flex-col gap-2">
              <BtnPrimary
                onClick={() => {
                  if (unblockTarget !== null) unblock.mutate({ targetUserId: unblockTarget });
                  setUnblockTarget(null);
                }}
                className="w-full"
              >
                Unblock
              </BtnPrimary>
              <BtnGhost onClick={() => setUnblockTarget(null)} className="w-full">
                Keep blocked
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
        <TopBar title="Settings" onBack={() => navigate('/profile')} />

        {meLoading ? (
          <div className="mt-4 flex flex-col gap-2 px-5" aria-busy="true" aria-label="Loading settings">
            <div className="glass skeleton-shimmer h-14 rounded-[16px]" />
            <div className="glass skeleton-shimmer h-14 rounded-[16px]" />
            <div className="glass skeleton-shimmer h-14 rounded-[16px]" />
          </div>
        ) : (
          <>
            {/* ── §1 Appearance ─────────────────────────────────────── */}
            <Section eyebrow="Appearance">
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
                        ? `System (${resolveTheme('system') === 'dark' ? 'Night HUD' : 'Warm Glass'})`
                        : theme === 'dark'
                          ? 'Night HUD'
                          : 'Warm Glass'}
                    </p>
                    <p className="t-caption" style={{ color: 'var(--text-secondary)' }}>
                      The stage reblooms the moment you switch.
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
                  ariaLabel="Theme"
                  value={theme}
                  onChange={applyTheme}
                  options={[
                    { value: 'light', label: 'Light', icon: <Sun size={14} aria-hidden="true" /> },
                    { value: 'dark', label: 'Dark', icon: <Moon size={14} aria-hidden="true" /> },
                    { value: 'system', label: 'System', icon: <MonitorSmartphone size={14} aria-hidden="true" /> },
                  ]}
                />
              </div>
              <SettingRow
                title="Reduce motion"
                caption="Mirrors your OS setting; overrides it here when on."
                right={
                  <Toggle checked={reduceMotion} onChange={setReduceMotion} ariaLabel="Reduce motion" />
                }
              />
              <SettingRow
                title="Reduce transparency"
                caption="Glass surfaces become solid. Mirrors your OS setting when off."
                right={
                  <Toggle
                    checked={reduceTransparency}
                    onChange={setReduceTransparency}
                    ariaLabel="Reduce transparency"
                  />
                }
              />
            </Section>

            {/* ── §2 Discovery ──────────────────────────────────────── */}
            <Section eyebrow="Discovery">
              <SettingRow
                icon={<MapPin size={16} aria-hidden="true" />}
                title="Location services"
                caption={locationOn ? 'Never shown exactly.' : 'Off in system settings — enable to see people nearby.'}
                right={
                  <Toggle checked={locationOn} onChange={setLocationOn} ariaLabel="Location services" />
                }
              />
              <SettingRow
                title="Max distance"
                caption="How far your queue reaches."
                right={undefined}
              />
              <div className="rounded-[16px] px-4 pb-4 pt-1" style={{ background: 'var(--field)' }}>
                <RangeSlider
                  min={1}
                  max={100}
                  value={maxDistance}
                  onChange={setMaxDistance}
                  ariaLabel="Maximum distance in kilometers"
                  format={(v) => `${v} km`}
                />
              </div>
              <SettingRow title="Age range" caption="Who appears in your queue." />
              <div className="rounded-[16px] px-4 pb-4 pt-2" style={{ background: 'var(--field)' }}>
                <DualRangeSlider
                  min={18}
                  max={60}
                  value={ageRange}
                  onChange={setAgeRange}
                  ariaLabel="Age range"
                />
              </div>
              <SettingRow title="Show me" caption="Pick everyone you want to meet." />
              <div className="flex flex-wrap gap-2 rounded-[16px] px-4 py-3" style={{ background: 'var(--field)' }}>
                {['Women', 'Men', 'Nonbinary'].map((opt) => (
                  <Chip
                    key={opt}
                    selected={showMe.includes(opt)}
                    onClick={() => toggleShowMe(opt)}
                  >
                    {opt}
                  </Chip>
                ))}
              </div>
              <SettingRow
                title="Global / Travel"
                caption="Meet people in other cities."
                right={!isPremium ? <LockChip label="Resonance+" /> : undefined}
                chevron
                onClick={() => navigate('/premium')}
              />
              <SettingRow
                title="Women/non-men message first"
                caption="When on, matches wait for your first move."
                right={
                  <Toggle
                    checked={womenFirst}
                    onChange={(v) => {
                      setWomenFirst(v);
                      push(v ? 'Matches will wait for your first message.' : 'Either person can message first.');
                    }}
                    ariaLabel="Women and non-men message first"
                  />
                }
              />
              <SettingRow
                title="Dealbreakers"
                caption="Hard filters for your queue."
                chevron
                onClick={() => navigate('/discover')}
              />
            </Section>

            {/* ── §3 Notifications ──────────────────────────────────── */}
            <Section eyebrow="Notifications">
              <SettingRow
                icon={<Bell size={16} aria-hidden="true" />}
                title="Notifications"
                caption="Master switch for everything below."
                right={
                  <Toggle checked={notifMaster} onChange={setNotifMaster} ariaLabel="All notifications" />
                }
              />
              {(
                [
                  ['New likes', 'When someone likes you.', notifLikes, setNotifLikes],
                  ['Matches', 'When a like becomes mutual.', notifMatches, setNotifMatches],
                  ['Messages', 'New chat messages.', notifMessages, setNotifMessages],
                  ['Queue drop', 'Daily at noon, when your new queue lands.', notifQueue, setNotifQueue],
                  ['Events', 'RSVP updates and new events near you.', notifEvents, setNotifEvents],
                  ['Date reminders', 'Nudges before a planned date.', notifDates, setNotifDates],
                ] as [string, string, boolean, (v: boolean) => void][]
              ).map(([label, caption, val, set]) => (
                <SettingRow
                  key={label}
                  title={label}
                  caption={caption}
                  right={
                    <Toggle
                      checked={val && notifMaster}
                      onChange={set}
                      disabled={!notifMaster}
                      ariaLabel={`${label} notifications`}
                    />
                  }
                />
              ))}
              <SettingRow
                title="Quiet hours"
                caption={`${quietFrom} – ${quietTo} · only date reminders come through.`}
                chevron
                onClick={() => setQuietOpen(true)}
              />
            </Section>

            {/* ── §4 Privacy & safety (flagship) ────────────────────── */}
            <Section eyebrow="Privacy & safety">
              <SettingRow
                icon={<BadgeCheck size={16} aria-hidden="true" />}
                title="Photo verification"
                caption={verified ? 'Verified — your badge is visible.' : 'Not verified yet.'}
                right={
                  verified ? (
                    <span className="t-caption inline-flex items-center gap-1 font-bold" style={{ color: 'var(--ok)' }}>
                      <VerifiedBadge size={14} /> Verified
                    </span>
                  ) : undefined
                }
              />
              <div className="-mt-1 flex justify-end">
                <BtnGhost onClick={() => navigate('/onboarding')} className="px-2">
                  Re-verify
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
                    Anonymity mode
                    {anonymityOn && (
                      <EyeOff size={14} style={{ color: 'var(--violet)' }} aria-label="Anonymity active" />
                    )}
                  </span>
                }
                caption="Hidden from everyone except people you like. Likes may slow down."
                right={
                  <Toggle
                    checked={anonymityOn}
                    onChange={(v) => {
                      if (v) setAnonSheetOpen(true);
                      else setAnonymity(false);
                    }}
                    ariaLabel="Anonymity mode"
                  />
                }
              />
              <SettingRow
                icon={<MessageSquareOff size={16} aria-hidden="true" />}
                title="Hidden words"
                caption={
                  hiddenWords.length
                    ? `${hiddenWords.length} muted: ${hiddenWords.slice(0, 3).join(', ')}${hiddenWords.length > 3 ? '…' : ''}`
                    : 'Messages containing these are filtered to a hidden folder.'
                }
                chevron
                onClick={() => setView('hidden-words')}
              />
              <SettingRow
                icon={<Camera size={16} aria-hidden="true" />}
                title="Screenshot alerts"
                caption="You're notified when someone screenshots your photos or chat."
                right={
                  <Toggle
                    checked={screenshotAlerts}
                    onChange={setScreenshotAlerts}
                    ariaLabel="Screenshot alerts"
                  />
                }
              />
              <SettingRow
                title="Ephemeral default"
                caption="Start new chats in 24h vanish mode."
                right={
                  <Toggle
                    checked={ephemeral}
                    onChange={(v) => {
                      setEphemeral(v);
                      push(v ? 'New chats will vanish after 24 hours.' : 'New chats are permanent again.');
                    }}
                    ariaLabel="Ephemeral default"
                  />
                }
              />
              <SettingRow
                title="Blocked accounts"
                caption={blocked.length ? `${blocked.length} blocked` : 'Manage people you’ve blocked.'}
                chevron
                onClick={() => setView('blocked')}
              />
              <SettingRow
                icon={<Download size={16} aria-hidden="true" />}
                title="Download my data"
                caption="GDPR/CCPA export, emailed as an archive."
                chevron
                onClick={() => push('Export requested — we’ll email your archive.')}
              />
              <SettingRow
                icon={<Trash2 size={16} aria-hidden="true" />}
                title="Delete account"
                caption="Your profile, matches, and messages are removed."
                danger
                chevron
                onClick={() => setDeleteStep(1)}
              />
              <SettingRow title="Privacy policy" chevron onClick={() => push('Opening privacy policy.')} />
              <SettingRow title="Cookie preferences" chevron onClick={() => push('Opening cookie preferences.')} />
            </Section>

            {/* ── §5 AI & matching ──────────────────────────────────── */}
            <Section eyebrow="AI & matching">
              <SettingRow
                icon={<Sparkles size={16} aria-hidden="true" />}
                title="AI starters"
                caption="Suggested first lines on new matches."
                right={<Toggle checked={aiStarters} onChange={setAiStarters} ariaLabel="AI starters" />}
              />
              <SettingRow
                title="AI coaching"
                caption="Profile and message feedback, tuned to your goals."
                right={!isPremium ? <LockChip label="Resonance+" /> : undefined}
                chevron
                onClick={() => navigate('/premium')}
              />
              <SettingRow
                title="Use my We Met feedback"
                caption="Your post-date check-ins teach the matching loop what works for you."
                right={
                  <Toggle checked={weMetFeedback} onChange={setWeMetFeedback} ariaLabel="Use We Met feedback" />
                }
              />
              <SettingRow
                title="Reset matching history"
                caption="Clears learned preferences. Your profile stays."
                danger
                chevron
                onClick={() => setResetOpen(true)}
              />
            </Section>

            {/* ── §6 Account & support ──────────────────────────────── */}
            <Section eyebrow="Account & support">
              <SettingRow
                title="Membership"
                caption={tierLabel}
                chevron
                onClick={() => navigate('/premium')}
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
              />
              <SettingRow title="Restore purchases" chevron onClick={() => push('Checking for purchases…')} />
              <SettingRow title="Help center" chevron onClick={() => push('Opening help center.')} />
              <SettingRow title="Community guidelines" chevron onClick={() => push('Opening community guidelines.')} />
              <SettingRow
                icon={<ShieldCheck size={16} style={{ color: 'var(--ok)' }} aria-hidden="true" />}
                title="Safety resources"
                caption="Hotlines and expert help, whenever you need them."
                chevron
                onClick={() => push('Opening safety resources.')}
              />
              <SettingRow
                icon={<LogOut size={16} aria-hidden="true" />}
                title="Log out"
                onClick={() => logout()}
              />
              <p className="t-micro mt-6 text-center" style={{ color: 'var(--text-secondary)' }}>
                RESONANCE 1.0.0 · MADE FOR MEETING IN REAL LIFE.
              </p>
            </Section>
          </>
        )}
      </div>

      {/* ── Anonymity confirm sheet (honest tradeoff, §4) ──────────── */}
      <GlassSheet open={anonSheetOpen} onClose={() => setAnonSheetOpen(false)} labelledBy="anon-title">
        <div className="px-6 pb-8 pt-2">
          <h3 id="anon-title" className="t-title-sm" style={{ color: 'var(--text)' }}>
            Turn on anonymity mode?
          </h3>
          <div className="t-body mt-3 flex flex-col gap-2" style={{ color: 'var(--text-secondary)' }}>
            <p>You’ll be hidden from everyone except people you like.</p>
            <p>The honest tradeoff: fewer people see you, so likes may slow down.</p>
            <p>You can switch back any time — nothing else changes.</p>
          </div>
          <div className="mt-6 flex flex-col gap-2">
            <BtnPrimary
              onClick={() => {
                setAnonymity(true);
                setAnonSheetOpen(false);
              }}
              className="w-full"
            >
              Turn on anonymity
            </BtnPrimary>
            <BtnGhost onClick={() => setAnonSheetOpen(false)} className="w-full">
              Not now
            </BtnGhost>
          </div>
        </div>
      </GlassSheet>

      {/* ── Quiet hours sheet ───────────────────────────────────────── */}
      <GlassSheet open={quietOpen} onClose={() => setQuietOpen(false)} labelledBy="quiet-title">
        <div className="px-6 pb-8 pt-2">
          <h3 id="quiet-title" className="t-title-sm" style={{ color: 'var(--text)' }}>
            Quiet hours
          </h3>
          <p className="t-body mt-2" style={{ color: 'var(--text-secondary)' }}>
            Only date reminders come through during quiet hours.
          </p>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <label className="t-caption" style={{ color: 'var(--text-secondary)' }}>
              From
              <input
                type="time"
                value={quietFrom}
                onChange={(e) => setQuietFrom(e.target.value)}
                className="t-value mt-1 h-12 w-full rounded-[16px] px-4 outline-none"
                style={{ background: 'var(--field)', color: 'var(--text)' }}
              />
            </label>
            <label className="t-caption" style={{ color: 'var(--text-secondary)' }}>
              To
              <input
                type="time"
                value={quietTo}
                onChange={(e) => setQuietTo(e.target.value)}
                className="t-value mt-1 h-12 w-full rounded-[16px] px-4 outline-none"
                style={{ background: 'var(--field)', color: 'var(--text)' }}
              />
            </label>
          </div>
          <BtnPrimary onClick={() => setQuietOpen(false)} className="mt-6 w-full">
            Save quiet hours
          </BtnPrimary>
        </div>
      </GlassSheet>

      {/* ── Reset matching history confirm ──────────────────────────── */}
      <GlassSheet open={resetOpen} onClose={() => setResetOpen(false)} labelledBy="reset-title">
        <div className="px-6 pb-8 pt-2">
          <h3 id="reset-title" className="t-title-sm" style={{ color: 'var(--text)' }}>
            Reset matching history?
          </h3>
          <p className="t-body mt-2" style={{ color: 'var(--text-secondary)' }}>
            This clears what Resonance learned from your likes, passes, and We Met check-ins. Your profile, matches, and messages stay.
          </p>
          <div className="mt-6 flex flex-col gap-2">
            <HoldToConfirm
              label="Hold to reset"
              holdingLabel="Release when filled…"
              onConfirm={() => {
                setResetOpen(false);
                push('Matching history reset. Your queue will relearn from scratch.');
              }}
            />
            <BtnGhost onClick={() => setResetOpen(false)} className="w-full">
              Keep my history
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
            <>
              <h3 id="delete-title" className="t-title-sm" style={{ color: 'var(--text)' }}>
                Before you go
              </h3>
              <div className="t-body mt-3 flex flex-col gap-2" style={{ color: 'var(--text-secondary)' }}>
                <p>Deleting removes your profile, matches, messages, and Pulses. This can’t be undone.</p>
                <p>If you just need a break, pausing hides you without losing anything.</p>
              </div>
              <div className="mt-6 flex flex-col gap-2">
                <BtnGlass
                  onClick={() => {
                    setDeleteStep(0);
                    push('Account paused. Take all the time you need.');
                  }}
                  className="w-full"
                >
                  Pause instead
                </BtnGlass>
                <BtnGhost onClick={() => setDeleteStep(2)} className="w-full" ariaLabel="Continue to delete account">
                  <span style={{ color: 'var(--danger)' }}>Continue to delete</span>
                </BtnGhost>
              </div>
            </>
          ) : (
            <>
              <h3 id="delete-title" className="t-title-sm" style={{ color: 'var(--text)' }}>
                {deleted ? 'Account deleted' : 'Delete your account?'}
              </h3>
              {deleted ? (
                <>
                  <p className="t-body mt-3" style={{ color: 'var(--text-secondary)' }}>
                    Everything is gone. Thanks for the time you spent here — we hope you met someone worth meeting.
                  </p>
                  <BtnPrimary onClick={() => logout()} className="mt-6 w-full">
                    Back to sign in
                  </BtnPrimary>
                </>
              ) : (
                <>
                  <p className="t-body mt-3" style={{ color: 'var(--text-secondary)' }}>
                    Last step. Press and hold below to permanently delete your account.
                  </p>
                  <div className="mt-6 flex flex-col gap-2">
                    <HoldToConfirm
                      label="Hold to delete account"
                      holdingLabel="Deleting…"
                      onConfirm={() => setDeleted(true)}
                    />
                    <BtnGhost onClick={() => setDeleteStep(0)} className="w-full">
                      Cancel
                    </BtnGhost>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </GlassSheet>
    </div>
  );
}
