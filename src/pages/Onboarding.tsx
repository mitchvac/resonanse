import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { motion, AnimatePresence } from 'framer-motion';
import FlowChrome from '@/components/flow/FlowChrome';
import { BtnGhost } from '@/components/ui/buttons';
import WelcomeStep from '@/components/onboarding/WelcomeStep';
import AboutYouStep from '@/components/onboarding/AboutYouStep';
import IntentStep from '@/components/onboarding/IntentStep';
import VerifyStep from '@/components/onboarding/VerifyStep';
import PermissionsStep from '@/components/onboarding/PermissionsStep';
import DoneStep from '@/components/onboarding/DoneStep';
import {
  ageFromBirthday,
  emptyOnboardingDraft,
  loadOnboardingDraft,
  saveOnboardingDraft,
  type OnboardingDraft,
} from '@/components/onboarding/draft';
import { useAuth } from '@/hooks/useAuth';
import { trpc } from '@/providers/trpc';
import { LOGIN_PATH } from '@/const';
import { cn } from '@/lib/utils';

/**
 * Onboarding — /onboarding (onboarding.md)
 * 5-step flow inside the phone shell, no TabBar. Top chrome: back chevron,
 * 5-segment progress, "Save & exit" ghost. Sticky bottom BtnPrimary per step
 * (disabled = violet at 0.35, no glow). Step transitions: slide-in from the
 * right 320ms var(--ease-out) + fade; back reverses.
 *
 * Flow: 0 Welcome → 1 About you → 2 Intent → 3 Photo verification
 * (mandatory gate) → 4 Permissions → 5 Done → /profile-setup.
 * Auth is owned by the backend graft — unauthenticated CTAs go to /login.
 * Every step persists to a localStorage draft; returning resumes the flow.
 */

const STEP_COUNT = 5;
const EASE_OUT = [0.22, 1, 0.36, 1] as [number, number, number, number];
const EASE_SPRING = [0.34, 1.56, 0.64, 1] as [number, number, number, number];

