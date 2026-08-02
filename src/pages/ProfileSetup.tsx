import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { motion, AnimatePresence, animate } from 'framer-motion';
import { Check } from 'lucide-react';
import FlowChrome from '@/components/flow/FlowChrome';
import { FlowToast } from '@/components/flow/feedback';
import { BtnGhost } from '@/components/ui/buttons';
import PhotosStep from '@/components/profile-setup/PhotosStep';
import PromptsStep from '@/components/profile-setup/PromptsStep';
import DesiresStep from '@/components/profile-setup/DesiresStep';
import VoiceNoteStep from '@/components/profile-setup/VoiceNoteStep';
import ConstellationStep from '@/components/profile-setup/ConstellationStep';
import ReflectionsStep, { ReflectionsFlow } from '@/components/profile-setup/ReflectionsStep';
import { MissingSheet, PreviewOverlay, PublishOverlay } from '@/components/profile-setup/overlays';
import {
  demoPhotoSlots,
  emptyProfileSetupDraft,
  loadProfileSetupDraft,
  profileStrength,
  saveProfileSetupDraft,
  type PhotoSlot,
  type ProfileSetupDraft,
} from '@/components/profile-setup/draft';
import { loadOnboardingDraft } from '@/components/onboarding/draft';
import { useAuth } from '@/hooks/useAuth';
import { trpc } from '@/providers/trpc';

/**
 * ProfileSetup — /profile-setup (profile-create.md)
 * The builder: 1 Photos → 2 Prompts → 3 Desires & Intent → 4 Voice note
 * (optional) → 5 Constellation (optional) → 6 Reflections teaser → publish.
 * Top chrome: back, 6-segment progress, "Preview" ghost. Live profile
 * strength meter pinned under the progress bar (2px violet fill + micro
 * label "PROFILE STRENGTH 68%") — 400ms width tween + count-up on every
 * completion event. Draft autosaves to localStorage.
 */

const STEP_COUNT = 6;
const EASE_OUT = [0.22, 1, 0.36, 1] as [number, number, number, number];
const EASE_SPRING = [0.34, 1.56, 0.64, 1] as [number, number, number, number];

/** pinned strength meter: 2px violet fill + micro label, count-up + width tween */
function StrengthMeter({ pct }: { pct: number }) {
  const [display, setDisplay] = useState(pct);
  const prev = useRef(pct);

  useEffect(() => {
    if (prev.current === pct) return;
    const controls = animate(prev.current, pct, {
      duration: 0.4,
      ease: 'easeOut',
      onUpdate: (v) => setDisplay(Math.round(v)),
    });
    prev.current = pct;
    return () => controls.stop();
  }, [pct]);

  return (
    <div className="mt-2 pb-1" aria-live="polite">
      <div className="flex items-baseline justify-between">
        <span className="t-micro" style={{ color: 'var(--text)' }}>
          PROFILE STRENGTH {display}%
        </span>
      </div>
      <div
        className="relative mt-1 h-0.5 overflow-hidden rounded-full"
        style={{ background: 'var(--field)' }}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-label={`Profile strength ${pct} percent`}
      >
        <motion.span
          className="absolute inset-0 rounded-full"
          style={{ background: 'var(--violet)', transformOrigin: 'left' }}
          initial={false}
          animate={{ scaleX: pct / 100 }}
          transition={{ duration: 0.4, ease: EASE_OUT }}
        />
      </div>
    </div>
  );
}

