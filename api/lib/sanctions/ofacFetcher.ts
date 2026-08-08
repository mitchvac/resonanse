/**
 * sanctions/ofacFetcher — downloads and caches OFAC watchlist entries.
 *
 * Failure-isolated by contract: ANY network/HTTP/parse failure logs a warning
 * and falls back to the bundled seed list. The fetch path NEVER throws, so
 * screening can always proceed (degraded rather than down).
 *
 * Watchlist names are PUBLIC US government data — plaintext is fine here.
 * (Customer PII never touches this module; see screener.ts.)
 */

import type { InsertSanctionsEntry } from "@db/schema";
import { sanctionsEntries } from "@db/schema";
import { getDb } from "../../queries/connection";

const SDN_CSV_URL = "https://www.treasury.gov/ofac/downloads/sdn.csv";
const CONS_CSV_URL =
  "https://www.treasury.gov/ofac/downloads/consolidated/cons_prim.csv";
const FETCH_TIMEOUT_MS = 10_000;
const INSERT_CHUNK_SIZE = 500;

/* ------------------------------------------------------------------------ */
/* CSV parsing (no dependencies — the OFAC files use simple quoted CSV).     */
/* ------------------------------------------------------------------------ */

/** Minimal RFC-4180-ish CSV parser: handles quoted fields, embedded commas,
 * escaped quotes ("") and newlines inside quotes. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/** Pull "a.k.a." alternate names out of an OFAC remarks field. */