export default function Onboarding() {
  const navigate = useNavigate();
  const { isAuthenticated, isLoading: authLoading } = useAuth();

  const [draft, setDraft] = useState<OnboardingDraft>(() =>
    typeof window === 'undefined' ? emptyOnboardingDraft : loadOnboardingDraft(),
  );
  const [dir, setDir] = useState(1);
  const step = Math.min(draft.step, STEP_COUNT);

  const update = useCallback((patch: Partial<OnboardingDraft>) => {
    setDraft((d) => {
      const next = { ...d, ...patch };
      saveOnboardingDraft(next);
      return next;
    });
  }, []);

  const goTo = useCallback(
    (next: number) => {
      setDir(next > draft.step ? 1 : -1);
      update({ step: next });
    },
    [draft.step, update],
  );

  /* — backend — */
  const meQuery = trpc.profile.me.useQuery(undefined, {
    enabled: isAuthenticated,
    retry: false,
    staleTime: 60_000,
  });
  const upsert = trpc.profile.upsert.useMutation({
    onSuccess: () => void meQuery.refetch(),
  });
  const verify = trpc.profile.verify.useMutation();

  /* Prefill basics from an existing profile row (returning user, empty draft) */
  useEffect(() => {
    const profile = meQuery.data?.profile;
    if (!profile) return;
    setDraft((d) => {
      const dirty =
        d.firstName !== '' || d.birthday !== '' || d.gender.length > 0 || d.intent !== '';
      if (dirty) return d;
      const next: OnboardingDraft = {
        ...d,
        firstName: d.firstName || profile.displayName || '',
        gender: d.gender.length > 0 ? d.gender : profile.gender ? profile.gender.split(', ') : [],
        pronouns: d.pronouns || profile.pronouns || '',
        intent: d.intent || profile.relationshipGoal || '',
        verified: d.verified || profile.verificationStatus === 'verified',
      };
      saveOnboardingDraft(next);
      return next;
    });
  }, [meQuery.data]);

  /* — per-step validity — */
  const age = ageFromBirthday(draft.birthday);
  const basicsValid =
    draft.firstName.trim().length > 0 &&
    age !== null &&
    age >= 18 &&
    draft.gender.length > 0 &&
    (draft.gender.includes('Self-describe') ? draft.customGender.trim().length > 0 : true) &&
    draft.showMe.length > 0;
  const intentValid = draft.intent !== '';

  /* — step actions — */
  const saveBasics = async () => {
    const genderLabel = draft.gender
      .map((g) => (g === 'Self-describe' ? draft.customGender.trim() : g))
      .join(', ');
    const pronouns = draft.pronouns === 'custom' ? draft.customPronouns.trim() : draft.pronouns;
    if (isAuthenticated && age !== null) {
      try {
        await upsert.mutateAsync({
          displayName: draft.firstName.trim(),
          age,
          gender: genderLabel || undefined,
          pronouns: pronouns || undefined,
        });
      } catch {
        /* offline/demo — local draft keeps the data */
      }
    }
    goTo(2);
  };

  const saveIntent = async () => {
    if (isAuthenticated && draft.intent) {
      try {
        await upsert.mutateAsync({ relationshipGoal: draft.intent });
      } catch {
        /* local draft keeps the data */
      }
    }
    goTo(3);
  };

  /* Mandatory gate: returns whether verification was accepted */
  const handleVerified = useCallback(async (): Promise<boolean> => {
    if (isAuthenticated) {
      try {
        await verify.mutateAsync();
      } catch {
        return false;
      }
    }
    setDraft((d) => {
      const next = { ...d, verified: true };
      saveOnboardingDraft(next);
      return next;
    });
    return true;
  }, [isAuthenticated, verify]);

  const saveAndExit = () => {
    saveOnboardingDraft(draft);
    navigate('/');
  };

  const finishFlow = () => {
    /* handoff to profile creation */
    navigate('/profile-setup');
  };

  /* — sticky CTA config per step (computed each render so actions never
       close over stale draft state) — */
  const cta = (() => {
    switch (step) {
      case 1:
        return { label: 'Continue', enabled: basicsValid, action: () => void saveBasics() };
      case 2:
        return { label: 'Continue', enabled: intentValid, action: () => void saveIntent() };
      case 3:
        return { label: 'Continue', enabled: draft.verified, action: () => goTo(4) };
      case 4:
        return { label: 'Continue', enabled: true, action: () => goTo(5) };
      default:
        return null; // steps 0 & 5 carry their own CTAs
    }
  })();

  const showChrome = step >= 1 && step <= 4;

  return (
    <div className="relative flex h-full min-h-[100dvh] flex-col md:min-h-0">
      {showChrome && (
        <FlowChrome
          total={STEP_COUNT}
          current={step - 1}
          onBack={() => goTo(step - 1)}
          right={
            <BtnGhost onClick={saveAndExit} className="t-caption px-2">
              Save &amp; exit
            </BtnGhost>
          }
        />
      )}

      {/* step content */}
      <div className="relative flex-1 overflow-hidden">
        <AnimatePresence mode="wait" custom={dir} initial={false}>
          <motion.div
            key={step}
            className={step === 3 ? 'h-full overflow-hidden' : 'h-full overflow-y-auto no-scrollbar'}
            custom={dir}
            initial={{ opacity: 0, x: 64 * dir }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -64 * dir }}
            transition={{ duration: 0.32, ease: EASE_OUT }}
          >
            {step === 0 && (
              <WelcomeStep
                isAuthenticated={isAuthenticated}
                authLoading={authLoading}
                onCreate={() => goTo(1)}
              />
            )}
            {step === 1 && <AboutYouStep draft={draft} update={update} />}
            {step === 2 && <IntentStep draft={draft} update={update} />}
            {step === 3 && <VerifyStep onVerified={handleVerified} />}
            {step === 4 && (
              <PermissionsStep draft={draft} update={update} onSkip={() => goTo(5)} />
            )}
            {step === 5 && <DoneStep onContinue={finishFlow} />}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* sticky primary CTA (steps 1–4); disabled = violet at 0.35, no glow;
          enabling fades the violet glow in over 240ms (§1 animation) */}
      {cta && (
        <div
          className={cn('relative z-20 shrink-0 px-5 pt-3 pb-5', step === 3 && 'bg-[#07070D]')}
          style={{ paddingBottom: 'max(20px, env(safe-area-inset-bottom, 0px))' }}
        >
          <motion.button
            type="button"
            onClick={cta.action}
            disabled={!cta.enabled}
            whileTap={cta.enabled ? { scale: 0.96 } : undefined}
            transition={{ duration: 0.12, ease: EASE_SPRING }}
            className="t-button flex h-[52px] w-full items-center justify-center rounded-full text-white select-none"
            style={{
              background: 'var(--violet)',
              opacity: cta.enabled ? 1 : 0.35,
              boxShadow: cta.enabled ? 'var(--violet-glow)' : 'none',
              transition: 'opacity 240ms var(--ease-out), box-shadow 240ms var(--ease-out)',
            }}
          >
            {cta.label}
          </motion.button>
        </div>
      )}

      {/* unauthenticated hint on gated steps */}
      {!authLoading && !isAuthenticated && step >= 1 && step <= 4 && (
        <div className="pointer-events-none absolute bottom-24 left-0 right-0 z-10 flex justify-center">
          <button
            type="button"
            onClick={() => navigate(LOGIN_PATH)}
            className="t-caption pointer-events-auto underline underline-offset-4"
            style={{ color: step === 3 ? 'rgba(255,255,255,0.6)' : 'var(--text-secondary)' }}
          >
            Demo mode — sign in to save your progress
          </button>
        </div>
      )}
    </div>
  );
}
