export const Session = {
  cookieName: "kimi_sid",
  maxAgeMs: 365 * 24 * 60 * 60 * 1000,
} as const;

export const ErrorMessages = {
  unauthenticated: "Authentication required",
  insufficientRole: "Insufficient permissions",
} as const;

export const Paths = {
  login: "/login",
  oauthCallback: "/api/oauth/callback",
} as const;

// ── Resonance domain constants (additive) ─────────────────────────────

export const Resonance = {
  queueSize: 8,
  messagesPageSize: 50,
  freeDailyLikes: 5,
  freePulses: 3,
  premiumDailyLikeLimit: 999,
  xBoosts: 99,
  seedReciprocityModulo: 5,
  seedReciprocityThreshold: 2,
} as const;
