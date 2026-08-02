/**
 * Shared draft state for the profile builder (/profile-setup) — autosaved to
 * localStorage per profile-create.md "States & edge cases" (draft autosave).
 */

import { loadOnboardingDraft } from '@/components/onboarding/draft';

const GOAL_VALUES = ['serious', 'casual', 'explore', 'enm', 'friendship'] as const;

type GoalValue = (typeof GOAL_VALUES)[number];

/** The intent chosen during onboarding, when it's a valid relationship goal. */
function loadOnboardingGoal(): GoalValue | null {
  try {
    const intent = loadOnboardingDraft().intent;
    return (GOAL_VALUES as readonly string[]).includes(intent) ? (intent as GoalValue) : null;
  } catch {
    return null;
  }
}

export type PromptEntry = { question: string; answer: string };

/** Stable slot ids keep drag-reorder keys unique even with multiple empty tiles.
    `saved` marks slots already persisted to the backend this session — their
    data URLs are stripped from localStorage (rehydrated from profile.me). */
export type PhotoSlot = { id: string; photo: string | null; saved?: boolean };

export type ConstellationSlot =
  | { status: 'confirmed'; photo: string; handle: string }
  | { status: 'pending'; photo: string; handle: string }
  | { status: 'empty' };

export type ProfileSetupDraft = {
  step: number;
  /** 6 photo slots; photo null = empty tile */
  photos: PhotoSlot[];
  /** true once the user changes photos this session — protects unsaved picks
      from being re-seeded by the backend profile. Session-only: never saved. */
  photosTouched: boolean;
  prompts: PromptEntry[];
  goal: '' | 'serious' | 'casual' | 'explore' | 'enm' | 'friendship';
  /** true once the user explicitly picked a goal here — protects it from
      being re-seeded by the onboarding intent / backend profile */
  goalTouched: boolean;
  status: string;
  lifestyle: string[];
  values: string[];
  kink: string[];
  kinkRevealed: boolean;
  family: string;
  voiceRecorded: boolean;
  voiceSeconds: number;
  /** recorded voice note as a data URL — session memory only, stripped from
      localStorage (size) once persisted to the backend */
  voiceNoteData: string | null;
  constellation: ConstellationSlot[];
  reflectionsDone: boolean;
  reflectionsAnswers: number[];
};

export const PROFILE_DRAFT_KEY = 'resonance-profile-draft';

const emptyPhotoSlots: PhotoSlot[] = [
  { id: 's1', photo: null },
  { id: 's2', photo: null },
  { id: 's3', photo: null },
  { id: 's4', photo: null },
  { id: 's5', photo: null },
  { id: 's6', photo: null },
];

/** Stock photos for the signed-out demo mode ONLY — never for real profiles. */
export const DEMO_PHOTO_PATHS = ['/self-01.jpg', '/self-02.jpg', '/self-03.jpg', '/self-04.jpg'];

export function demoPhotoSlots(): PhotoSlot[] {
  return emptyPhotoSlots.map((slot, i) => ({
    ...slot,
    photo: DEMO_PHOTO_PATHS[i] ?? null,
  }));
}

export const emptyProfileSetupDraft: ProfileSetupDraft = {
  step: 1,
  /* Signed-in builders start EMPTY (add-photo tiles) — the backend profile is
     the source of truth and seeds these slots once profile.me loads. */
  photos: emptyPhotoSlots.map((s) => ({ ...s })),
  photosTouched: false,
  /* Start EMPTY — real users write their own answers. Demo prompt answers
     must never be pre-filled: anything present here publishes to the live
     profile on save. */
  prompts: [],
  goal: 'explore',
  goalTouched: false,
  status: 'Single',
  lifestyle: ['Night owl', 'Pet person', 'Traveler'],
  values: ['Curiosity', 'Directness'],
  kink: [],
  kinkRevealed: false,
  family: '',
  voiceRecorded: false,
  voiceSeconds: 0,
  voiceNoteData: null,
  constellation: [
    { status: 'confirmed', photo: '/avatar-10.jpg', handle: '@ren' },
    { status: 'pending', photo: '/avatar-07.jpg', handle: '@sol' },
    { status: 'empty' },
    { status: 'empty' },
    { status: 'empty' },
  ],
  reflectionsDone: false,
  reflectionsAnswers: [],
};

