import { describe, expect, it } from "vitest";
import { extractMrzLines, parseMrz, type MrzFields } from "./mrzExtract";
import { crossCheck } from "./docVerify";
import type { VaultPayload } from "../identity/vaultCrypto";

/**
 * Pure KYC unit tests — no OCR, no DB, no network.
 *
 * MRZ specimens are constructed with REAL ICAO 9303 check digits (7-3-1
 * weighting, same algorithm the `mrz` parser validates against), so the
 * parser must accept them as fully valid.
 */

const CHECK_WEIGHTS = [7, 3, 1] as const;

/** ICAO 9303 check digit: cyclic 7-3-1 weights, '<' = 0, A–Z = 10–35. */
function checkDigit(input: string): string {
  let sum = 0;
  for (let i = 0; i < input.length; i++) {
    const code = input.charCodeAt(i);
    let value: number;
    if (code === 60) value = 0; // "<"
    else if (code >= 65) value = code - 55; // A–Z
    else value = code - 48; // 0–9
    sum += value * CHECK_WEIGHTS[i % 3];
  }
  return String(sum % 10);
}

interface Td3Options {
  lastName?: string;
  firstName?: string;
  docNumber?: string;
  nationality?: string;
  birth?: string; // YYMMDD
  sex?: string;
  expiry?: string; // YYMMDD
  personal?: string;
}

/** Build a spec-valid 2×44 TD3 passport MRZ with correct check digits. */
function buildTd3(options: Td3Options = {}): [string, string] {
  const {
    lastName = "DOE",
    firstName = "JANE MARY",
    docNumber = "123456789",
    nationality = "GBR",
    birth = "900101",
    sex = "F",
    expiry = "301231",
    personal = "",
  } = options;
  const nameField = `${lastName.replace(/ /g, "<")}<<${firstName.replace(/ /g, "<")}`;
  const line1 = `P<GBR${nameField}`.padEnd(44, "<");
  const docNumberField = `${docNumber}${checkDigit(docNumber)}`.padEnd(10, "<");
  const birthField = `${birth}${checkDigit(birth)}`;
  const expiryField = `${expiry}${checkDigit(expiry)}`;
  const personalField = personal.padEnd(14, "<");
  const personalCheck = personal ? checkDigit(personalField) : "0";
  const body =
    docNumberField +
    nationality +
    birthField +
    sex +
    expiryField +
    personalField +
    personalCheck;
  const composite = checkDigit(
    body.slice(0, 10) + body.slice(13, 20) + body.slice(21, 43),
  );
  return [line1, body + composite];
}

/** Build a spec-valid 3×30 TD1 identity-card MRZ with correct check digits. */
function buildTd1(): [string, string, string] {
  const docNumber = "D23145890";
  const line1 = `I<GBR${docNumber}${checkDigit(docNumber)}1233`.padEnd(30, "<");
  const birth = "740812";
  const expiry = "301231";
  const line2Body = `${birth}${checkDigit(birth)}F${expiry}${checkDigit(expiry)}GBR`;
  const line2 = line2Body.padEnd(29, "<");
  const line3 = "ERIKSSON<<ANNA<MARIA".padEnd(30, "<");
  const compositeSource =
    line1.slice(5, 30) + line2.slice(0, 7) + line2.slice(8, 15) + line2.slice(18, 29);
  const line2Final = line2 + checkDigit(compositeSource);
  return [line1, line2Final, line3];
}

const VALID_TD3 = buildTd3();

const vaultFixture: VaultPayload = {
  legalName: "Jane Mary Doe",
  dob: "1990-01-01",
  addressLine1: "1 Test Street",
  city: "Testville",
  region: "Testshire",
  postalCode: "TE5 7AA",
  country: "GB",
};

function mrzFieldsFixture(overrides: Partial<MrzFields> = {}): MrzFields {
  return {
    docType: "P",
    lastName: "DOE",
    firstName: "JANE MARY",
    docNumber: "123456789",
    birthDate: "1990-01-01",
    expiryDate: "2030-12-31",
    nationality: "GBR",
    sex: "female",
    allChecksValid: true,
    format: "TD3",
    ...overrides,
  };
}

describe("extractMrzLines", () => {
  it("finds a TD3 block in noisy OCR output", () => {
    const noisy = [
      "PASSPORT  United Kingdom of Great Britain",
      VALID_TD3[0],
      VALID_TD3[1],
      "some trailing page noise 123 !!!",
    ].join("\n");
    expect(extractMrzLines(noisy)).toEqual(VALID_TD3);
  });

  it("tolerates OCR-inserted spaces inside MRZ lines", () => {
    const withSpaces = (line: string) => line.replace(/(.{6})/g, "$1 ").trim();
    const spaced = VALID_TD3.map(withSpaces).join("\n");
    expect(extractMrzLines(spaced)).toEqual(VALID_TD3);
  });

  it("finds a TD1 (3×30) identity-card block", () => {
    const td1 = buildTd1();
    const noisy = `CARDHOLDER\n${td1.join("\n")}\nVALID THROUGH`;
    expect(extractMrzLines(noisy)).toEqual(td1);
  });

  it("skips junk lines of MRZ-like length without filler density", () => {
    const junk = "ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890ABCDEFGH"; // 44 chars, no "<"
    const noisy = `${junk}\n${VALID_TD3[0]}\n${VALID_TD3[1]}`;
    expect(extractMrzLines(noisy)).toEqual(VALID_TD3);
  });

  it("returns [] when no MRZ block is present", () => {
    expect(extractMrzLines("hello world\nno document here\n123")).toEqual([]);
  });
});

