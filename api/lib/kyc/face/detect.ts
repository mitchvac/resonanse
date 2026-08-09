import * as ort from "onnxruntime-node";
import sharp from "sharp";
import { getYunetSession } from "./models";

/**
 * kyc/face/detect — YuNet face detection on an in-memory image Buffer.
 *
 * Pipeline (proven contract, do not deviate):
 * - Decode ANY input (jpeg/png) with sharp, stretch-resize to exactly
 *   640×640 (no letterbox), raw RGB pixels, Float32Array NCHW with values
 *   0–255 RAW (no normalization, no mean subtraction).
 * - YuNet outputs per stride s ∈ {8,16,32}: cls_s / obj_s [1,N,1],
 *   bbox_s [1,N,4], kps_s [1,N,10], N = (640/s)².
 * - cls/obj are ALREADY probabilities — no sigmoid. score = cls*obj,
 *   keep score > 0.6 (top 50 per stride), greedy NMS at IoU > 0.3.
 * - Keypoint order (subject perspective): [right eye, left eye, nose tip,
 *   right mouth corner, left mouth corner].
 */

export interface FaceBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Face {
  /** Bounding box in ORIGINAL-image coordinates. */
  box: FaceBox;
  score: number;
  /** 5 keypoints [x,y] in original-image coordinates (YuNet order). */
  kps: [number, number][];
}

const INPUT_SIZE = 640;
const STRIDES = [8, 16, 32] as const;
const SCORE_THRESHOLD = 0.6;
const NMS_IOU_THRESHOLD = 0.3;
const MAX_PER_STRIDE = 50;

function iou(a: FaceBox, b: FaceBox): number {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.w, b.x + b.w);
  const y2 = Math.min(a.y + a.h, b.y + b.h);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const union = a.w * a.h + b.w * b.h - inter;
  return union > 0 ? inter / union : 0;
}

/** Greedy NMS: sort by score desc, suppress boxes with IoU > threshold. */
function nms(faces: Face[]): Face[] {
  const sorted = [...faces].sort((a, b) => b.score - a.score);
  const kept: Face[] = [];
  for (const face of sorted) {
    if (kept.every((k) => iou(k.box, face.box) <= NMS_IOU_THRESHOLD)) {
      kept.push(face);
    }
  }
  return kept;
}

/**
 * Detect faces in an image. Returns all NMS survivors (usually one) sorted
 * by score descending. Throws if the image cannot be decoded.
 */
export async function detectFaces(imageBuffer: Buffer): Promise<Face[]> {
  const metadata = await sharp(imageBuffer).metadata();
  const w0 = metadata.width ?? 0;
  const h0 = metadata.height ?? 0;
  if (w0 <= 0 || h0 <= 0) {
    throw new Error("Could not decode image dimensions");
  }

  const { data } = await sharp(imageBuffer)
    .resize(INPUT_SIZE, INPUT_SIZE, { fit: "fill" })
    .removeAlpha()
    .toColourspace("srgb")
    .raw()
    .toBuffer({ resolveWithObject: true });

  // NCHW float32, raw 0–255 values (no normalization).
  const pixels = INPUT_SIZE * INPUT_SIZE;
  const input = new Float32Array(3 * pixels);
  for (let i = 0; i < pixels; i++) {
    input[i] = data[i * 3];
    input[pixels + i] = data[i * 3 + 1];
    input[2 * pixels + i] = data[i * 3 + 2];
  }

  const session = await getYunetSession();
  const outputs = await session.run({
    input: new ort.Tensor("float32", input, [1, 3, INPUT_SIZE, INPUT_SIZE]),
  });

  const scaleX = w0 / INPUT_SIZE;
  const scaleY = h0 / INPUT_SIZE;
  const candidates: Face[] = [];

  for (const stride of STRIDES) {
    const grid = INPUT_SIZE / stride;
    const n = grid * grid;
    const cls = outputs[`cls_${stride}`]?.data as Float32Array | undefined;
    const obj = outputs[`obj_${stride}`]?.data as Float32Array | undefined;
    const bbox = outputs[`bbox_${stride}`]?.data as Float32Array | undefined;
    const kps = outputs[`kps_${stride}`]?.data as Float32Array | undefined;
    if (!cls || !obj || !bbox || !kps) {
      throw new Error(`YuNet output tensors for stride ${stride} missing`);
    }

    const scored: { index: number; score: number }[] = [];
    for (let i = 0; i < n; i++) {
      const score = cls[i] * obj[i]; // already probabilities — no sigmoid
      if (score > SCORE_THRESHOLD) scored.push({ index: i, score });
    }
    scored.sort((a, b) => b.score - a.score);

    for (const { index, score } of scored.slice(0, MAX_PER_STRIDE)) {
      const row = Math.floor(index / grid);
      const col = index % grid;
      const priorX = (col + 0.5) * stride;
      const priorY = (row + 0.5) * stride;

      const dx = bbox[index * 4];
      const dy = bbox[index * 4 + 1];
      const dw = bbox[index * 4 + 2];
      const dh = bbox[index * 4 + 3];
      const cx = priorX + dx * stride;
      const cy = priorY + dy * stride;
      const w = Math.exp(dw) * stride;
      const h = Math.exp(dh) * stride;

      const points: [number, number][] = [];
      for (let k = 0; k < 5; k++) {
        points.push([
          (priorX + kps[index * 10 + k * 2] * stride) * scaleX,
          (priorY + kps[index * 10 + k * 2 + 1] * stride) * scaleY,
        ]);
      }

      candidates.push({
        box: {
          x: (cx - w / 2) * scaleX,
          y: (cy - h / 2) * scaleY,
          w: w * scaleX,
          h: h * scaleY,
        },
        score,
        kps: points,
      });
    }
  }

  return nms(candidates);
}
