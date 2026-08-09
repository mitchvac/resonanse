import { describe, expect, it } from "vitest";

import {
  computeDailyClaimState,
  deriveEarnedToday,
  deriveTotalEarned,
  formatCooldownRemaining,
  parseRepeatMeta,
  DAILY_CHECKIN_AMOUNT,
  DAILY_COOLDOWN_MS,
  EVENT_DAILY_CHECKIN,
  EVENT_IDENTITY_VAULT,
  VAULT_BONUS_AMOUNT,
  type EarnEventLike,
} from "./earn";

/**
 * Pure-math tests only — DB paths (awardDc / claimDaily / getEarnState) are
 * verified live against TiDB by the orchestrator.
 */
describe("spec constants", () => {
  it("matches the V70 spec values", () => {
    expect(DAILY_CHECKIN_AMOUNT).toBe(25);
    expect(VAULT_BONUS_AMOUNT).toBe(500);
    expect(DAILY_COOLDOWN_MS).toBe(20 * 60 * 60 * 1000);
    expect(EVENT_DAILY_CHECKIN).toBe("daily_checkin");
    expect(EVENT_IDENTITY_VAULT).toBe("identity_vault");
  });
});

describe("computeDailyClaimState", () => {
  const now = new Date("2025-06-01T12:00:00.000Z");

  it("is claimable when the user has never claimed", () => {
    const state = computeDailyClaimState(null, now);
    expect(state.canClaim).toBe(true);
    expect(state.lastClaimAt).toBeNull();
    expect(state.nextClaimAt).toBeNull();
  });

  it("is claimable exactly at the cooldown boundary", () => {
    const last = new Date(now.getTime() - DAILY_COOLDOWN_MS);
    const state = computeDailyClaimState(last, now);
    expect(state.canClaim).toBe(true);
    expect(state.lastClaimAt).toEqual(last);
    expect(state.nextClaimAt).toBeNull();
  });

  it("is claimable well after the cooldown", () => {
    const last = new Date(now.getTime() - DAILY_COOLDOWN_MS * 3);
    const state = computeDailyClaimState(last, now);
    expect(state.canClaim).toBe(true);
    expect(state.nextClaimAt).toBeNull();
  });

  it("is blocked one millisecond before the cooldown ends", () => {
    const last = new Date(now.getTime() - DAILY_COOLDOWN_MS + 1);
    const state = computeDailyClaimState(last, now);
    expect(state.canClaim).toBe(false);
    expect(state.nextClaimAt).toEqual(new Date(last.getTime() + DAILY_COOLDOWN_MS));
  });

  it("is blocked right after a claim and reports nextClaimAt = last + cooldown", () => {
    const last = new Date(now.getTime() - 60_000); // claimed a minute ago
    const state = computeDailyClaimState(last, now);
    expect(state.canClaim).toBe(false);
    expect(state.lastClaimAt).toEqual(last);
    expect(state.nextClaimAt).toEqual(
      new Date(last.getTime() + DAILY_COOLDOWN_MS),
    );
    // nextClaimAt is strictly in the future while blocked
    expect(state.nextClaimAt!.getTime()).toBeGreaterThan(now.getTime());
  });
});

describe("formatCooldownRemaining", () => {
  it("formats hours and minutes", () => {
    expect(formatCooldownRemaining(7 * 3_600_000 + 23 * 60_000)).toBe("7h 23m");
  });

  it("formats sub-hour remainders as minutes", () => {
    expect(formatCooldownRemaining(42 * 60_000)).toBe("42m");
  });

  it("rounds partial minutes up and never shows zero", () => {
    expect(formatCooldownRemaining(1)).toBe("1m");
    expect(formatCooldownRemaining(61_000)).toBe("2m");
    expect(formatCooldownRemaining(0)).toBe("1m");
  });

  it("keeps whole hours explicit", () => {
    expect(formatCooldownRemaining(3 * 3_600_000)).toBe("3h 0m");
  });
});

