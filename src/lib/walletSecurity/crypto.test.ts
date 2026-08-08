import { describe, expect, it } from "vitest";
import {
  decryptSeed,
  encryptSeed,
  generateXrplWallet,
  fromBase64,
  toBase64,
  passwordStrength,
  WalletSecurityError,
  KDF_LABEL,
} from "./crypto";

describe("walletSecurity crypto round-trip", () => {
  it("seals and opens a real XRPL seed", async () => {
    const w = await generateXrplWallet();
    expect(w.address).toMatch(/^r[1-9A-HJ-NP-Za-km-z]{25,34}$/);
    expect(w.seed.length).toBeGreaterThan(10);
    const sealed = await encryptSeed("correct horse battery staple", w.seed);
    expect(sealed.ciphertextB64).not.toContain(w.seed);
    expect(fromBase64(sealed.saltB64).length).toBe(16);
    expect(fromBase64(sealed.ivB64).length).toBe(12);
    const opened = await decryptSeed("correct horse battery staple", sealed);
    expect(opened).toBe(w.seed);
    expect(KDF_LABEL).toBe("PBKDF2-250000");
  }, 30000);

  it("rejects a wrong password with WRONG_PASSWORD", async () => {
    const sealed = await encryptSeed("right-password-123", "sEdSomeFakeSeedValue1234567890");
    await expect(decryptSeed("wrong-password-123", sealed)).rejects.toMatchObject({
      code: "WRONG_PASSWORD",
    });
    await expect(decryptSeed("wrong-password-123", sealed)).rejects.toBeInstanceOf(
      WalletSecurityError,
    );
  }, 30000);

  it("base64 round-trips", () => {
    const bytes = new Uint8Array(256).map((_, i) => i);
    expect([...fromBase64(toBase64(bytes))]).toEqual([...bytes]);
  });

  it("scores password strength", () => {
    expect(passwordStrength("").score).toBe(0);
    expect(passwordStrength("short").score).toBeLessThan(2);
    expect(passwordStrength("abcdefghijkl").score).toBeGreaterThanOrEqual(2);
    expect(passwordStrength("Abcdefgh1jkl!XYZ").score).toBe(4);
  });
});
