import { jaroWinkler, normalizeName } from "../sanctions/matcher";
import type { VaultPayload } from "../identity/vaultCrypto";
import type { MrzFields } from "./mrzExtract";

/**
 * kyc/docVerify — pure cross-check of parsed MRZ fields against the member's
 * decrypted Identity Vault payload. No I/O.
 *
 * Verdict contract: mismatches contains field-name strings only
 * ("name" | "dob" | "expiry"); verdict is VERIFIED only when it is empty.
 */

export interface CrossCheckResult {
  verdict: "VERIFIED" | "MISMATCH";
  mismatches: string[];
}

/** Fuzzy-name acceptance threshold (Jaro-Winkler on normalized names). */
export const NAME_MATCH_THRESHOLD = 0.88;

/** Today as YYYY-MM-DD (UTC) for date-string comparison. */
function todayIso(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/**
 * Compare MRZ fields against the vault payload:
 * - legalName: fuzzy (Jaro-Winkler ≥ 0.88 after normalization), tried against
 *   BOTH orderings ("first last" and "last first") since MRZ name order and
 *   vault entry order may differ.
 * - dob: exact YYYY-MM-DD equality.
 * - expiry: the document must not be expired (expiryDate strictly > today).
 * - docType: advisory only in v1 — the result contract only allows
 *   name/dob/expiry mismatch codes, so a vault-vs-MRZ docType class
 *   difference (e.g. vault says passport, MRZ code "I") is deliberately NOT
 *   surfaced as a blocking mismatch (documented deviation).
 */
export function crossCheck(
  mrz: MrzFields,
  vault: VaultPayload,
): CrossCheckResult {
  const mismatches: string[] = [];

  const vaultName = normalizeName(vault.legalName);
  const firstLast = normalizeName(`${mrz.firstName} ${mrz.lastName}`);
  const lastFirst = normalizeName(`${mrz.lastName} ${mrz.firstName}`);
  const nameScore = Math.max(
    jaroWinkler(vaultName, firstLast),
    jaroWinkler(vaultName, lastFirst),
  );
  if (nameScore < NAME_MATCH_THRESHOLD) {
    mismatches.push("name");
  }

  if (mrz.birthDate !== vault.dob) {
    mismatches.push("dob");
  }

  if (mrz.expiryDate <= todayIso()) {
    mismatches.push("expiry");
  }

  return {
    verdict: mismatches.length === 0 ? "VERIFIED" : "MISMATCH",
    mismatches,
  };
}
