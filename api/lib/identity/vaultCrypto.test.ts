import { describe, expect, it } from "vitest";

// Set a fixed test key BEFORE importing vaultCrypto — the env module reads
// process.env at import time (mirrors api/lib/wallet/customerRef.test.ts).
process.env.IDENTITY_VAULT_KEY =
  process.env.IDENTITY_VAULT_KEY ??
  "00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff";

const { encryptVaultPayload, decryptVaultPayload, vaultPayloadSchema } =
  await import("./vaultCrypto");

const VALID_PAYLOAD = {
  legalName: "Ada Lovelace",
  dob: "1990-05-15",
  addressLine1: "12 Analytical Way",
  addressLine2: "Flat 4",
  city: "London",
  region: "Greater London",
  postalCode: "N1 9GU",
  country: "GB",
  taxId: "QQ123456C",
  docType: "passport",
  docNumber: "123456789",
} as const;

function dobYearsAgo(years: number): string {
  const d = new Date();
  d.setUTCFullYear(d.getUTCFullYear() - years);
  return d.toISOString().slice(0, 10);
}

describe("vaultCrypto", () => {
  it("round-trips encrypt → decrypt to the exact payload", () => {
    const envelope = encryptVaultPayload({ ...VALID_PAYLOAD });
    const decrypted = decryptVaultPayload(envelope);
    expect(decrypted).toEqual(VALID_PAYLOAD);
  });

  it("produces different envelopes for the same payload (random IV)", () => {
    const a = encryptVaultPayload({ ...VALID_PAYLOAD });
    const b = encryptVaultPayload({ ...VALID_PAYLOAD });
    expect(a).not.toBe(b);
    expect(decryptVaultPayload(a)).toEqual(decryptVaultPayload(b));
  });

  it("throws on a tampered ciphertext (GCM auth-tag failure)", () => {
    const envelope = JSON.parse(encryptVaultPayload({ ...VALID_PAYLOAD })) as {
      iv: string;
      tag: string;
      data: string;
    };
    const raw = Buffer.from(envelope.data, "base64");
    raw[0] = raw[0] ^ 0xff; // flip one byte of ciphertext
    envelope.data = raw.toString("base64");
    expect(() => decryptVaultPayload(JSON.stringify(envelope))).toThrow(
      /integrity check/,
    );
  });

  it("throws on truncated or garbage envelopes", () => {
    expect(() => decryptVaultPayload("not json at all")).toThrow();
    expect(() => decryptVaultPayload('{"iv":"abc"}')).toThrow();
    expect(() =>
      decryptVaultPayload('{"iv":"aXY=","tag":"","data":""}'),
    ).toThrow();
    const envelope = encryptVaultPayload({ ...VALID_PAYLOAD });
    expect(() => decryptVaultPayload(envelope.slice(0, 12))).toThrow();
  });

  it("rejects an under-18 date of birth", () => {
    expect(() =>
      encryptVaultPayload({ ...VALID_PAYLOAD, dob: dobYearsAgo(17) }),
    ).toThrow(/18/);
    // Boundary: exactly 18 today is allowed.
    expect(() =>
      encryptVaultPayload({ ...VALID_PAYLOAD, dob: dobYearsAgo(18) }),
    ).not.toThrow();
  });

  it("rejects impossible dates and bad country codes", () => {
    expect(() =>
      vaultPayloadSchema.parse({ ...VALID_PAYLOAD, dob: "1990-02-30" }),
    ).toThrow();
    expect(() =>
      vaultPayloadSchema.parse({ ...VALID_PAYLOAD, country: "gb" }),
    ).toThrow();
    expect(() =>
      vaultPayloadSchema.parse({ ...VALID_PAYLOAD, country: "GBR" }),
    ).toThrow();
  });

  it("rejects a missing or too-short legal name", () => {
    const { legalName: _omitted, ...withoutName } = VALID_PAYLOAD;
    expect(() => vaultPayloadSchema.parse(withoutName)).toThrow();
    expect(() =>
      vaultPayloadSchema.parse({ ...VALID_PAYLOAD, legalName: "A" }),
    ).toThrow();
  });

  it("stores only the envelope — no plaintext PII in the output", () => {
    const envelope = encryptVaultPayload({ ...VALID_PAYLOAD });
    expect(envelope).not.toContain("Ada");
    expect(envelope).not.toContain("Lovelace");
    expect(envelope).not.toContain("QQ123456C");
    const parsed = JSON.parse(envelope) as Record<string, string>;
    expect(Object.keys(parsed).sort()).toEqual(["data", "iv", "tag"]);
  });
});
