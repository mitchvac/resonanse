import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as ort from "onnxruntime-node";

/**
 * kyc/face/models — vendored ONNX face models (YuNet detection + SFace
 * recognition), loaded as lazy CPU inference-session singletons.
 *
 * Model buffers are read from disk by onnxruntime at session-creation time;
 * this module itself never persists anything.
 */

export const YUNET_MODEL_FILE = "face_detection_yunet_2023mar.onnx";
export const SFACE_MODEL_FILE = "face_recognition_sface_2021dec.onnx";

/**
 * Locate the directory holding the vendored face models
 * (api/assets/models/*.onnx).
 *
 * Same fallback-chain pattern as resolveTessdataDir (api/lib/kyc/ocr.ts):
 * the server ships as a single bundled dist/boot.js, so neither __dirname
 * nor import.meta.url reliably points into the source tree; the deploy
 * layout (dist/boot.js + repo root as process.cwd()) is covered by the cwd
 * entry first. First directory containing the YuNet model wins. Throws a
 * clear error when the models are missing everywhere.
 */
export function resolveModelsDir(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.join(process.cwd(), "api", "assets", "models"),
    path.join(here, "..", "..", "assets", "models"),
    path.join(here, "..", "assets", "models"),
  ];
  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, YUNET_MODEL_FILE))) {
      return dir;
    }
  }
  throw new Error(
    `Face models (${YUNET_MODEL_FILE}) not found. Looked in: ${candidates.join(
      ", ",
    )}`,
  );
}

let yunetSession: Promise<ort.InferenceSession> | null = null;
let sfaceSession: Promise<ort.InferenceSession> | null = null;

/** Lazy singleton YuNet detection session (CPU execution provider). */
export function getYunetSession(): Promise<ort.InferenceSession> {
  yunetSession ??= ort.InferenceSession.create(
    path.join(resolveModelsDir(), YUNET_MODEL_FILE),
    { executionProviders: ["cpu"] },
  );
  return yunetSession;
}

/** Lazy singleton SFace recognition session (CPU execution provider). */
export function getSfaceSession(): Promise<ort.InferenceSession> {
  sfaceSession ??= ort.InferenceSession.create(
    path.join(resolveModelsDir(), SFACE_MODEL_FILE),
    { executionProviders: ["cpu"] },
  );
  return sfaceSession;
}
