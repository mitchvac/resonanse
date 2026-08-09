import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as ort from "onnxruntime-web";

/**
 * kyc/face/models — vendored ONNX face models (YuNet detection + SFace
 * recognition), loaded as lazy CPU inference-session singletons.
 *
 * Uses onnxruntime-web (pure WASM, bundlable) instead of onnxruntime-node
 * (native .node binaries) because the production deploy ships dist/boot.js
 * with no node_modules. The WASM runtime files are vendored at
 * <assets>/models/ort/ and their directory is handed to ort.env.wasm.wasmPaths
 * exactly once before the first session is created.
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

let wasmEnvConfigured = false;

/**
 * Point onnxruntime-web at the vendored WASM runtime files
 * (<modelsDir>/ort/*.wasm) and pin it to a single thread — exactly once,
 * before any session is created. The production deploy has no node_modules,
 * so the default CDN-relative wasm paths would resolve nowhere.
 */
function configureWasmEnv(): string {
  const modelsDir = resolveModelsDir();
  if (!wasmEnvConfigured) {
    // onnxruntime-web resolves runtime files by plain concatenation —
    // the directory MUST end in a separator.
    ort.env.wasm.wasmPaths = path.join(modelsDir, "ort") + path.sep;
    ort.env.wasm.numThreads = 1;
    wasmEnvConfigured = true;
  }
  return modelsDir;
}

let yunetSession: Promise<ort.InferenceSession> | null = null;
let sfaceSession: Promise<ort.InferenceSession> | null = null;

/** Lazy singleton YuNet detection session (CPU execution provider). */
export function getYunetSession(): Promise<ort.InferenceSession> {
  const modelsDir = configureWasmEnv();
  yunetSession ??= ort.InferenceSession.create(
    path.join(modelsDir, YUNET_MODEL_FILE),
    { executionProviders: ["cpu"] },
  );
  return yunetSession;
}

/** Lazy singleton SFace recognition session (CPU execution provider). */
export function getSfaceSession(): Promise<ort.InferenceSession> {
  const modelsDir = configureWasmEnv();
  sfaceSession ??= ort.InferenceSession.create(
    path.join(modelsDir, SFACE_MODEL_FILE),
    { executionProviders: ["cpu"] },
  );
  return sfaceSession;
}
