/**
 * Honest camera/mic availability copy. Embedded webviews and preview iframes
 * often expose no getUserMedia at all — say so plainly instead of a generic
 * "check permissions" that sends users hunting for a toggle that doesn't exist.
 */

export const CAMERA_BLOCKED_MESSAGE =
  'Camera is blocked in this preview. Open Resonance in its own browser tab to use camera features.';

export const MIC_BLOCKED_MESSAGE =
  'Microphone is blocked in this preview. Open Resonance in its own browser tab to use voice features.';

/** True when getUserMedia is missing entirely (embedded preview, insecure context). */
export function isMediaCaptureUnavailable(): boolean {
  return !navigator.mediaDevices?.getUserMedia;
}

/** Copy for a camera failure: honest blocked-preview message, else permissions hint. */
export function cameraErrorMessage(): string {
  return isMediaCaptureUnavailable()
    ? CAMERA_BLOCKED_MESSAGE
    : 'Camera unavailable — check browser permissions';
}

/** Copy for a microphone failure. */
export function micErrorMessage(): string {
  return isMediaCaptureUnavailable()
    ? MIC_BLOCKED_MESSAGE
    : 'Microphone unavailable — check browser permissions';
}
