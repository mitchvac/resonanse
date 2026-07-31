/**
 * Shared draft state for the onboarding flow — persisted to localStorage so
 * an interrupted flow resumes where it left off (onboarding.md "States &
 * edge cases": every step persists to draft state).
 */

export type OnboardingDraft = {
  step: number;
  firstName: string;
  /** auto-formatted MM/DD/YYYY */
  birthday: string;
  gender: string[];
  customGender: string;
  pronouns: string;
  customPronouns: string;
  showMe: string[];
  /** relationshipGoal enum value */
  intent: '' | 'serious' | 'casual' | 'explore' | 'enm' | 'friendship';
  openTo: string[];
  showIntent: boolean;
  verified: boolean;
  permissions: Record<'location' | 'notifications' | 'photos', 'idle' | 'allowed' | 'denied'>;
};

export const ONBOARDING_DRAFT_KEY = 'resonance-onboarding-draft';

export const emptyOnboardingDraft: OnboardingDraft = {
  step: 0,
  firstName: '',
  birthday: '',
  gender: [],
  customGender: '',
  pronouns: '',
  customPronouns: '',
  showMe: [],
  intent: '',
  openTo: [],
  showIntent: true,
  verified: false,
  permissions: { location: 'idle', notifications: 'idle', photos: 'idle' },
};

export function loadOnboardingDraft(): OnboardingDraft {
  try {
    const raw = window.localStorage.getItem(ONBOARDING_DRAFT_KEY);
    if (!raw) return emptyOnboardingDraft;
    const parsed = JSON.parse(raw) as Partial<OnboardingDraft>;
    return { ...emptyOnboardingDraft, ...parsed, permissions: { ...emptyOnboardingDraft.permissions, ...(parsed.permissions ?? {}) } };
  } catch {
    return emptyOnboardingDraft;
  }
}

export function saveOnboardingDraft(draft: OnboardingDraft) {
  try {
    window.localStorage.setItem(ONBOARDING_DRAFT_KEY, JSON.stringify(draft));
  } catch {
    /* storage unavailable — flow still works in-session */
  }
}

/** digits → MM/DD/YYYY auto-format */
export function formatBirthday(input: string): string {
  const digits = input.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

/** age from MM/DD/YYYY; null when incomplete/invalid */
export function ageFromBirthday(birthday: string): number | null {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(birthday);
  if (!match) return null;
  const [, mm, dd, yyyy] = match;
  const month = Number(mm);
  const day = Number(dd);
  const year = Number(yyyy);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  if (year < 1900 || year > new Date().getFullYear()) return null;
  const dob = new Date(year, month - 1, day);
  if (dob.getMonth() !== month - 1 || dob.getDate() !== day) return null;
  const now = new Date();
  let age = now.getFullYear() - year;
  const beforeBirthday =
    now.getMonth() < month - 1 || (now.getMonth() === month - 1 && now.getDate() < day);
  if (beforeBirthday) age -= 1;
  return age;
}
