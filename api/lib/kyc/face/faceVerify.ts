import { detectFaces } from "./detect";
import { alignAndEmbed, cosine, meanEmbedding } from "./embed";

/**
 * kyc/face/faceVerify — KYC Phase 2b face-match orchestration.
 *
 * Runs YuNet detection on the document photo and each selfie frame, embeds
 * faces with SFace, and decides a verdict from: face counts, inter-frame
 * face movement (liveness), frame-embedding consistency (liveness), and the
 * document-vs-mean-frame cosine (match). Everything is in memory; nothing
 * here writes to disk or a database.
 */

export const FACE_MATCH_THRESHOLD = 0.45;
export const FACE_MISMATCH_THRESHOLD = 0.3;
export const FRAME_CONSISTENCY_THRESHOLD = 0.55;
export const MIN_FACE_MOVEMENT_PX = 24;

export type FaceVerdict =
  | "FACE_VERIFIED"
  | "FACE_MISMATCH"
  | "LIVENESS_FAIL"
  | "UNREADABLE"
  | "DOC_UNREADABLE";

export interface DecideFaceInput {
  /** Faces detected in the document photo. */
  docFaceCount: number;
  /** Faces detected per selfie frame. */
  frameFaceCounts: number[];
  /** Center distance (px) per consecutive frame pair. */
  movements: number[];
  /** Mutual cosine of frame embeddings, one value per frame pair. */
  frameCosines: number[];
  /** Cosine of doc embedding vs mean frame embedding. */
  docSelfieCosine: number | null;
}

export interface DecideFaceResult {
  verdict: FaceVerdict;
  reason?: string;
}

/**
 * Pure verdict decision. Check order matters: document readability, then
 * frame readability, then liveness (movement + consistency), then match
 * bands (≥ 0.45 verified, ≤ 0.30 mismatch, between = inconclusive).
 */
export function decideFaceVerdict(input: DecideFaceInput): DecideFaceResult {
  if (input.docFaceCount === 0) {
    return {
      verdict: "DOC_UNREADABLE",
      reason: "No face found in the document photo",
    };
  }
  if (input.frameFaceCounts.some((n) => n !== 1)) {
    return {
      verdict: "UNREADABLE",
      reason: "Exactly one face must be visible in every selfie frame",
    };
  }
  if (input.movements.some((m) => m < MIN_FACE_MOVEMENT_PX)) {
    return {
      verdict: "LIVENESS_FAIL",
      reason: "We couldn't confirm live presence",
    };
  }
  const frameCosineMean =
    input.frameCosines.length > 0
      ? input.frameCosines.reduce((a, b) => a + b, 0) / input.frameCosines.length
      : 0;
  if (frameCosineMean < FRAME_CONSISTENCY_THRESHOLD) {
    return {
      verdict: "LIVENESS_FAIL",
      reason: "We couldn't confirm live presence",
    };
  }
  if (input.docSelfieCosine === null) {
    // Defensive: a doc face and per-frame faces exist, so a null cosine
    // should be unreachable — treat as inconclusive rather than crashing.
    return {
      verdict: "UNREADABLE",
      reason: "The match was inconclusive — try again in good light",
    };
  }
  if (input.docSelfieCosine >= FACE_MATCH_THRESHOLD) {
    return { verdict: "FACE_VERIFIED" };
  }
  if (input.docSelfieCosine <= FACE_MISMATCH_THRESHOLD) {
    return {
      verdict: "FACE_MISMATCH",
      reason: "The face doesn't match the document photo",
    };
  }
  return {
    verdict: "UNREADABLE",
    reason: "The match was inconclusive — try again in good light",
  };
}

export type ScoreBand = "high" | "medium" | "low";

export interface VerifyFaceResult {
  verdict: FaceVerdict;
  /** Band of the doc-vs-selfie cosine; null when no cosine was computed. */
  scoreBand: ScoreBand | null;
  reason?: string;
  debug: {
    docCosine: number | null;
    movements: number[];
    frameCosineMean: number | null;
  };
}

function scoreBandOf(docCosine: number | null): ScoreBand | null {
  if (docCosine === null) return null;
  if (docCosine >= FACE_MATCH_THRESHOLD) return "high";
  if (docCosine >= FACE_MISMATCH_THRESHOLD) return "medium";
  return "low";
}

/**
 * Verify a document portrait against a burst of selfie frames.
 * All processing is in memory; buffers are never persisted.
 */
export async function verifyFace(
  docImageBuffer: Buffer,
  frameBuffers: Buffer[],
): Promise<VerifyFaceResult> {
  const docFaces = await detectFaces(docImageBuffer);
  const docFace = docFaces.at(0) ?? null;

  const frames = await Promise.all(
    frameBuffers.map(async (buffer) => {
      const faces = await detectFaces(buffer);
      const face = faces.length === 1 ? faces[0] : null;
      return {
        faceCount: faces.length,
        center: face
          ? ([face.box.x + face.box.w / 2, face.box.y + face.box.h / 2] as const)
          : null,
        embedding: face ? await alignAndEmbed(buffer, face) : null,
      };
    }),
  );

  const frameFaceCounts = frames.map((f) => f.faceCount);

  const movements: number[] = [];
  for (let i = 0; i + 1 < frames.length; i++) {
    const a = frames[i].center;
    const b = frames[i + 1].center;
    // A missing face already fails the frame-count check; 0 is a safe filler.
    movements.push(a && b ? Math.hypot(a[0] - b[0], a[1] - b[1]) : 0);
  }

  const embeddings = frames.map((f) => f.embedding);
  const frameCosines: number[] = [];
  for (let i = 0; i < embeddings.length; i++) {
    for (let j = i + 1; j < embeddings.length; j++) {
      const a = embeddings[i];
      const b = embeddings[j];
      if (a && b) frameCosines.push(cosine(a, b));
    }
  }
  const frameCosineMean =
    frameCosines.length > 0
      ? frameCosines.reduce((a, b) => a + b, 0) / frameCosines.length
      : null;

  let docSelfieCosine: number | null = null;
  if (docFace && embeddings.every((e) => e !== null)) {
    const docEmbedding = await alignAndEmbed(docImageBuffer, docFace);
    docSelfieCosine = cosine(
      docEmbedding,
      meanEmbedding(embeddings as Float32Array[]),
    );
  }

  const decided = decideFaceVerdict({
    docFaceCount: docFaces.length,
    frameFaceCounts,
    movements,
    frameCosines,
    docSelfieCosine,
  });

  return {
    verdict: decided.verdict,
    scoreBand: scoreBandOf(docSelfieCosine),
    reason: decided.reason,
    debug: { docCosine: docSelfieCosine, movements, frameCosineMean },
  };
}