export function loadProfileSetupDraft(): ProfileSetupDraft {
  try {
    const raw = window.localStorage.getItem(PROFILE_DRAFT_KEY);
    if (!raw) return emptyProfileSetupDraft;
    const parsed = JSON.parse(raw) as Partial<ProfileSetupDraft>;
    const merged = { ...emptyProfileSetupDraft, ...parsed };
    /* session-only flag — a reload means "no unsaved picks this session" */
    merged.photosTouched = false;
    if (!Array.isArray(merged.photos) || merged.photos.length !== 6) {
      merged.photos = emptyProfileSetupDraft.photos.map((s) => ({ ...s }));
    } else if (typeof merged.photos[0] === 'string' || merged.photos[0] === null) {
      /* migrate legacy string[] drafts to stable slot objects */
      merged.photos = (merged.photos as unknown as (string | null)[]).map((photo, i) => ({
        id: `s${i + 1}`,
        photo,
      }));
    } else {
      /* strip any stock demo photos from a legacy signed-in draft — real
         photos rehydrate from the backend; demo mode re-seeds its own */
      merged.photos = merged.photos.map((s, i) =>
        s && typeof s === 'object' && !Array.isArray(s)
          ? { id: s.id ?? `s${i + 1}`, photo: s.photo ?? null, saved: s.saved }
          : { id: `s${i + 1}`, photo: null },
      );
    }
    if (!Array.isArray(merged.constellation) || merged.constellation.length !== 5) {
      merged.constellation = emptyProfileSetupDraft.constellation;
    }
    /* Migrate legacy 0–4 reflection answers to the 1–5 backend contract */
    if (
      Array.isArray(merged.reflectionsAnswers) &&
      merged.reflectionsAnswers.some((v) => typeof v !== 'number' || v < 1 || v > 5)
    ) {
      merged.reflectionsAnswers = merged.reflectionsAnswers
        .filter((v) => typeof v === 'number')
        .map((v) => Math.min(5, Math.max(1, v + 1)));
    }
    if (!merged.goalTouched) {
      /* Seed the goal from the onboarding intent instead of clobbering it
         with the 'explore' default. */
      const onboarding = loadOnboardingGoal();
      if (onboarding) merged.goal = onboarding;
    }
    return merged;
  } catch {
    return emptyProfileSetupDraft;
  }
}

/** Persist the draft to localStorage. Photo data URLs that are already saved
    to the backend are replaced with a lightweight `{ saved: true }` marker —
    multi-MB base64 strings blow the ~5MB iOS Safari quota and silently kill
    the whole draft. Returns false when the write fails so callers can toast. */
export function saveProfileSetupDraft(draft: ProfileSetupDraft): boolean {
  try {
    const persistable: ProfileSetupDraft = {
      ...draft,
      photosTouched: false, // session-only — never persisted
      voiceNoteData: null, // session memory only — never hits localStorage quota
      photos: draft.photos.map((s) =>
        s.saved && typeof s.photo === 'string' && s.photo.startsWith('data:')
          ? { id: s.id, photo: null, saved: true }
          : s,
      ),
    };
    window.localStorage.setItem(PROFILE_DRAFT_KEY, JSON.stringify(persistable));
    return true;
  } catch {
    /* storage unavailable / quota exceeded — caller surfaces a toast */
    return false;
  }
}

/** Profile strength meter — 100 points across completion events
 * (28+24+6+4+3+3 = 68 for the pre-filled demo, per profile-create.md). */
export function profileStrength(draft: ProfileSetupDraft): number {
  const filled = draft.photos.filter((s) => s.photo).length;
  const answered = draft.prompts.filter((p) => p.answer.trim().length > 0).length;
  const confirmed = draft.constellation.filter((s) => s.status === 'confirmed').length;
  let score = 0;
  score += Math.min(filled, 4) * 7; // 28 — photos (≥4)
  score += Math.min(answered, 3) * 8; // 24 — prompts (≥3)
  if (draft.goal) score += 6;
  if (draft.status) score += 4;
  if (draft.lifestyle.length > 0) score += 3;
  if (draft.values.length > 0) score += 3;
  if (draft.voiceRecorded) score += 12;
  if (confirmed > 0) score += 8;
  if (draft.reflectionsDone) score += 12;
  return Math.min(100, score);
}