function extractAltNames(remarks: string): string[] | null {
  const alts = new Set<string>();
  // Quoted form: a.k.a. 'FOO BAR'
  const quoted = /a\.k\.a\.\s+'([^']+)'/gi;
  let m: RegExpExecArray | null;
  while ((m = quoted.exec(remarks)) !== null) {
    alts.add(m[1].trim());
  }
  // Unquoted form: a.k.a. FOO BAR; a.k.a. BAZ
  const unquoted = /a\.k\.a\.\s+([^';.]{2,80})[;.]/gi;
  while ((m = unquoted.exec(remarks)) !== null) {
    const candidate = m[1].trim();
    if (candidate.length > 1 && !candidate.startsWith("'")) alts.add(candidate);
  }
  const list = [...alts].filter((a) => a.length > 0 && a.length <= 255);
  return list.length > 0 ? list : null;
}

/**
 * sdn.csv / cons_prim.csv column layout (no header row):
 *   0 ent_num, 1 name, 2 type, 3 program, … , last remarks.
 * Column 2 (index 1) is the primary name.
 */
function parseOfacCsv(
  text: string,
  source: InsertSanctionsEntry["source"],
): InsertSanctionsEntry[] {
  const entries: InsertSanctionsEntry[] = [];
  for (const cols of parseCsv(text)) {
    const name = cols[1]?.trim();
    if (!name) continue;
    const program = cols[3]?.trim() || null;
    const remarks = cols[cols.length - 1] ?? "";
    entries.push({
      source,
      primaryName: name.slice(0, 255),
      altNames: extractAltNames(remarks),
      program: program ? program.slice(0, 128) : null,
      listUpdatedAt: null,
    });
  }
  return entries;
}

/* ------------------------------------------------------------------------ */
/* Live fetch (failure-isolated).                                            */
/* ------------------------------------------------------------------------ */

async function downloadCsv(url: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "user-agent": "selfhosted-kyc-sanctions/1.0" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

/** Returns live entries, or null on ANY failure (caller falls back to seed). */
async function fetchLiveEntries(): Promise<InsertSanctionsEntry[] | null> {
  try {
    const [sdnText, consText] = await Promise.all([
      downloadCsv(SDN_CSV_URL),
      downloadCsv(CONS_CSV_URL),
    ]);
    const sdn = parseOfacCsv(sdnText, "OFAC_SDN");
    const cons = parseOfacCsv(consText, "OFAC_CONS");
    if (sdn.length === 0 && cons.length === 0) {
      throw new Error("OFAC CSVs parsed to zero entries");
    }
    return [...sdn, ...cons];
  } catch (err) {
    console.warn(
      "[sanctions] live OFAC fetch failed; falling back to bundled seed list:",
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}

/**
 * Fetch the OFAC SDN + consolidated lists. Never throws — on any
 * network/HTTP/parse failure, returns the bundled seed list instead.
 */
export async function fetchOfacSdn(): Promise<InsertSanctionsEntry[]> {
  const live = await fetchLiveEntries();
  return live ?? seedEntries();
}

/* ------------------------------------------------------------------------ */
/* Bundled seed list — ~15 well-known PUBLIC OFAC SDN entries so dev/offline */
/* environments can screen deterministically.                                 */
/* ------------------------------------------------------------------------ */

export function seedEntries(): InsertSanctionsEntry[] {
  const seed = (
    primaryName: string,
    program: string,
    altNames: string[] | null = null,
  ): InsertSanctionsEntry => ({
    source: "OFAC_SDN",
    primaryName,
    altNames,
    program,
    listUpdatedAt: null,
  });

  return [
    seed("KIM, Jong Un", "DPRK", ["KIM, Cho'ng-u'n", "KIM, Jong-un"]),
    seed("KIM, Yo Jong", "DPRK2", ["KIM, Yo'-cho'ng"]),
    seed("MADURO MOROS, Nicolas", "VENEZUELA", ["MADURO, Nicolas"]),
    seed("PUTIN, Vladimir Vladimirovich", "RUSSIA-EO14024", [
      "PUTIN, Vladimir",
    ]),
    seed("PRIGOZHIN, Yevgeniy Viktorovich", "RUSSIA-EO14024", [
      "PRIGOZHIN, Yevgeniy",
    ]),
    seed("GUZMAN LOERA, Joaquin", "SDNTK", [
      "GUZMAN LOERA, Chapo",
      "El Chapo",
      "GUZMAN, Joaquin",
    ]),
    seed("ZETAS", "TCO", ["LOS ZETAS", "CARTEL DEL GOLFO ZETAS"]),
    seed("LA NUEVA FAMILIA MICHOACANA", "TCO", ["LNFM"]),
    seed("CARTEL DE JALISCO NUEVA GENERACION", "TCO", [
      "CJNG",
      "JALISCO NEW GENERATION CARTEL",
    ]),
    seed("SINALOA CARTEL", "TCO", ["CARTEL DE SINALOA"]),
    seed("LAZARUS GROUP", "DPRK", ["LAZARUS", "APT38"]),
    seed("GARANTEX EUROPE OU", "RUSSIA-EO14024", ["GARANTEX"]),
    seed("ISLAMIC REVOLUTIONARY GUARD CORPS", "IRGC", [
      "IRGC",
      "SEPAH",
      "PASDARAN",
    ]),
    seed("HAMAS", "SDGT", ["ISLAMIC RESISTANCE MOVEMENT"]),
    seed("HIZBALLAH", "SDGT", ["HEZBOLLAH", "PARTY OF GOD"]),
  ];
}

/* ------------------------------------------------------------------------ */
/* Refresh: replace the cached table with the latest (live or seed) entries. */
/* ------------------------------------------------------------------------ */

export async function refreshEntries(): Promise<{
  count: number;
  source: "live" | "seed";
}> {
  const live = await fetchLiveEntries();
  const entries = live ?? seedEntries();
  const source: "live" | "seed" = live ? "live" : "seed";

  const db = getDb();
  // Simple transaction-free swap: clear, then chunked inserts.
  await db.delete(sanctionsEntries);
  for (let i = 0; i < entries.length; i += INSERT_CHUNK_SIZE) {
    await db.insert(sanctionsEntries).values(entries.slice(i, i + INSERT_CHUNK_SIZE));
  }

  return { count: entries.length, source };
}
