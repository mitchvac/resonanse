/**
 * Referral-bounty (V71) — code derivation + display helpers (pure, no DB).
 *
 * A member's referral code is DETERMINISTIC: RS-<base36 userId, 6 chars>-<4
 * char checksum>. The checksum binds the code to the user id via sha256 of
 * `${userId}:${secret}` so a code can't be guessed for another account by
 * simple incrementing. No table is needed — the code never changes.
 */
import { createHash } from "node:crypto";
import { env } from "../env";

/** Flat referral conversion bounty: $7.00 in micro-USD. */
export const REFERRAL_BOUNTY_USD_MICRO = 7_000_000;
/** A new member may apply a code within this many days of joining. */
export const CLAIM_WINDOW_DAYS = 7;
/** Referred member must stay subscribed this long before the bounty vests. */
export const QUALIFY_DAYS = 30;

/** Crockford-ish base32 (no I, L, O, U) — unambiguous when read aloud. */
const CHECKSUM_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/**
 * Server-side pepper for the checksum. `env` has no sessionSecret key;
 * appSecret is the closest server-only secret and falls back to a constant
 * in non-production so codes stay stable in dev/test.
 */
function codeSecret(): string {
  return env.appSecret || "resonance";
}

function checksumFor(userId: number): string {
  const digest = createHash("sha256")
    .update(`${userId}:${codeSecret()}`)
    .digest();
  let out = "";
  for (let i = 0; i < 4; i += 1) {
    out += CHECKSUM_ALPHABET[digest[i]! % CHECKSUM_ALPHABET.length];
  }
  return out;
}

/** The member's stable referral code, e.g. RS-0000AB-3F7K. */
export function getOrCreateReferralCode(userId: number): string {
  const body = userId.toString(36).toUpperCase().padStart(6, "0");
  return `RS-${body}-${checksumFor(userId)}`;
}

/**
 * Validate a code and return the referrer's user id, or null when the code
 * is malformed or the checksum doesn't match. Input is normalized first:
 * trimmed, uppercased, dashes/spaces stripped (RS0000AB3F7K works too).
 */
export function parseReferralCode(code: string): number | null {
  const normalized = code
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "");
  // Greedy body — the checksum is always the trailing 4 characters.
  const match = /^RS([0-9A-Z]+)([0-9A-Z]{4})$/.exec(normalized);
  if (!match) return null;
  const [, body, checksum] = match;
  if (!body || !checksum) return null;
  const userId = Number.parseInt(body, 36);
  if (!Number.isSafeInteger(userId) || userId <= 0) return null;
  if (checksumFor(userId) !== checksum) return null;
  return userId;
}

/** "$7.00" — micro-USD → display string. */
export function formatUsdMicro(micro: number): string {
  return `$${(micro / 1_000_000).toFixed(2)}`;
}
