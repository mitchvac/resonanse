/**
 * Shared photo-file → data-URL pipeline. Downscales hard enough that a full
 * 6-photo profile stays well under DB packet limits:
 * 1280px long edge, JPEG q0.72, re-compressing until ≤420k chars (~315KB —
 * base64 inflates ~4/3). Server cap is 450k chars per photo.
 */

export const PHOTO_DATAURL_MAX_CHARS = 420_000;

export async function fileToPhotoDataUrl(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Could not read that image.'));
      el.src = url;
    });
    const longEdge = Math.max(img.naturalWidth, img.naturalHeight) || 1;
    const scale = Math.min(1, 1280 / longEdge);
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas unavailable.');
    ctx.drawImage(img, 0, 0, w, h);
    let quality = 0.72;
    let dataUrl = canvas.toDataURL('image/jpeg', quality);
    while (dataUrl.length > PHOTO_DATAURL_MAX_CHARS && quality > 0.3) {
      quality = Math.round((quality - 0.1) * 100) / 100;
      dataUrl = canvas.toDataURL('image/jpeg', quality);
    }
    if (dataUrl.length > PHOTO_DATAURL_MAX_CHARS) {
      throw new Error('That photo is still too large after compression.');
    }
    return dataUrl;
  } finally {
    URL.revokeObjectURL(url);
  }
}
