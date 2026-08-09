import { parse as parseMrzLines } from "mrz";

/**
 * kyc/mrzExtract — pure MRZ extraction + parsing (no I/O, no DB, no OCR).
 *
 * Two stages:
 *  1. extractMrzLines: fish the MRZ block out of noisy full-page OCR text.
 *  2. parseMrz: run the cheminfo `mrz` parser, read its check-digit flags and
 *     normalize everything into one stable shape for the cross-check.
 */

/** Normalized, cross-check-ready MRZ fields. Dates are YYYY-MM-DD. */
export interface MrzFields {
  /** Raw MRZ document code, e.g. "P" (passport), "I"/"A"/"C" (ID cards). */
  docType: string;
  lastName: string;
  firstName: string;
  docNumber: string;
  /** YYYY-MM-DD (2-digit MRZ year expanded with a birth-date pivot). */
  birthDate: string;
  /** YYYY-MM-DD (2-digit MRZ year expanded with an expiry-date pivot). */
  expiryDate: string;
  /** 3-letter ICAO state code, or "" when unreadable/unknown. */
  nationality: string;
  /** "male" | "female" | "nonspecified" | "" */
  sex: string;
  /** True only when every check digit (incl. composite) validated. */
  allChecksValid: boolean;
  /** MRZ format reported by the parser: "TD1" | "TD2" | "TD3" | ... */
  format: string;
}

export type MrzParseResult =
  | { ok: true; fields: MrzFields }
  | { ok: false; reason: string };

/** MRZ lines are 28–44 chars of A–Z, 0–9 and the "<" filler. */
const CANDIDATE_RE = /^[A-Z0-9<]{28,44}$/;

/**
 * A real MRZ block always carries filler characters somewhere (the name line
 * of a TD3 is mostly "<"), so a window below this density is OCR noise.
 */
const MIN_FILLER_DENSITY = 0.08;

/** Characters that legitimately start an MRZ document line (ICAO 9303 doc
 * codes: P=passport, I/A/C=ID cards, V=visa). */
const DOC_CODE_RE = /^[PIACV]/;

/** Known (linesPerBlock × lineLength) layouts we verify. */
const BLOCK_LAYOUTS: ReadonlyArray<{ lines: number; length: number }> = [
  { lines: 2, length: 44 }, // TD3 passport
  { lines: 3, length: 30 }, // TD1 identity card
  { lines: 2, length: 36 }, // TD2 ID card / French national ID
];

function fillerDensity(lines: readonly string[]): number {
  const total = lines.reduce((sum, line) => sum + line.length, 0);
  const fillers = lines.reduce(
    (sum, line) => sum + (line.match(/</g)?.length ?? 0),
    0,
  );
  return total === 0 ? 0 : fillers / total;
}

/**
 * Find the best MRZ block in noisy OCR output. Whitespace inside lines is
 * stripped first (OCR commonly inserts spaces between glyph groups).
 * Returns the stripped lines of the best block, or [] when none is found.
 */
export function extractMrzLines(ocrText: string): string[] {
  const candidates = ocrText
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, ""))
    .filter((line) => CANDIDATE_RE.test(line));

  let best: { lines: string[]; score: number } | null = null;
  for (let start = 0; start < candidates.length; start++) {
    for (const layout of BLOCK_LAYOUTS) {
      if (start + layout.lines > candidates.length) continue;
      const window = candidates.slice(start, start + layout.lines);
      if (!window.every((line) => line.length === layout.length)) continue;
      if (!DOC_CODE_RE.test(window[0])) continue;
      const density = fillerDensity(window);
      if (density < MIN_FILLER_DENSITY) continue;
      if (!best || density > best.score) {
        best = { lines: window, score: density };
      }
    }
  }
  return best?.lines ?? [];
}

/**
 * Expand an MRZ YYMMDD date to YYYY-MM-DD.
 * - birth dates ("past"):   yy ≤ current 2-digit year → 20xx, else 19xx
 * - expiry dates ("future"): 20xx unless that lands >50 years ahead → 19xx
 * Returns null for partial dates (filler "<" digits) or impossible dates.
 */
function normalizeMrzDate(
  value: string,
  kind: "past" | "future",
  now: Date = new Date(),
): string | null {
  if (!/^\d{6}$/.test(value)) return null;
  const yy = Number(value.slice(0, 2));
  const month = Number(value.slice(2, 4));
  const day = Number(value.slice(4, 6));
  const currentYear = now.getUTCFullYear();
  const currentYy = currentYear % 100;
  let year: number;
  if (kind === "past") {
    year = yy <= currentYy ? 2000 + yy : 1900 + yy;
  } else {
    year = 2000 + yy;
    if (year > currentYear + 50) year -= 100;
  }
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${year}-${pad(month)}-${pad(day)}`;
}

/**
 * Parse extracted MRZ lines via the cheminfo `mrz` library. Never throws —
 * failures come back as { ok: false, reason }. Check-digit failures do NOT
 * fail the parse: they surface as fields.allChecksValid=false so the caller
 * can report a document-integrity mismatch instead of "unreadable".
 */
export function parseMrz(lines: string[]): MrzParseResult {
  if (lines.length < 2 || lines.length > 3) {
    return { ok: false, reason: "Expected a 2- or 3-line MRZ block" };
  }
  let result;
  try {
    result = parseMrzLines(lines);
  } catch (error) {
    return {
      ok: false,
      reason:
        error instanceof Error ? error.message : "Unrecognized MRZ format",
    };
  }
  const f = result.fields;

  const missing: string[] = [];
  if (!f.lastName) missing.push("surname");
  if (!f.firstName) missing.push("given names");
  if (!f.documentNumber) missing.push("document number");
  if (!f.birthDate) missing.push("birth date");
  if (!f.expirationDate) missing.push("expiry date");
  if (missing.length > 0) {
    return { ok: false, reason: `MRZ fields unreadable: ${missing.join(", ")}` };
  }

  const birthDate = normalizeMrzDate(f.birthDate as string, "past");
  const expiryDate = normalizeMrzDate(f.expirationDate as string, "future");
  if (!birthDate || !expiryDate) {
    return { ok: false, reason: "MRZ date fields unreadable" };
  }

  // Every per-field check digit plus the composite check digit must pass.
  const allChecksValid = result.details
    .filter(
      (d) =>
        d.field !== null &&
        (d.field.endsWith("CheckDigit") || d.field === "compositeCheckDigit"),
    )
    .every((d) => d.valid);

  return {
    ok: true,
    fields: {
      docType: f.documentCode ?? "",
      lastName: f.lastName as string,
      firstName: f.firstName as string,
      docNumber: f.documentNumber as string,
      birthDate,
      expiryDate,
      nationality: f.nationality ?? "",
      sex: f.sex ?? "",
      allChecksValid,
      format: result.format,
    },
  };
}
