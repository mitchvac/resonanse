/**
 * Liar's Dice (Perudo) — pure game logic.
 * Ones are wild. Bids use faces 2–6. All bot decisions are made honestly:
 * a bot only ever reads its own dice plus public information (the current
 * bid and how many dice are still hidden from it).
 */

/** Bid faces — 1 is wild and can never be the bid face. */
export type BidFace = 2 | 3 | 4 | 5 | 6;

export interface Bid {
  quantity: number;
  face: BidFace;
}

export type Rng = () => number;

export type BotDecision = { kind: 'bid'; bid: Bid } | { kind: 'challenge' };

export const BID_FACES: readonly BidFace[] = [2, 3, 4, 5, 6];

/** Roll `count` fresh dice (values 1–6). */
export function rollDice(count: number, rng: Rng = Math.random): number[] {
  return Array.from({ length: count }, () => 1 + Math.floor(rng() * 6));
}

/**
 * Is `next` a legal bid given `current`?
 * Opening bid: quantity ≥ 1, face 2–6.
 * Raise: higher quantity (any face) or same quantity with a higher face.
 */
export function isLegalBid(current: Bid | null, next: Bid): boolean {
  if (!Number.isInteger(next.quantity) || next.quantity < 1) return false;
  if (!BID_FACES.includes(next.face)) return false;
  if (!current) return true;
  if (next.quantity > current.quantity) return true;
  return next.quantity === current.quantity && next.face > current.face;
}

/**
 * Count dice matching the bid face across all live players' dice —
 * the face itself plus 1s (wild).
 */
export function countMatchingDice(allDice: readonly (readonly number[])[], face: BidFace): number {
  let total = 0;
  for (const dice of allDice) {
    for (const d of dice) {
      if (d === face || d === 1) total += 1;
    }
  }
  return total;
}

/** Dice in `ownDice` that count toward `face` (face or wild 1). */
export function ownMatches(ownDice: readonly number[], face: BidFace): number {
  return ownDice.filter((d) => d === face || d === 1).length;
}

/**
 * Honest expectation for how many dice on the whole table count toward
 * `face`: what the bot holds plus 1/3 of every die it cannot see
 * (P(face) + P(wild) = 1/6 + 1/6).
 */
export function expectedCount(
  ownDice: readonly number[],
  face: BidFace,
  totalUnknownDice: number,
): number {
  return ownMatches(ownDice, face) + totalUnknownDice / 3;
}

/**
 * Challenge threshold: how far above expectation a bid must be before a
 * bot calls liar. Tightens as the table shrinks (fewer hidden dice →
 * less variance → bold bids are more suspicious).
 */
export function challengeThreshold(totalUnknownDice: number): number {
  if (totalUnknownDice > 10) return 2.5;
  if (totalUnknownDice > 5) return 1.5;
  return 1;
}

/**
 * Decide a bot's turn. Conservative, probability-based, occasional bluff.
 * - Challenge when the standing bid beats expectation + threshold.
 * - Otherwise raise minimally: prefer a same-quantity bump onto a higher
 *   face the bot actually backs, else quantity + 1 on its strongest face.
 * - ~12% of bids push one notch past expectation (bluff).
 */
export function bidDecision(
  ownDice: readonly number[],
  currentBid: Bid | null,
  totalUnknownDice: number,
  rng: Rng = Math.random,
): BotDecision {
  const expected = (face: BidFace) => expectedCount(ownDice, face, totalUnknownDice);

  if (currentBid && currentBid.quantity > expected(currentBid.face) + challengeThreshold(totalUnknownDice)) {
    // Obvious overshoot — call it, unless this bot is feeling bluffy.
    if (rng() >= 0.12) return { kind: 'challenge' };
  }

  const bluff = rng() < 0.12 ? 1 : 0;
  // Strongest face = the one the bot backs most with its own dice.
  const bestFace = BID_FACES.reduce((a, b) => (ownMatches(ownDice, b) > ownMatches(ownDice, a) ? b : a));

  if (!currentBid) {
    return {
      kind: 'bid',
      bid: { quantity: Math.max(1, Math.round(expected(bestFace)) + bluff), face: bestFace },
    };
  }

  // Same-quantity raise onto a higher face the bot can back.
  const higher = BID_FACES.filter(
    (f) => f > currentBid.face && expected(f) + 0.34 >= currentBid.quantity,
  );
  if (higher.length > 0 && rng() < 0.55) {
    const face = higher.reduce((a, b) => (ownMatches(ownDice, b) > ownMatches(ownDice, a) ? b : a));
    return { kind: 'bid', bid: { quantity: currentBid.quantity, face } };
  }

  return {
    kind: 'bid',
    bid: { quantity: currentBid.quantity + 1 + bluff, face: bestFace },
  };
}

/** Index of the first live player at or after `from` (clockwise, wraps). */
export function nextLiveIndex(alive: readonly boolean[], from: number): number {
  const n = alive.length;
  for (let step = 0; step < n; step++) {
    const i = (from + step) % n;
    if (alive[i]) return i;
  }
  return from;
}

/** Index of the next live player strictly after `current` (clockwise). */
export function nextTurnIndex(alive: readonly boolean[], current: number): number {
  return nextLiveIndex(alive, current + 1);
}