describe("parseMrz", () => {
  it("parses a valid TD3 specimen with all check digits valid", () => {
    const result = parseMrz(VALID_TD3);
    if (!result.ok) throw new Error(`expected ok, got ${result.reason}`);
    expect(result.fields).toMatchObject({
      docType: "P",
      lastName: "DOE",
      firstName: "JANE MARY",
      docNumber: "123456789",
      birthDate: "1990-01-01",
      expiryDate: "2030-12-31",
      nationality: "GBR",
      sex: "female",
      format: "TD3",
    });
    expect(result.fields.allChecksValid).toBe(true);
  });

  it("flags a corrupted check digit instead of throwing", () => {
    const corrupted: [string, string] = [
      VALID_TD3[0],
      // birthDate check digit: position 19 (after 10-char doc field + GBR + 6 digits)
      VALID_TD3[1].slice(0, 19) +
        (VALID_TD3[1][19] === "0" ? "1" : "0") +
        VALID_TD3[1].slice(20),
    ];
    const result = parseMrz(corrupted);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.fields.allChecksValid).toBe(false);
  });

  it("expands 2-digit birth years with the past pivot", () => {
    // yy (90) > current 2-digit year → 19xx; yy (01) ≤ current → 20xx
    const old = parseMrz(buildTd3({ birth: "900101" }));
    if (old.ok) expect(old.fields.birthDate).toBe("1990-01-01");
    expect(old.ok).toBe(true);
    const young = parseMrz(buildTd3({ birth: "010101" }));
    if (young.ok) expect(young.fields.birthDate).toBe("2001-01-01");
    expect(young.ok).toBe(true);
  });

  it("expands 2-digit expiry years with the future pivot", () => {
    const result = parseMrz(buildTd3({ expiry: "290630" }));
    if (result.ok) expect(result.fields.expiryDate).toBe("2029-06-30");
    expect(result.ok).toBe(true);
    // 99 would land >50 years in the future as 2099 → pivots to 1999
    const wrapped = parseMrz(buildTd3({ expiry: "990101" }));
    if (wrapped.ok) expect(wrapped.fields.expiryDate).toBe("1999-01-01");
    expect(wrapped.ok).toBe(true);
  });

  it("rejects garbage input with a reason", () => {
    const result = parseMrz(["P<GBRDOE<<JANE", "too-short"]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason.length).toBeGreaterThan(0);
  });

  it("rejects the wrong number of lines", () => {
    expect(parseMrz([VALID_TD3[0]]).ok).toBe(false);
  });
});

describe("crossCheck", () => {
  it("VERIFIED on an exact match", () => {
    const result = crossCheck(mrzFieldsFixture(), vaultFixture);
    expect(result).toEqual({ verdict: "VERIFIED", mismatches: [] });
  });

  it("VERIFIED when the vault name is in the opposite order", () => {
    const result = crossCheck(mrzFieldsFixture(), {
      ...vaultFixture,
      legalName: "Doe Jane Mary",
    });
    expect(result.verdict).toBe("VERIFIED");
  });

  it("VERIFIED on a small fuzzy name variation (≥0.88)", () => {
    const result = crossCheck(mrzFieldsFixture(), {
      ...vaultFixture,
      legalName: "Jayne Mary Doe",
    });
    expect(result.verdict).toBe("VERIFIED");
  });

  it("MISMATCH on a different name", () => {
    const result = crossCheck(mrzFieldsFixture(), {
      ...vaultFixture,
      legalName: "Alice Brown",
    });
    expect(result.verdict).toBe("MISMATCH");
    expect(result.mismatches).toEqual(["name"]);
  });

  it("MISMATCH on a different date of birth", () => {
    const result = crossCheck(
      mrzFieldsFixture({ birthDate: "1991-02-02" }),
      vaultFixture,
    );
    expect(result).toEqual({ verdict: "MISMATCH", mismatches: ["dob"] });
  });

  it("MISMATCH on an expired document", () => {
    const result = crossCheck(
      mrzFieldsFixture({ expiryDate: "2020-01-01" }),
      vaultFixture,
    );
    expect(result).toEqual({ verdict: "MISMATCH", mismatches: ["expiry"] });
  });

  it("reports multiple mismatches together", () => {
    const result = crossCheck(
      mrzFieldsFixture({ birthDate: "1985-05-05", expiryDate: "2019-01-01" }),
      { ...vaultFixture, legalName: "Alice Brown" },
    );
    expect(result.verdict).toBe("MISMATCH");
    expect(result.mismatches).toEqual(["name", "dob", "expiry"]);
  });
});