describe("parseRepeatMeta", () => {
  it("returns empty for non-objects and partial shapes", () => {
    expect(parseRepeatMeta(null)).toEqual({});
    expect(parseRepeatMeta("nope")).toEqual({});
    expect(parseRepeatMeta({ totalAmount: "25" })).toEqual({});
  });

  it("reads a well-formed meta", () => {
    expect(
      parseRepeatMeta({ totalAmount: 75, todayDate: "2025-06-01", todayAmount: 50 }),
    ).toEqual({ totalAmount: 75, todayDate: "2025-06-01", todayAmount: 50 });
  });
});

const dailyRow = (
  lastAwardedAt: Date,
  meta: unknown,
  createdAt = lastAwardedAt,
): EarnEventLike => ({
  eventType: EVENT_DAILY_CHECKIN,
  amount: DAILY_CHECKIN_AMOUNT, // latest grant only — totals live in meta
  lastAwardedAt,
  createdAt,
  meta,
});

const vaultRow = (createdAt: Date): EarnEventLike => ({
  eventType: EVENT_IDENTITY_VAULT,
  amount: VAULT_BONUS_AMOUNT,
  lastAwardedAt: createdAt,
  createdAt,
  meta: null,
});

describe("deriveTotalEarned", () => {
  it("is zero with no events", () => {
    expect(deriveTotalEarned([])).toBe(0);
  });

  it("sums one-time event amounts", () => {
    const d = new Date("2025-05-30T10:00:00.000Z");
    expect(deriveTotalEarned([vaultRow(d)])).toBe(VAULT_BONUS_AMOUNT);
  });

  it("uses the daily row's accumulated meta total, not the latest-grant amount", () => {
    const d = new Date("2025-06-01T08:00:00.000Z");
    const meta = { totalAmount: 175, todayDate: "2025-06-01", todayAmount: 25 };
    expect(deriveTotalEarned([dailyRow(d, meta)])).toBe(175);
  });

  it("combines repeatable and one-time events", () => {
    const d = new Date("2025-06-01T08:00:00.000Z");
    const meta = { totalAmount: 175, todayDate: "2025-06-01", todayAmount: 25 };
    expect(deriveTotalEarned([dailyRow(d, meta), vaultRow(d)])).toBe(175 + 500);
  });

  it("falls back to amount for legacy daily rows without meta totals", () => {
    const d = new Date("2025-06-01T08:00:00.000Z");
    expect(deriveTotalEarned([dailyRow(d, null)])).toBe(DAILY_CHECKIN_AMOUNT);
  });
});

describe("deriveEarnedToday", () => {
  const now = new Date("2025-06-01T12:00:00.000Z"); // UTC day 2025-06-01

  it("is zero with no events", () => {
    expect(deriveEarnedToday([], now)).toBe(0);
  });

  it("counts today's daily grants via meta.todayAmount (two claims in one UTC day)", () => {
    const d = new Date("2025-06-01T09:00:00.000Z");
    const meta = { totalAmount: 50, todayDate: "2025-06-01", todayAmount: 50 };
    expect(deriveEarnedToday([dailyRow(d, meta)], now)).toBe(50);
  });

  it("counts nothing when the daily row's todayDate is a different day", () => {
    const d = new Date("2025-05-31T09:00:00.000Z");
    const meta = { totalAmount: 200, todayDate: "2025-05-31", todayAmount: 25 };
    expect(deriveEarnedToday([dailyRow(d, meta)], now)).toBe(0);
  });

  it("counts a one-time event created today, not one created yesterday", () => {
    const today = new Date("2025-06-01T00:30:00.000Z");
    const yesterday = new Date("2025-05-31T23:30:00.000Z");
    expect(deriveEarnedToday([vaultRow(today)], now)).toBe(VAULT_BONUS_AMOUNT);
    expect(deriveEarnedToday([vaultRow(yesterday)], now)).toBe(0);
  });

  it("falls back to lastAwardedAt for legacy daily rows without day tracking", () => {
    const d = new Date("2025-06-01T06:00:00.000Z");
    expect(deriveEarnedToday([dailyRow(d, null)], now)).toBe(DAILY_CHECKIN_AMOUNT);
  });

  it("combines daily + one-time for the full day total", () => {
    const d = new Date("2025-06-01T09:00:00.000Z");
    const meta = { totalAmount: 25, todayDate: "2025-06-01", todayAmount: 25 };
    expect(deriveEarnedToday([dailyRow(d, meta), vaultRow(d)], now)).toBe(25 + 500);
  });
});
