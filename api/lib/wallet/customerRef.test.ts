import { describe, expect, it } from "vitest";

process.env.CUSTOMER_REF_SECRET =
  process.env.CUSTOMER_REF_SECRET ??
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

const { computeCustomerRef, isValidCustomerRef } = await import("./customerRef");

describe("customerRef", () => {
  const ADDR_A = "rakRaXypM8HxgzA2SWAD6j8LxN4U5sq1P9";
  const ADDR_B = "rH9eQkvc43gC4pVrMUSbCnjypcxzVnirQK";

  it("is deterministic for the same user+wallet", () => {
    expect(computeCustomerRef(14240001, ADDR_A)).toBe(
      computeCustomerRef(14240001, ADDR_A),
    );
  });

  it("differs across users on the same address", () => {
    expect(computeCustomerRef(14240001, ADDR_A)).not.toBe(
      computeCustomerRef(14240002, ADDR_A),
    );
  });

  it("differs across addresses for the same user", () => {
    expect(computeCustomerRef(14240001, ADDR_A)).not.toBe(
      computeCustomerRef(14240001, ADDR_B),
    );
  });

  it("matches the RC-XXXX-XXXX-XXXX display format", () => {
    const ref = computeCustomerRef(14240001, ADDR_A);
    expect(ref).toMatch(/^RC-[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}$/);
    expect(isValidCustomerRef(ref)).toBe(true);
    expect(isValidCustomerRef("RC-OOOO-OOOO-OOOO")).toBe(false); // I O U excluded
    expect(isValidCustomerRef("hello")).toBe(false);
  });

  it("contains no PII and cannot embed email/name", () => {
    const ref = computeCustomerRef(14240001, ADDR_A);
    expect(ref).not.toContain("@");
    expect(ref.toLowerCase()).not.toContain("v58test");
    expect(ref.length).toBe(17); // RC- + 12 chars + 2 dashes
  });
});
