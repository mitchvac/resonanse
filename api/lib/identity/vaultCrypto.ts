import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { z } from "zod";
import { env } from "../env";

/**
 * vaultCrypto — Encrypted ID Vault (self-hosted KYC Phase 1)
 *
 * The customer's legal identity payload is sealed into a SINGLE AES-256-GCM
 * envelope ({ iv, tag, data } — base64 fields, JSON-encoded). The envelope is
 * what gets stored in identity_vault.payload; plaintext PII never touches the
 * database. The 256-bit key lives only in IDENTITY_VAULT_KEY (64 hex chars).
 *
 * SECURITY CONTRACT:
 * - Never log plaintext payloads or envelope contents.
 * - Decryption errors are deliberately vague (no PII, no oracle detail).
 */

const IV_BYTES = 12; // 96-bit nonce, the GCM standard
const AUTH_TAG_BYTES = 16;

const MIN_AGE_YEARS = 18;

/** Strict calendar-date check: YYYY-MM-DD that round-trips through UTC. */
function isRealDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

/** Whole years between a YYYY-MM-DD birth date and today (UTC). */
function ageOn(dob: string, today: Date): number {
  const [year, month, day] = dob.split("-").map(Number);
  let age = today.getUTCFullYear() - year;
  const beforeBirthday =
    today.getUTCMonth() + 1 < month ||
    (today.getUTCMonth() + 1 === month && today.getUTCDate() < day);
  if (beforeBirthday) age -= 1;
  return age;
}

/**
 * Field-level schemas for the vault payload. Exported so the router input and
 * the client form stay aligned with exactly what the vault accepts.
 */
export const VAULT_PAYLOAD_FIELDS = {
  legalName: z.string().trim().min(2).max(200),
  dob: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date of birth must be YYYY-MM-DD")
    .refine(isRealDate, "Date of birth is not a real calendar date")
    .refine(
      (value) => ageOn(value, new Date()) >= MIN_AGE_YEARS,
      "You must be at least 18 years old",
    ),
  addressLine1: z.string().trim().min(2).max(200),
  addressLine2: z.string().trim().max(200).optional(),
  city: z.string().trim().min(1).max(100),
  region: z.string().trim().min(1).max(100),
  postalCode: z.string().trim().min(1).max(20),
  /** 2-letter ISO 3166-1 alpha-2, uppercase (e.g. "GB", "DE"). */
  country: z
    .string()
    .regex(/^[A-Z]{2}$/, "Country must be a 2-letter uppercase ISO code"),
  taxId: z.string().trim().max(64).optional(),
  docType: z.enum(["passport", "drivers_license", "national_id"]).optional(),
  docNumber: z.string().trim().max(64).optional(),
} as const;

/** Canonical payload validator — also the tRPC input schema for upsert. */
export const vaultPayloadSchema = z.object(VAULT_PAYLOAD_FIELDS);

export type VaultPayload = z.infer<typeof vaultPayloadSchema>;

/** On-the-wire envelope shape (all fields base64). */
const envelopeSchema = z.object({
  iv: z.string().min(1),
  tag: z.string().min(1),
  data: z.string().min(1),
});

/** 256-bit key from IDENTITY_VAULT_KEY (hex). Validated on every use. */
function vaultKey(): Buffer {
  const hex = env.identityVaultKey;
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error(
      "IDENTITY_VAULT_KEY must be 64 hex characters (32 bytes) for AES-256-GCM",
    );
  }
  return Buffer.from(hex, "hex");
}

/**
 * Validate → JSON-stringify → AES-256-GCM encrypt. Returns the envelope as a
 * JSON string: {"iv","tag","data"} with base64 fields. Every call uses a fresh
 * random IV, so identical payloads produce different envelopes.
 */
export function encryptVaultPayload(plaintext: VaultPayload): string {
  const payload = vaultPayloadSchema.parse(plaintext);
  const key = vaultKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const data = Buffer.concat([
    cipher.update(JSON.stringify(payload), "utf8"),
    cipher.final(),
  ]);
  return JSON.stringify({
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    data: data.toString("base64"),
  });
}

/**
 * Decrypt an envelope produced by encryptVaultPayload and re-validate the
 * payload. Throws a clear, PII-free error on malformed envelopes, tampering
 * (auth-tag failure), or a wrong/changed key.
 */
export function decryptVaultPayload(envelope: string): VaultPayload {
  let parsed: unknown;
  try {
    parsed = JSON.parse(envelope);
  } catch {
    throw new Error("Vault record is not a recognizable encrypted envelope");
  }
  const shape = envelopeSchema.safeParse(parsed);
  if (!shape.success) {
    throw new Error("Vault record is not a recognizable encrypted envelope");
  }
  const iv = Buffer.from(shape.data.iv, "base64");
  const tag = Buffer.from(shape.data.tag, "base64");
  const data = Buffer.from(shape.data.data, "base64");
  if (iv.length !== IV_BYTES || tag.length !== AUTH_TAG_BYTES) {
    throw new Error("Vault record is not a recognizable encrypted envelope");
  }
  let plaintext: string;
  try {
    const decipher = createDecipheriv("aes-256-gcm", vaultKey(), iv);
    decipher.setAuthTag(tag);
    plaintext = Buffer.concat([decipher.update(data), decipher.final()]).toString(
      "utf8",
    );
  } catch {
    // GCM auth-tag failure (tampered data or wrong key) — no detail leaked.
    throw new Error(
      "Vault record failed its integrity check (tampered data or wrong key)",
    );
  }
  let decoded: unknown;
  try {
    decoded = JSON.parse(plaintext);
  } catch {
    throw new Error("Vault record decrypted to unreadable data");
  }
  return vaultPayloadSchema.parse(decoded);
}
