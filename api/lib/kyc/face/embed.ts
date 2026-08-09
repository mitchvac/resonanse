import * as ort from "onnxruntime-node";
import sharp from "sharp";
import type { Face } from "./detect";
import { getSfaceSession } from "./models";

/**
 * kyc/face/embed — SFace face embeddings.
 *
 * Pipeline (proven contract, do not deviate):
 * - Align the detected face to 112×112 with a similarity transform
 *   (rotation + uniform scale + translation, NO reflection) mapping the 5
 *   YuNet keypoints to the SFace reference points below.
 * - sharp cannot affine-warp, so we compute the INVERSE transform and
 *   bilinear-sample every 112×112 output pixel from the original-resolution
 *   RGB source (edge-clamped).
 * - NCHW float32, RGB, values 0–255 RAW. Input tensor name is read from
 *   session.inputNames[0] at runtime.
 * - Output: 128-d vector, L2-normalized. cosine(a,b) = dot of normalized
 *   embeddings.
 */

export const SFACE_SIZE = 112;
export const SFACE_EMBEDDING_DIM = 128;

/**
 * SFace 112×112 alignment reference, in IMAGE-perspective order:
 * [image-left eye, image-right eye, nose, image-left mouth, image-right
 * mouth]. This matches YuNet's kps order ([right eye, left eye, nose, right
 * mouth, left mouth] in SUBJECT perspective) index-for-index — the subject's
 * right eye appears on the image's left — so the correspondence is the
 * identity mapping. (Swapping to subject-perspective labels would demand a
 * reflection, which a similarity transform cannot express and produces a
 * degenerate fit.)
 */
export const SFACE_REF_POINTS: ReadonlyArray<readonly [number, number]> = [
  [38.2946, 51.6963],
  [73.5318, 51.5014],
  [56.0252, 71.7366],
  [41.5493, 92.3655],
  [70.7299, 92.2041],
];

export type Point = readonly [number, number];

/**
 * 2D similarity transform p' = s·R·p + t where R = [[cos,-sin],[sin,cos]]
 * (rotation + uniform scale + translation, no reflection).
 */
export interface SimilarityTransform {
  s: number;
  cos: number;
  sin: number;
  tx: number;
  ty: number;
}

export function applySimilarity(t: SimilarityTransform, p: Point): [number, number] {
  return [
    t.s * (t.cos * p[0] - t.sin * p[1]) + t.tx,
    t.s * (t.sin * p[0] + t.cos * p[1]) + t.ty,
  ];
}

/** Exact inverse of a similarity transform. */
export function invertSimilarity(t: SimilarityTransform): SimilarityTransform {
  const invS = 1 / t.s;
  // inverse: p = (1/s)·Rᵀ·(p' − t)
  return {
    s: invS,
    cos: t.cos,
    sin: -t.sin,
    tx: -invS * (t.cos * t.tx + t.sin * t.ty),
    ty: -invS * (-t.sin * t.tx + t.cos * t.ty),
  };
}

/**
 * Least-squares similarity fit (Umeyama without reflection) mapping
 * src[i] → dst[i]. Closed form in 2D: the optimal rotation/scale numerator
 * is Σ v·u and Σ v×u over centered point sets.
 */
export function fitSimilarity(
  src: readonly Point[],
  dst: readonly Point[],
): SimilarityTransform {
  if (src.length !== dst.length || src.length < 2) {
    throw new Error("fitSimilarity needs equal point sets of size ≥ 2");
  }
  const n = src.length;
  let msx = 0;
  let msy = 0;
  let mdx = 0;
  let mdy = 0;
  for (let i = 0; i < n; i++) {
    msx += src[i][0];
    msy += src[i][1];
    mdx += dst[i][0];
    mdy += dst[i][1];
  }
  msx /= n;
  msy /= n;
  mdx /= n;
  mdy /= n;

  let dot = 0; // Σ v·u
  let cross = 0; // Σ v×u
  let normU = 0; // Σ |u|²
  for (let i = 0; i < n; i++) {
    const ux = src[i][0] - msx;
    const uy = src[i][1] - msy;
    const vx = dst[i][0] - mdx;
    const vy = dst[i][1] - mdy;
    dot += vx * ux + vy * uy;
    cross += vy * ux - vx * uy;
    normU += ux * ux + uy * uy;
  }
  if (normU === 0) {
    throw new Error("Degenerate source point set for similarity fit");
  }
  const rotNorm = Math.hypot(dot, cross);
  const cos = dot / rotNorm;
  const sin = cross / rotNorm;
  const s = rotNorm / normU;
  return {
    s,
    cos,
    sin,
    tx: mdx - s * (cos * msx - sin * msy),
    ty: mdy - s * (sin * msx + cos * msy),
  };
}

