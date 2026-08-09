import { PNG } from "pngjs";
import jpeg from "jpeg-js";

/**
 * kyc/face/decode — pure-JS image decoding and resizing.
 *
 * Replaces sharp (native libvips binaries) so the server bundle is fully
 * self-contained: pngjs decodes PNGs, jpeg-js decodes JPEGs, and resizeRgb
 * resizes raw RGB pixel buffers with bilinear interpolation.
 */

export interface RgbImage {
  /** Interleaved RGB pixels, 3 bytes per pixel, row-major. */
  data: Uint8Array;
  width: number;
  height: number;
}

/**
 * Decode a PNG or JPEG buffer to interleaved RGB (alpha dropped). PNG is
 * tried first (pngjs throws on non-PNG), then JPEG. Throws a clear error if
 * neither decoder accepts the buffer.
 */
export function decodeImage(buffer: Buffer): RgbImage {
  try {
    const png = PNG.sync.read(buffer);
    const data = new Uint8Array(png.width * png.height * 3);
    for (let i = 0; i < png.width * png.height; i++) {
      data[i * 3] = png.data[i * 4];
      data[i * 3 + 1] = png.data[i * 4 + 1];
      data[i * 3 + 2] = png.data[i * 4 + 2];
    }
    return { data, width: png.width, height: png.height };
  } catch {
    // not a PNG — try JPEG
  }
  try {
    const img = jpeg.decode(buffer, { maxMemoryUsageInMB: 512 });
    if (!img || img.width <= 0 || img.height <= 0 || !img.data) {
      throw new Error("jpeg-js returned no pixels");
    }
    const data = new Uint8Array(img.width * img.height * 3);
    for (let i = 0; i < img.width * img.height; i++) {
      data[i * 3] = img.data[i * 4];
      data[i * 3 + 1] = img.data[i * 4 + 1];
      data[i * 3 + 2] = img.data[i * 4 + 2];
    }
    return { data, width: img.width, height: img.height };
  } catch {
    throw new Error("Unsupported image format — use a JPEG or PNG photo");
  }
}

/**
 * Bilinear resize of an interleaved RGB buffer from (w0,h0) to (w1,h1).
 * Samples are edge-clamped, so fractional coordinates outside [0, w-1]×[0,
 * h-1] read the border pixel. Pure function, exported for tests.
 */
export function resizeRgb(
  src: Uint8Array,
  w0: number,
  h0: number,
  w1: number,
  h1: number,
): Uint8Array {
  if (w0 <= 0 || h0 <= 0 || w1 <= 0 || h1 <= 0) {
    throw new Error("resizeRgb needs positive dimensions");
  }
  const out = new Uint8Array(w1 * h1 * 3);
  // Map output-pixel centers onto source coordinates.
  const scaleX = w0 / w1;
  const scaleY = h0 / h1;
  const read = (x: number, y: number, c: number): number => {
    const cx = Math.min(Math.max(x, 0), w0 - 1);
    const cy = Math.min(Math.max(y, 0), h0 - 1);
    return src[(cy * w0 + cx) * 3 + c];
  };
  for (let y = 0; y < h1; y++) {
    const sy = (y + 0.5) * scaleY - 0.5;
    const y0 = Math.floor(sy);
    const fy = sy - y0;
    for (let x = 0; x < w1; x++) {
      const sx = (x + 0.5) * scaleX - 0.5;
      const x0 = Math.floor(sx);
      const fx = sx - x0;
      const outBase = (y * w1 + x) * 3;
      for (let c = 0; c < 3; c++) {
        const top = read(x0, y0, c) * (1 - fx) + read(x0 + 1, y0, c) * fx;
        const bottom =
          read(x0, y0 + 1, c) * (1 - fx) + read(x0 + 1, y0 + 1, c) * fx;
        out[outBase + c] = Math.round(top * (1 - fy) + bottom * fy);
      }
    }
  }
  return out;
}
