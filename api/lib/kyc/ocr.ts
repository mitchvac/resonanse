import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createWorker, OEM } from "tesseract.js";

/**
 * kyc/ocr — tesseract.js wrapper for document images.
 *
 * The image Buffer is processed in memory only: tesseract.js decodes it in
 * the WASM worker and nothing is written to disk or the database by this
 * module (cacheMethod "none" also disables the traineddata file cache — the
 * vendored tessdata is read straight from the repo).
 */

const TRAINEDDATA_FILE = "eng.traineddata.gz";

/**
 * Locate the directory holding the vendored tessdata
 * (api/assets/tessdata/eng.traineddata.gz — tessdata_fast 4.0.0).
 *
 * The server ships as a single bundled dist/boot.js, so neither __dirname nor
 * import.meta.url reliably points into the source tree; the deploy layout
 * (dist/boot.js + repo root as process.cwd()) is covered by the cwd entry
 * first. First directory containing eng.traineddata.gz wins. Throws a clear
 * error when the data is missing everywhere.
 */
export function resolveTessdataDir(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.join(process.cwd(), "api", "assets", "tessdata"),
    path.join(here, "..", "..", "assets", "tessdata"),
    path.join(here, "..", "assets", "tessdata"),
  ];
  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, TRAINEDDATA_FILE))) {
      return dir;
    }
  }
  throw new Error(
    `Tesseract language data (${TRAINEDDATA_FILE}) not found. Looked in: ${candidates.join(
      ", ",
    )}`,
  );
}

/**
 * OCR a document image and return the raw recognized text. Callers extract
 * the MRZ block from the text themselves (api/lib/kyc/mrzExtract).
 *
 * v1: one worker per call — simplicity over performance. A persistent worker
 * pool (createScheduler + N warmed workers) is the v2 optimization; document
 * verification is rate-limited to 5 attempts/day/user so per-call worker
 * startup (~1–2 s) is acceptable.
 *
 * Configuration notes:
 * - OEM.LSTM_ONLY is the tesseract.js default engine mode and matches the
 *   vendored tessdata_fast LSTM model.
 * - langPath points at the vendored directory; with gzip:true tesseract reads
 *   <langPath>/eng.traineddata.gz directly from the local filesystem (Node).
 * - cacheMethod "none": no traineddata cache reads/writes on disk.
 */
export async function ocrMrzRegion(imageBuffer: Buffer): Promise<string> {
  const langPath = resolveTessdataDir();
  const worker = await createWorker("eng", OEM.LSTM_ONLY, {
    langPath,
    cacheMethod: "none",
    gzip: true,
  });
  try {
    const { data } = await worker.recognize(imageBuffer);
    return data.text;
  } finally {
    await worker.terminate();
  }
}