/** L2-normalize a vector in place on a copy. */
export function l2Normalize(v: Float32Array): Float32Array {
  let sum = 0;
  for (let i = 0; i < v.length; i++) sum += v[i] * v[i];
  const norm = Math.sqrt(sum);
  const out = new Float32Array(v.length);
  if (norm === 0) return out;
  for (let i = 0; i < v.length; i++) out[i] = v[i] / norm;
  return out;
}

/** Cosine similarity of two L2-normalized embeddings (plain dot product). */
export function cosine(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot;
}

/** Element-wise mean of embeddings, re-normalized to unit length. */
export function meanEmbedding(embeds: Float32Array[]): Float32Array {
  if (embeds.length === 0) throw new Error("meanEmbedding needs ≥ 1 embedding");
  const out = new Float32Array(embeds[0].length);
  for (const e of embeds) {
    for (let i = 0; i < out.length; i++) out[i] += e[i];
  }
  for (let i = 0; i < out.length; i++) out[i] /= embeds.length;
  return l2Normalize(out);
}

/**
 * Align the detected face to 112×112 and return its L2-normalized 128-d
 * SFace embedding.
 */
export async function alignAndEmbed(
  imageBuffer: Buffer,
  face: Face,
): Promise<Float32Array> {
  const srcPoints: Point[] = face.kps.map((kp) => kp as Point);
  const forward = fitSimilarity(srcPoints, SFACE_REF_POINTS);
  const inverse = invertSimilarity(forward); // 112-space → original-image space

  const { data, info } = await sharp(imageBuffer)
    .removeAlpha()
    .toColourspace("srgb")
    .raw()
    .toBuffer({ resolveWithObject: true });
  const srcW = info.width;
  const srcH = info.height;
  const channels = info.channels;

  const readPixel = (x: number, y: number, c: number): number => {
    const cx = Math.min(Math.max(x, 0), srcW - 1);
    const cy = Math.min(Math.max(y, 0), srcH - 1);
    const base = (cy * srcW + cx) * channels;
    // channels is 1 (grey) or 3 (srgb) after removeAlpha; replicate grey.
    return channels >= 3 ? data[base + c] : data[base];
  };

  // Bilinear-sample every output pixel from the source (edge-clamped).
  const size = SFACE_SIZE;
  const input = new Float32Array(3 * size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const [sx, sy] = applySimilarity(inverse, [x, y]);
      const x0 = Math.floor(sx);
      const y0 = Math.floor(sy);
      const fx = sx - x0;
      const fy = sy - y0;
      const outIdx = y * size + x;
      for (let c = 0; c < 3; c++) {
        const top =
          readPixel(x0, y0, c) * (1 - fx) + readPixel(x0 + 1, y0, c) * fx;
        const bottom =
          readPixel(x0, y0 + 1, c) * (1 - fx) +
          readPixel(x0 + 1, y0 + 1, c) * fx;
        input[c * size * size + outIdx] = top * (1 - fy) + bottom * fy;
      }
    }
  }

  const session = await getSfaceSession();
  const inputName = session.inputNames[0];
  const outputs = await session.run({
    [inputName]: new ort.Tensor("float32", input, [1, 3, size, size]),
  });
  const vec = outputs[session.outputNames[0]]?.data as
    | Float32Array
    | undefined;
  if (!vec || vec.length !== SFACE_EMBEDDING_DIM) {
    throw new Error("Unexpected SFace output tensor");
  }
  return l2Normalize(vec);
}
