/**
 * sanctions/matcher — pure name-matching functions. No I/O, no DB, no network.
 *
 * This is the in-process v1 matcher for the self-hosted KYC program. It is
 * deliberately isolated behind pure functions so the long-term
 * moov-io/watchman sidecar can replace it without touching the screener /
 * router layers — only this module's internals change.
 */

/** Verdict thresholds (score is 0–100). */
export const MATCH_THRESHOLD = 95;
export const REVIEW_THRESHOLD = 85;

export type SanctionsVerdict = "CLEAR" | "REVIEW" | "MATCH";

/** Lowercase, strip diacritics (NFD + combining marks), drop punctuation,
 * collapse whitespace. Deterministic — the same input always yields the same
 * SHA-256 hash in the screener. */
export function normalizeName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip combining diacritical marks (U+0300–U+036F)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Classic Jaro similarity, 0..1. */
function jaro(a: string, b: string): number {
  if (a === b) return 1;
  const lenA = a.length;
  const lenB = b.length;
  if (lenA === 0 || lenB === 0) return 0;

  const matchDistance = Math.max(Math.floor(Math.max(lenA, lenB) / 2) - 1, 0);
  const aMatched = new Array<boolean>(lenA).fill(false);
  const bMatched = new Array<boolean>(lenB).fill(false);

  let matches = 0;
  for (let i = 0; i < lenA; i++) {
    const start = Math.max(0, i - matchDistance);
    const end = Math.min(i + matchDistance + 1, lenB);
    for (let j = start; j < end; j++) {
      if (bMatched[j] || a[i] !== b[j]) continue;
      aMatched[i] = true;
      bMatched[j] = true;
      matches++;
      break;
    }
  }
  if (matches === 0) return 0;

  let transpositions = 0;
  let k = 0;
  for (let i = 0; i < lenA; i++) {
    if (!aMatched[i]) continue;
    while (!bMatched[k]) k++;
    if (a[i] !== b[k]) transpositions++;
    k++;
  }
  transpositions /= 2;

  return (
    (matches / lenA + matches / lenB + (matches - transpositions) / matches) / 3
  );
}

const WINKLER_PREFIX_BOOST = 0.1;
const WINKLER_MAX_PREFIX = 4;
/** Standard Winkler gate: only boost strong Jaro matches. */
const WINKLER_BOOST_THRESHOLD = 0.7;

/** Jaro-Winkler similarity, 0..1 (prefix boost 0.1, max prefix 4). */
export function jaroWinkler(a: string, b: string): number {
  const j = jaro(a, b);
  if (j <= WINKLER_BOOST_THRESHOLD) return j;
  let prefix = 0;
  const limit = Math.min(WINKLER_MAX_PREFIX, a.length, b.length);
  while (prefix < limit && a[prefix] === b[prefix]) prefix++;
  return j + prefix * WINKLER_PREFIX_BOOST * (1 - j);
}

/** Jaccard overlap over normalized token sets, 0..1. */
export function tokenOverlap(a: string, b: string): number {
  const tokensA = new Set(normalizeName(a).split(" ").filter(Boolean));
  const tokensB = new Set(normalizeName(b).split(" ").filter(Boolean));
  if (tokensA.size === 0 && tokensB.size === 0) return 1;
  if (tokensA.size === 0 || tokensB.size === 0) return 0;
  let intersection = 0;
  for (const token of tokensA) {
    if (tokensB.has(token)) intersection++;
  }
  return intersection / (tokensA.size + tokensB.size - intersection);
}

/** Token permutations for short names (2–3 tokens) — catches reordered
 * "SURNAME, Given" ↔ "Given SURNAME" variants that plain Jaro-Winkler scores
 * poorly. */
function tokenPermutations(tokens: string[]): string[] {
  if (tokens.length < 2 || tokens.length > 3) return [];
  if (tokens.length === 2) {
    return [tokens.join(" "), `${tokens[1]} ${tokens[0]}`];
  }
  const [x, y, z] = tokens;
  return [
    `${x} ${y} ${z}`,
    `${x} ${z} ${y}`,
    `${y} ${x} ${z}`,
    `${y} ${z} ${x}`,
    `${z} ${x} ${y}`,
    `${z} ${y} ${x}`,
  ];
}

/** Combined 0–100 match score: best of full-string Jaro-Winkler, token-set
 * Jaccard, and Jaro-Winkler across token permutations (2–3 token names). */
export function scoreName(query: string, candidate: string): number {
  const nq = normalizeName(query);
  const nc = normalizeName(candidate);
  if (nq.length === 0 || nc.length === 0) return 0;

  let best = jaroWinkler(nq, nc);
  best = Math.max(best, tokenOverlap(nq, nc));

  const qPerms = tokenPermutations(nq.split(" "));
  const cPerms = tokenPermutations(nc.split(" "));
  for (const p of qPerms.length > 0 ? qPerms : [nq]) {
    for (const c of cPerms.length > 0 ? cPerms : [nc]) {
      best = Math.max(best, jaroWinkler(p, c));
    }
  }

  return Math.round(Math.min(1, Math.max(0, best)) * 100);
}

/** Map a 0–100 score to a screening verdict. */
export function verdictForScore(score: number): SanctionsVerdict {
  if (score >= MATCH_THRESHOLD) return "MATCH";
  if (score >= REVIEW_THRESHOLD) return "REVIEW";
  return "CLEAR";
}
