# Resonance — Auth Audit

Scope: `api/passwordAuthRouter.ts`, `api/kimi/auth.ts`, `api/kimi/session.ts`, `api/lib/*`,
`api/middleware.ts`, `api/context.ts`, `api/boot.ts`, `src/pages/SignIn.tsx`, `src/pages/Login.tsx`,
`src/App.tsx`, `contracts/constants.ts`. Findings ranked by severity.
`[FIXED]` = remediated in this branch (auth-upgrade); the rest are recommendations.

## Critical

_None found. Hashing (scrypt + timing-safe compare), cookie httpOnly, and generic login
errors are already correct._

## High

1. **H1 — No session invalidation on password change/reset.** Sessions are stateless 1-year
   JWTs (`api/kimi/session.ts:14`); after a password reset, previously issued tokens (e.g. a
   stolen one) remain valid until expiry. No logout-everywhere exists.
   Fix: add `sessionVersion` column on `users` (additive), embed it in the JWT at sign time,
   compare in `authenticateRequest`, bump it on password change/reset. (Deferred: requires
   a rolling deploy strategy so existing sessions aren't all logged out at once.)
2. **H2 — No brute-force rate limiting on login/register.** `login` burns scrypt time for
   unknown emails (good) but nothing throttles repeated attempts (`api/passwordAuthRouter.ts:157`).
   [FIXED] In-memory per-email + per-IP throttles added to `login`/`register` alongside the
   reset endpoints. Recommend moving to a shared store (Redis) if the server scales past 1 replica.
3. **H3 — 1-year session expiry with no refresh.** `Session.maxAgeMs` = 365 days
   (`contracts/constants.ts:3`) and JWT `setExpirationTime("1 year")`. Long-lived theft window.
   Fix: 30-day expiry + rolling re-issue on activity.

## Medium

4. **M1 — Email enumeration via register.** `register` returns CONFLICT "Account exists —
   sign in instead" (`api/passwordAuthRouter.ts:110-113`). Inherent to inline register UX;
   mitigated by H2 rate limits + the enumeration-safe reset flow added in this branch
   (`requestPasswordReset` always returns one generic message).
5. **M2 — `sameSite=None` on the session cookie for all non-localhost hosts**
   (`api/lib/cookies.ts:14`). `None` + `Secure` is required for cross-site embedding but widens
   CSRF exposure for a first-party SPA. Fix: use `Lax` (top-level OAuth redirects still work);
   verify no iframe embedding depends on `None` first.
6. **M3 — Two divergent login surfaces.** `/login` (`src/pages/Login.tsx`) is a Kimi-only
   placeholder; `/signin` is the real unified flow (`src/App.tsx:26-28`). Users landing on
   `/login` can't use email/password. [FIXED] Google button added to both; recommend
   consolidating `/login` → redirect to `/signin`.
7. **M4 — OAuth `state` in the Kimi flow is only `btoa(redirectUri)`** — no CSRF/nonce value
   (`src/pages/Login.tsx:8`, `api/kimi/auth.ts:96`). Not exploitable for account takeover here
   (unionId comes from the verified token), but it's not a real state. The new Google flow uses
   a random state stored in a short-lived httpOnly cookie and validated on callback; recommend
   the same for Kimi.

## Low

8. **L1 — Auth-routing dead end: signed-in users can sit on `/signin` and `/login`.**
   No redirect for already-authenticated visitors. [FIXED] `/signin` now redirects
   authenticated users to `/discover`.
9. **L2 — Password policy is length-only (min 8, max 128)** (`api/passwordAuthRouter.ts:98`).
   Acceptable floor; recommend adding breach-list (k-anonymity) or zxcvbn-style strength check
   at register/reset time. Reset flow matches register policy exactly.
10. **L3 — Noisy warn logs on every unauthenticated request** (`api/kimi/auth.ts:60`,
    `api/kimi/session.ts:22`). Log-spam/DoS-adjacent; downgrade to debug or sample.
11. **L4 — scrypt params N=16384/r=8/p=1** (`api/passwordAuthRouter.ts:29`) meet the OWASP
    minimum; consider N=32768 (still <100 ms) for new hashes — format is self-describing so
    old hashes keep verifying.
12. **L5 — Reset tokens ride in the URL query string** (`/reset-password?token=`). Standard
    practice, but the page should strip the token from history after read and avoid rendering
    it in links/analytics. [FIXED] client removes the query param after load.

## Positive observations

- scrypt with per-user salt, `timingSafeEqual` compare, self-describing hash format.
- Login error is generic ("Wrong email or password") and unknown emails burn equal scrypt time.
- Session cookie: httpOnly, Secure (non-localhost), path=/, serialized via `cookie` lib.
- tRPC context never throws on missing auth; `authedQuery` gate is server-side.
