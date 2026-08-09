import { describe, expect, it } from "vitest";
import {
  FACE_MATCH_THRESHOLD,
  FACE_MISMATCH_THRESHOLD,
  FRAME_CONSISTENCY_THRESHOLD,
  MIN_FACE_MOVEMENT_PX,
  decideFaceVerdict,
  type DecideFaceInput,
} from "./faceVerify";
import {
  SFACE_REF_POINTS,
  applySimilarity,
  cosine,
  fitSimilarity,
  invertSimilarity,
  meanEmbedding,
} from "./embed";

/**
 * Pure KYC Phase 2b unit tests — no ONNX, no sharp, no files.
 */

/** A passing baseline: 1 doc face, 1 face per frame, moving, consistent, matched. */
const PASSING: DecideFaceInput = {
  docFaceCount: 1,
  frameFaceCounts: [1, 1, 1],
  movements: [40, 55],
  frameCosines: [0.9, 0.85, 0.88],
  docSelfieCosine: 0.6,
};

describe("decideFaceVerdict", () => {
  it("returns DOC_UNREADABLE when no face is found in the document", () => {
    const r = decideFaceVerdict({ ...PASSING, docFaceCount: 0 });
    expect(r.verdict).toBe("DOC_UNREADABLE");
    expect(r.reason).toMatch(/No face found in the document photo/);
  });

  it("checks the document before the frames", () => {
    const r = decideFaceVerdict({
      ...PASSING,
      docFaceCount: 0,
      frameFaceCounts: [0, 2, 1],
    });
    expect(r.verdict).toBe("DOC_UNREADABLE");
  });

  it("returns UNREADABLE when any frame does not contain exactly one face", () => {
    for (const counts of [[0, 1, 1], [1, 2, 1], [1, 1, 0]]) {
      const r = decideFaceVerdict({ ...PASSING, frameFaceCounts: counts });
      expect(r.verdict).toBe("UNREADABLE");
      expect(r.reason).toMatch(/Exactly one face/);
    }
  });

  it("returns LIVENESS_FAIL when any consecutive movement is too small", () => {
    const r = decideFaceVerdict({ ...PASSING, movements: [40, 3] });
    expect(r.verdict).toBe("LIVENESS_FAIL");
    expect(r.reason).toMatch(/live presence/);
  });

  it("accepts movement of exactly MIN_FACE_MOVEMENT_PX", () => {
    const r = decideFaceVerdict({
      ...PASSING,
      movements: [MIN_FACE_MOVEMENT_PX, MIN_FACE_MOVEMENT_PX],
    });
    expect(r.verdict).toBe("FACE_VERIFIED");
  });

  it("returns LIVENESS_FAIL when mean frame consistency is below threshold", () => {
    const r = decideFaceVerdict({ ...PASSING, frameCosines: [0.4, 0.5, 0.6] });
    expect(r.verdict).toBe("LIVENESS_FAIL");
  });

  it("accepts mean frame consistency of exactly FRAME_CONSISTENCY_THRESHOLD", () => {
    const r = decideFaceVerdict({
      ...PASSING,
      frameCosines: [FRAME_CONSISTENCY_THRESHOLD],
    });
    expect(r.verdict).toBe("FACE_VERIFIED");
  });

  it("returns UNREADABLE when the doc-selfie cosine is defensively null", () => {
    const r = decideFaceVerdict({ ...PASSING, docSelfieCosine: null });
    expect(r.verdict).toBe("UNREADABLE");
    expect(r.reason).toMatch(/inconclusive/);
  });

  it("returns FACE_VERIFIED at exactly FACE_MATCH_THRESHOLD", () => {
    const r = decideFaceVerdict({
      ...PASSING,
      docSelfieCosine: FACE_MATCH_THRESHOLD,
    });
    expect(r.verdict).toBe("FACE_VERIFIED");
    expect(r.reason).toBeUndefined();
  });

  it("returns FACE_MISMATCH at exactly FACE_MISMATCH_THRESHOLD", () => {
    const r = decideFaceVerdict({
      ...PASSING,
      docSelfieCosine: FACE_MISMATCH_THRESHOLD,
    });
    expect(r.verdict).toBe("FACE_MISMATCH");
    expect(r.reason).toMatch(/doesn't match the document photo/);
  });

  it("returns FACE_MISMATCH below the mismatch threshold", () => {
    const r = decideFaceVerdict({ ...PASSING, docSelfieCosine: 0.1 });
    expect(r.verdict).toBe("FACE_MISMATCH");
  });

  it("returns UNREADABLE (inconclusive) strictly between the bands", () => {
    for (const c of [0.31, 0.37, 0.449]) {
      const r = decideFaceVerdict({ ...PASSING, docSelfieCosine: c });
      expect(r.verdict).toBe("UNREADABLE");
      expect(r.reason).toMatch(/inconclusive/);
    }
  });
});

describe("cosine", () => {
  it("computes dot products of normalized vectors", () => {
    expect(cosine(new Float32Array([1, 0]), new Float32Array([1, 0]))).toBeCloseTo(1);
    expect(cosine(new Float32Array([1, 0]), new Float32Array([0, 1]))).toBeCloseTo(0);
    expect(
      cosine(new Float32Array([0.6, 0.8]), new Float32Array([0.6, 0.8])),
    ).toBeCloseTo(1);
    expect(
      cosine(new Float32Array([0.6, 0.8]), new Float32Array([0.8, -0.6])),
    ).toBeCloseTo(0);
  });
});

describe("meanEmbedding", () => {
  it("averages and re-normalizes", () => {
    const mean = meanEmbedding([
      new Float32Array([1, 0]),
      new Float32Array([0, 1]),
    ]);
    expect(mean[0]).toBeCloseTo(Math.SQRT1_2);
    expect(mean[1]).toBeCloseTo(Math.SQRT1_2);
  });

  it("throws on an empty input", () => {
    expect(() => meanEmbedding([])).toThrow();
  });
});

describe("similarity transform", () => {
  const srcPoints: [number, number][] = [
    [120.5, 88.25],
    [201.75, 90.1],
    [160.2, 130.4],
    [130.0, 170.9],
    [190.4, 171.2],
  ];

  it("maps a similarity-transformed reference set exactly back onto the SFace reference points", () => {
    // A real face's keypoints are (near-)similar to the reference layout, so
    // build src as an EXACT similarity of the ref: the least-squares fit
    // must then recover it exactly (zero residual).
    const angle = -Math.PI / 9; // -20°
    const warp = {
      s: 3.1,
      cos: Math.cos(angle),
      sin: Math.sin(angle),
      tx: 250,
      ty: 180,
    };
    const src = SFACE_REF_POINTS.map((p) => applySimilarity(warp, p));
    const fit = fitSimilarity(src, SFACE_REF_POINTS);
    for (let i = 0; i < src.length; i++) {
      const [x, y] = applySimilarity(fit, src[i]);
      expect(x).toBeCloseTo(SFACE_REF_POINTS[i][0], 4);
      expect(y).toBeCloseTo(SFACE_REF_POINTS[i][1], 4);
    }
  });

  it("round-trips through the exact inverse", () => {
    const t = fitSimilarity(srcPoints, SFACE_REF_POINTS);
    const inv = invertSimilarity(t);
    for (let i = 0; i < srcPoints.length; i++) {
      const warped = applySimilarity(t, srcPoints[i]);
      const [x, y] = applySimilarity(inv, warped);
      expect(x).toBeCloseTo(srcPoints[i][0], 6);
      expect(y).toBeCloseTo(srcPoints[i][1], 6);
    }
  });

  it("recovers a known rotation + uniform scale + translation (no reflection)", () => {
    // Build dst by applying a known transform to src, then fit src → dst.
    const angle = Math.PI / 6; // 30°
    const known = {
      s: 2.5,
      cos: Math.cos(angle),
      sin: Math.sin(angle),
      tx: 7,
      ty: -13,
    };
    const dst = srcPoints.map((p) => applySimilarity(known, p));
    const fit = fitSimilarity(srcPoints, dst);
    expect(fit.s).toBeCloseTo(known.s, 6);
    expect(fit.cos).toBeCloseTo(known.cos, 6);
    expect(fit.sin).toBeCloseTo(known.sin, 6);
    expect(fit.tx).toBeCloseTo(known.tx, 4);
    expect(fit.ty).toBeCloseTo(known.ty, 4);
  });

  it("rejects degenerate point sets", () => {
    expect(() => fitSimilarity([[1, 1]], [[2, 2]])).toThrow();
    expect(() =>
      fitSimilarity(
        [
          [5, 5],
          [5, 5],
        ],
        [
          [1, 1],
          [2, 2],
        ],
      ),
    ).toThrow();
  });
});