export default function ProfileSetup() {
  const navigate = useNavigate();
  const { isAuthenticated, isLoading: authLoading } = useAuth();

  const [draft, setDraft] = useState<ProfileSetupDraft>(() =>
    typeof window === 'undefined' ? emptyProfileSetupDraft : loadProfileSetupDraft(),
  );
  const [dir, setDir] = useState(1);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [reflectionsOpen, setReflectionsOpen] = useState(false);
  const [publishState, setPublishState] = useState<'saving' | 'error' | 'demo' | null>(null);
  const [missingOpen, setMissingOpen] = useState(false);
  const [toast, setToast] = useState<{ id: number; message: string } | null>(null);

  const step = Math.min(Math.max(draft.step, 1), STEP_COUNT);
  const pct = profileStrength(draft);

  const update = useCallback((patch: Partial<ProfileSetupDraft>) => {
    setDraft((d) => ({ ...d, ...patch }));
  }, []);

  /* Draft autosave — surface quota/write failures (iOS ~5MB) instead of
     silently losing the draft and reverting to an empty/stock builder. */
  const skipFirstSave = useRef(true);
  useEffect(() => {
    if (skipFirstSave.current) {
      skipFirstSave.current = false;
      return;
    }
    if (!saveProfileSetupDraft(draft)) {
      setToast({
        id: Date.now(),
        message: "Couldn't save your draft on this device — keep this tab open.",
      });
    }
  }, [draft]);

  const goTo = useCallback(
    (next: number) => {
      setDir(next > step ? 1 : -1);
      update({ step: next });
    },
    [step, update],
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

  const filledPhotos = useMemo(
    () => draft.photos.filter((s) => s.photo).map((s) => s.photo as string),
    [draft.photos],
  );
  const answeredPrompts = useMemo(
    () => draft.prompts.filter((p) => p.answer.trim().length > 0),
    [draft.prompts],
  );

  /* Seed the goal from the backend profile when the user hasn't picked one
     here yet (onboarding intent is seeded at draft load). */
  const profileGoal = meQuery.data?.profile?.relationshipGoal;
  useEffect(() => {
    if (!profileGoal || draft.goalTouched) return;
    if (draft.goal === profileGoal) return;
    update({ goal: profileGoal as ProfileSetupDraft['goal'] });
  }, [profileGoal, draft.goalTouched, draft.goal, update]);

  /* P0-2: seed photos from the backend profile (source of truth) so "Edit
     profile" never clobbers real photos with localStorage leftovers — unless
     the user has unsaved picks from THIS device session (photosTouched). */
  const backendPhotos = meQuery.data?.profile?.photos;
  useEffect(() => {
    if (!backendPhotos || draft.photosTouched) return;
    const current = draft.photos.filter((s) => s.photo).map((s) => s.photo as string);
    const same =
      current.length === backendPhotos.length &&
      current.every((p, i) => p === backendPhotos[i]);
    if (same) return;
    const slots: PhotoSlot[] = Array.from({ length: 6 }, (_, i) => ({
      id: `s${i + 1}`,
      photo: backendPhotos[i] ?? null,
    }));
    update({ photos: slots });
  }, [backendPhotos, draft.photosTouched, draft.photos, update]);

  /* Demo mode ONLY: signed-out visitors get the stock photos to play with. */
  useEffect(() => {
    if (authLoading || isAuthenticated || draft.photosTouched) return;
    if (draft.photos.some((s) => s.photo)) return;
    update({ photos: demoPhotoSlots() });
  }, [authLoading, isAuthenticated, draft.photosTouched, draft.photos, update]);

  /* Throws on failure — callers decide whether to advance (per-step continue
     tolerates offline; publish surfaces an honest error state). */
  const saveStep = useCallback(
    async (which: number): Promise<void> => {
      if (!isAuthenticated) return;
      if (which === 1) {
        await upsert.mutateAsync({ photos: filledPhotos });
      } else if (which === 2) {
        await upsert.mutateAsync({ prompts: answeredPrompts.slice(0, 5) });
      } else if (which === 3) {
        await upsert.mutateAsync({
          relationshipGoal: draft.goal || undefined,
          relationshipStatus: draft.status || undefined,
          // Lifestyle + values are public tags; consent-gated kink tags stay
          // private (never flattened into public `desires`).
          desires: [...draft.lifestyle, ...draft.values],
          privateDesires: draft.kink,
          familyPlans: draft.family || null,
        });
      } else if (which === 4) {
        if (draft.voiceNoteData) {
          /* real recording (data URL) — persisted to the profile field */
          await upsert.mutateAsync({ voiceNoteUrl: draft.voiceNoteData });
        } else if (!draft.voiceRecorded) {
          await upsert.mutateAsync({ voiceNoteUrl: null });
        }
        /* voiceRecorded without data: recorded earlier + already persisted
           immediately — don't clobber the backend value */
      } else if (which === 5) {
        await upsert.mutateAsync({
          constellation: draft.constellation
            .filter((s) => s.status !== 'empty')
            .map((s) => ({
              handle: s.handle,
              name: s.handle.replace(/^@/, ''),
              photo: s.photo,
              status: s.status,
            })),
        });
      } else if (which === 6) {
        if (draft.reflectionsAnswers.length > 0) {
          await upsert.mutateAsync({ reflections: draft.reflectionsAnswers.slice(0, 10) });
        }
      }
    },
    [isAuthenticated, upsert, filledPhotos, answeredPrompts, draft],
  );

  const continueFrom = (which: number) => {
    if (which === 1) {
      /* Photo step: if the save fails, stay put with the error toast — never
         advance past photos that didn't actually persist. */
      saveStep(1)
        .then(() => goTo(2))
        .catch(() =>
          setToast({ id: Date.now(), message: "Couldn't save your photos — try again." }),
        );
      return;
    }
    saveStep(which).catch(() =>
      setToast({ id: Date.now(), message: "Couldn't save — your draft is safe on this device." }),
    );
    goTo(which + 1);
  };

  /* — publish — */
  const missing = useMemo(() => {
    const items: string[] = [];
    if (filledPhotos.length < 4) {
      const n = 4 - filledPhotos.length;
      items.push(`Add ${n} more photo${n === 1 ? '' : 's'} (4 minimum)`);
    }
    if (answeredPrompts.length < 3) {
      const n = 3 - answeredPrompts.length;
      items.push(`Answer ${n} more prompt${n === 1 ? '' : 's'} (3 minimum)`);
    }
    return items;
  }, [filledPhotos, answeredPrompts]);

  const runSaves = useCallback(async (): Promise<boolean> => {
    const results = await Promise.allSettled([
      saveStep(1),
      saveStep(2),
      saveStep(3),
      saveStep(4),
      saveStep(5),
      saveStep(6),
    ]);
    return results.every((r) => r.status === 'fulfilled');
  }, [saveStep]);

  const publish = async () => {
    if (missing.length > 0) {
      setMissingOpen(true);
      return;
    }
    if (!isAuthenticated) {
      setPublishState('demo');
      return;
    }
    setPublishState('saving');
    const ok = await runSaves();
    if (ok) {
      finishPublish();
    } else {
      setPublishState('error');
    }
  };

  const retryPublish = async () => {
    setPublishState('saving');
    const ok = await runSaves();
    if (ok) {
      finishPublish();
    } else {
      setPublishState('error');
    }
  };

  const finishPublish = useCallback(() => {
    navigate('/discover');
  }, [navigate]);

  /* — CTA config (computed each render so actions never close over stale
       draft state) — */
  const cta = (() => {
    switch (step) {
      case 1:
        return { label: 'Continue', enabled: filledPhotos.length >= 4, action: () => continueFrom(1) };
      case 2:
        return { label: 'Continue', enabled: answeredPrompts.length >= 3, action: () => continueFrom(2) };
      case 3:
        return { label: 'Continue', enabled: true, action: () => continueFrom(3) };
      case 4:
        return { label: 'Continue', enabled: true, action: () => continueFrom(4) };
      case 5:
        return { label: 'Continue', enabled: true, action: () => continueFrom(5) };
      default:
        return { label: 'Publish my profile', enabled: true, action: () => void publish() };
    }
  })();

  /* preview identity: backend profile → onboarding draft → placeholder */
  const profile = meQuery.data?.profile;
  const onboardingDraft = typeof window === 'undefined' ? null : loadOnboardingDraft();
  const previewName = profile?.displayName || onboardingDraft?.firstName || 'You';
  const previewAge = profile?.age ?? null;
  const previewVerified =
    profile?.verificationStatus === 'verified' || onboardingDraft?.verified === true;

  return (
    <div className="relative flex h-full min-h-[100dvh] flex-col md:min-h-0">
      <FlowChrome
        total={STEP_COUNT}
        current={step - 1}
        onBack={() => (step > 1 ? goTo(step - 1) : navigate('/onboarding'))}
        right={
          <BtnGhost onClick={() => setPreviewOpen(true)} className="t-caption px-2">
            Preview
          </BtnGhost>
        }
        below={<StrengthMeter pct={pct} />}
      />

      {/* step content */}
      <div className="relative flex-1 overflow-hidden">
        <AnimatePresence mode="wait" custom={dir} initial={false}>
          <motion.div
            key={step}
            className="h-full overflow-y-auto no-scrollbar"
            custom={dir}
            initial={{ opacity: 0, x: 64 * dir }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -64 * dir }}
            transition={{ duration: 0.32, ease: EASE_OUT }}
          >
            {step === 1 && (
              <PhotosStep
                draft={draft}
                update={update}
                onToast={(message) => setToast({ id: Date.now(), message })}
              />
            )}
            {step === 2 && <PromptsStep draft={draft} update={update} />}
            {step === 3 && <DesiresStep draft={draft} update={update} />}
            {step === 4 && (
              <VoiceNoteStep
                draft={draft}
                update={update}
                onToast={(message) => setToast({ id: Date.now(), message })}
                savedVoiceUrl={profile?.voiceNoteUrl ?? null}
              />
            )}
            {step === 5 && <ConstellationStep draft={draft} update={update} />}
            {step === 6 && (
              <ReflectionsStep draft={draft} onStart={() => setReflectionsOpen(true)} />
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* sticky footer CTA */}
      <div
        className="relative z-20 shrink-0 px-5 pt-3 pb-5"
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

      {/* overlays */}
      <FlowToast
        toast={toast ? { ...toast, icon: <Check size={14} style={{ color: 'var(--ok)' }} /> } : null}
        onDismiss={() => setToast(null)}
      />
      <AnimatePresence>
        {previewOpen && (
          <PreviewOverlay
            key="preview"
            draft={draft}
            name={previewName}
            age={previewAge}
            verified={previewVerified}
            onClose={() => setPreviewOpen(false)}
          />
        )}
        {reflectionsOpen && (
          <ReflectionsFlow
            key="reflections"
            onClose={() => setReflectionsOpen(false)}
            onComplete={(answers) => {
              update({ reflectionsDone: true, reflectionsAnswers: answers });
              setReflectionsOpen(false);
            }}
          />
        )}
        {publishState && (
          <PublishOverlay
            key="publish"
            state={publishState}
            onRetry={() => void retryPublish()}
            onContinue={finishPublish}
          />
        )}
      </AnimatePresence>
      <MissingSheet open={missingOpen} missing={missing} onClose={() => setMissingOpen(false)} />
    </div>
  );
}
