import { describe, expect, it } from "vitest";
import {
  CLAIM_WINDOW_DAYS,
  formatUsdMicro,
  getOrCreateReferralCode,
  parseReferralCode,
  QUALIFY_DAYS,
  REFERRAL_BOUNTY_USD_MICRO,
} from "./codes";

describe("referral code derivation", () => {
  it("is stable for the same user", () => {
    expect(getOrCreateReferralCode(42)).toBe(getOrCreateReferralCode(42));
  });

  it("matches the RS-XXXXXX-YYYY format", () => {
    expect(getOrCreateReferralCode(42)).toMatch(
      /^RS-[0-9A-Z]{6}-[0-9A-Z]{4}$/,
    );
  });

  it("differs between users", () => {
    expect(getOrCreateReferralCode(1)).not.toBe(getOrCreateReferralCode(2));
  });

  it("round-trips the user id", () => {
    for (const id of [1, 42, 999, 123456, 987654321]) {
      expect(parseReferralCode(getOrCreateReferralCode(id))).toBe(id);
    }
  });

  it("rejects a tampered checksum", () => {
    const code = getOrCreateReferralCode(42);
    const last = code.at(-1)!;
    const replacement = last === "0" ? "1" : "0";
    expect(parseReferralCode(code.slice(0, -1) + replacement)).toBeNull();
  });

  it("rejects a tampered body", () => {
    const code = getOrCreateReferralCode(42);
    // Flip one body character — the checksum no longer binds.
    const tampered = `${code.slice(0, 3)}${code[3] === "A" ? "B" : "A"}${code.slice(4)}`;
    expect(parseReferralCode(tampered)).toBeNull();
  });

  it("normalizes case, dashes and spaces", () => {
    const code = getOrCreateReferralCode(42);
    const compact = code.replace(/-/g, "");
    expect(parseReferralCode(code.toLowerCase())).toBe(42);
    expect(parseReferralCode(compact)).toBe(42);
    expect(parseReferralCode(`  ${code}  `)).toBe(42);
    expect(parseReferralCode(compact.toLowerCase())).toBe(42);
  });

  it("rejects malformed input", () => {
    expect(parseReferralCode("")).toBeNull();
    expect(parseReferralCode("hello")).toBeNull();
    expect(parseReferralCode("XX-0000AB-3F7K")).toBeNull();
    expect(parseReferralCode("RS-")).toBeNull();
  });
});

describe("formatUsdMicro", () => {
  it("formats the bounty constant as $7.00", () => {
    expect(formatUsdMicro(REFERRAL_BOUNTY_USD_MICRO)).toBe("$7.00");
    expect(REFERRAL_BOUNTY_USD_MICRO).toBe(7_000_000);
  });

  it("formats edge cases", () => {
    expect(formatUsdMicro(0)).toBe("$0.00");
    expect(formatUsdMicro(500_000)).toBe("$0.50");
    expect(formatUsdMicro(1)).toBe("$0.00");
    expect(formatUsdMicro(123_456_789)).toBe("$123.46");
  });
});

describe("bounty constants", () => {
  it("claims within 7 days, vests after 30", () => {
    expect(CLAIM_WINDOW_DAYS).toBe(7);
    expect(QUALIFY_DAYS).toBe(30);
  });
});
