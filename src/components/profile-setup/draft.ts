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

/** Stable slot ids keep drag-reorder keys unique even with multiple empty tiles */
export type PhotoSlot = { id: string; photo: string | null };

export type ConstellationSlot =
  | { status: 'confirmed'; photo: string; handle: string }
  | { status: 'pending'; photo: string; handle: string }
  | { status: 'empty' };

export type ProfileSetupDraft = {
  step: number;
  /** 6 photo slots; photo null = empty tile */
  photos: PhotoSlot[];
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
  constellation: ConstellationSlot[];
  reflectionsDone: boolean;
  reflectionsAnswers: number[];
};

export const PROFILE_DRAFT_KEY = 'resonance-profile-draft';

export const emptyProfileSetupDraft: ProfileSetupDraft = {
  step: 1,
  photos: [
    { id: 's1', photo: '/self-01.jpg' },
    { id: 's2', photo: '/self-02.jpg' },
    { id: 's3', photo: '/self-03.jpg' },
    { id: 's4', photo: '/self-04.jpg' },
    { id: 's5', photo: null },
    { id: 's6', photo: null },
  ],
  prompts: [
    {
      question: 'The way to my heart is…',
      answer:
        'A farmers-market tomato, good olive oil, and someone who reads the whole menu out loud.',
    },
    {
      question: 'Green flags I look for…',
      answer:
        "You text back when you say you will. You have a thing you're nerdy about. You're kind to waiters.",
    },
    {
      question: 'Two truths and a lie:',
      answer:
        "I've brewed coffee in 9 countries. I can wiggle my ears. I once DJ'd a wedding by accident.",
    },
  ],
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
    if (!Array.isArray(merged.photos) || merged.photos.length !== 6) {
      merged.photos = emptyProfileSetupDraft.photos;
    } else if (typeof merged.photos[0] === 'string' || merged.photos[0] === null) {
      /* migrate legacy string[] drafts to stable slot objects */
      merged.photos = (merged.photos as unknown as (string | null)[]).map((photo, i) => ({
        id: `s${i + 1}`,
        photo,
      }));
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

export function saveProfileSetupDraft(draft: ProfileSetupDraft) {
  try {
    window.localStorage.setItem(PROFILE_DRAFT_KEY, JSON.stringify(draft));
  } catch {
    /* storage unavailable — builder still works in-session */
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
