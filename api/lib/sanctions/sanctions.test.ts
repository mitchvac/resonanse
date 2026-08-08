import { describe, expect, it } from "vitest";

import {
  MATCH_THRESHOLD,
  REVIEW_THRESHOLD,
  jaroWinkler,
  normalizeName,
  scoreName,
  tokenOverlap,
  verdictForScore,
} from "./matcher";

/**
 * Pure matcher unit tests only — no DB, no network. (The screener/fetcher
 * layers are thin I/O wrappers around these functions.)
 */

describe("normalizeName", () => {
  it("strips diacritics", () => {
    expect(normalizeName("José")).toBe("jose");
    expect(normalizeName("Renée Černý")).toBe("renee cerny");
  });

  it("removes punctuation and collapses whitespace", () => {
    expect(normalizeName("  Maduro   Moros,  Nicolas ")).toBe(
      "maduro moros nicolas",
    );
    expect(normalizeName("O'Brien-Smith")).toBe("o brien smith");
  });

  it("lowercases", () => {
    expect(normalizeName("KIM, Jong Un")).toBe("kim jong un");
  });
});

describe("jaroWinkler", () => {
  it("returns 1 for identical strings", () => {
    expect(jaroWinkler("maduro nicolas", "maduro nicolas")).toBe(1);
  });

  it("returns low scores for unrelated strings", () => {
    expect(jaroWinkler("alice johnson", "bob williams")).toBeLessThan(0.6);
  });

  it("stays within 0..1", () => {
    const v = jaroWinkler("kim jong un", "kim jong un");
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThanOrEqual(1);
  });
});

describe("tokenOverlap", () => {
  it("is 1 for identical token sets regardless of order", () => {
    expect(tokenOverlap("maduro nicolas", "nicolas maduro")).toBe(1);
  });

  it("is 0 for disjoint token sets", () => {
    expect(tokenOverlap("alice johnson", "bob williams")).toBe(0);
  });
});

describe("scoreName + verdictForScore", () => {
  it("scores an exact name 100 → MATCH", () => {
    const score = scoreName("MADURO MOROS, Nicolas", "MADURO MOROS, Nicolas");
    expect(score).toBe(100);
    expect(verdictForScore(score)).toBe("MATCH");
  });

  it("reordered tokens still hit REVIEW or MATCH", () => {
    const score = scoreName("Maduro Nicolas", "Nicolas Maduro");
    expect(score).toBeGreaterThanOrEqual(REVIEW_THRESHOLD);
    expect(["REVIEW", "MATCH"]).toContain(verdictForScore(score));
  });

  it("handles SURNAME, Given vs Given SURNAME ordering", () => {
    const score = scoreName("KIM, Jong Un", "Jong Un Kim");
    expect(score).toBeGreaterThanOrEqual(REVIEW_THRESHOLD);
  });

  it("a single-char typo still meets the REVIEW threshold", () => {
    const score = scoreName("Madhuro", "Maduro");
    expect(score).toBeGreaterThanOrEqual(REVIEW_THRESHOLD);
    expect(score).toBeLessThan(100);
  });

  it("a completely different name is CLEAR", () => {
    const score = scoreName("Alice Johnson", "Nicolas Maduro");
    expect(score).toBeLessThan(REVIEW_THRESHOLD);
    expect(verdictForScore(score)).toBe("CLEAR");
  });

  it("diacritics do not lower the score", () => {
    expect(scoreName("José Garcia", "Jose Garcia")).toBe(100);
  });
});

describe("verdictForScore thresholds", () => {
  it("MATCH at/above the match threshold", () => {
    expect(verdictForScore(MATCH_THRESHOLD)).toBe("MATCH");
    expect(verdictForScore(100)).toBe("MATCH");
  });

  it("REVIEW between thresholds", () => {
    expect(verdictForScore(REVIEW_THRESHOLD)).toBe("REVIEW");
    expect(verdictForScore(MATCH_THRESHOLD - 1)).toBe("REVIEW");
  });

  it("CLEAR below the review threshold", () => {
    expect(verdictForScore(REVIEW_THRESHOLD - 1)).toBe("CLEAR");
    expect(verdictForScore(0)).toBe("CLEAR");
  });
});
