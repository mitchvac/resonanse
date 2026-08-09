import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import {
  Camera,
  CameraOff,
  FileWarning,
  Loader2,
  ScanFace,
  ShieldCheck,
  TriangleAlert,
  UserRoundX,
  Video,
} from 'lucide-react';
import GlassCard from '@/components/GlassCard';
import { BtnGlass, BtnPrimary } from '@/components/ui/buttons';
import { trpc } from '@/providers/trpc';
import { cn } from '@/lib/utils';

/**
 * FaceVerifySection — "FACE VERIFICATION" (self-hosted KYC Phase 2b)
 *
 * After the document is verified, the customer proves live presence: they
 * retake the document photo (the page with their portrait) and record a
 * short 3-frame selfie sequence in the browser. Both are base64-encoded in
 * memory and sent once to `kyc.submitFace`, where liveness is checked and
 * the live face is compared with the document portrait. Frames are
 * immediately discarded server-side — only the verdict is kept.
 */

type FaceVerdict = {
  verdict:
    | 'FACE_VERIFIED'
    | 'FACE_MISMATCH'
    | 'LIVENESS_FAIL'
    | 'UNREADABLE'
    | 'DOC_UNREADABLE'
    | 'ALREADY_VERIFIED';
  scoreBand?: 'high' | 'medium' | 'low' | null;
  reason?: string;
  attemptsToday: number;
  maxAttempts: number;
};

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const FRAME_COUNT = 3;
const FRAME_INTERVAL_MS = 700;

const STAGE_TEXTS = ['Checking liveness…', 'Comparing faces…', 'Almost there…'];

/** Pull a human message out of a tRPC/network error without `any`. */
function errorMessage(err: unknown, fallback: string): string {
  if (typeof err === 'object' && err !== null && 'message' in err) {
    const message = (err as { message?: unknown }).message;
    if (typeof message === 'string' && message.length > 0) return message;
  }
  return fallback;
}

/** File → raw base64 (data-URL prefix stripped). */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(new Error('read failed'));
    reader.readAsDataURL(file);
  });
}

/** Draw the current video frame to a JPEG base64 string (prefix stripped). */
function captureFrame(video: HTMLVideoElement): string | null {
  const width = video.videoWidth;
  const height = video.videoHeight;
  if (!width || !height) return null;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0, width, height);
  const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
  const comma = dataUrl.indexOf(',');
  return comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/* — Success state (shared by query-verified and just-verified) — */
function VerifiedCard() {
  return (
    <GlassCard className="p-5">
      <div className="flex items-center gap-2.5">
        <ShieldCheck
          size={18}
          className="shrink-0"
          style={{ color: 'var(--ok)' }}
          aria-hidden="true"
        />
        <p className="t-eyebrow min-w-0 flex-1">FACE VERIFICATION</p>
      </div>
      <h2 className="t-title-sm mt-3" style={{ color: 'var(--text)' }}>
        Face verified
      </h2>
      <p className="t-caption mt-2.5" style={{ color: 'var(--text-secondary)' }}>
        Your KYC is complete — document and live face match confirmed.
      </p>
    </GlassCard>
  );
}

/* — Amber verdict panel (mismatch / liveness / unreadable variants) — */
function VerdictPanel({
  icon,
  message,
  tip,
  actionLabel,
  onAction,
}: {
  icon: 'mismatch' | 'liveness' | 'unreadable';
  message: string;
  tip?: string;
  actionLabel: string;
  onAction: () => void;
}) {
  const Icon =
    icon === 'mismatch' ? UserRoundX : icon === 'liveness' ? TriangleAlert : FileWarning;
  return (
    <div
      className="mt-4 rounded-[16px] px-4 py-3"
      style={{ background: 'var(--field)' }}
      role="alert"
    >
      <div className="flex gap-2.5">
        <Icon
          size={18}
          className="mt-0.5 shrink-0"
          style={{ color: 'var(--warn)' }}
          aria-hidden="true"
        />
        <div className="min-w-0">
          <p className="t-caption font-bold" style={{ color: 'var(--warn)' }}>
            {message}
          </p>
          {tip && (
            <p className="t-caption mt-1.5" style={{ color: 'var(--text-secondary)' }}>
              {tip}
            </p>
          )}
        </div>
      </div>
      <BtnGlass className="mt-3 h-9 px-4" onClick={onAction}>
        {actionLabel}
      </BtnGlass>
    </div>
  );
}

export default function FaceVerifySection({
  onToast,
  onError,
}: {
  onToast: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const utils = trpc.useUtils();
  const statusQuery = trpc.kyc.status.useQuery(undefined, { retry: 1 });
  const submitFace = trpc.kyc.submitFace.useMutation();

  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [stage, setStage] = useState(0);
  const [result, setResult] = useState<FaceVerdict | null>(null);
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraDenied, setCameraDenied] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [framesDone, setFramesDone] = useState(0);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const unmountedRef = useRef(false);

  /* — Cosmetic staged progress while the mutation runs (mutation is truth) — */
  useEffect(() => {
    if (!submitFace.isPending) {
      setStage(0);
      return;
    }
    const t = setInterval(() => setStage((s) => (s + 1) % STAGE_TEXTS.length), 1800);
    return () => clearInterval(t);
  }, [submitFace.isPending]);

  /* — Revoke the object URL when replaced or unmounted — */
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  /* — Always release the camera on unmount — */
  useEffect(() => {
    unmountedRef.current = false;
    return () => {
      unmountedRef.current = true;
      stopMediaTracks();
    };
  }, []);

  function stopMediaTracks() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }

  /* — Step 1: document photo select — size guard → preview thumbnail — */
  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const next = e.target.files?.[0] ?? null;
    // Allow re-selecting the same file later.
    e.target.value = '';
    setResult(null);
    if (!next) return;
    if (next.size > MAX_FILE_BYTES) {
      onError('That photo is larger than 10 MB — retake it at a lower resolution.');
      return;
    }
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(next);
    setPreviewUrl(URL.createObjectURL(next));
  };

  const clearFile = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(null);
    setPreviewUrl(null);
    setResult(null);
    resetSelfie();
  };

  function resetSelfie() {
    stopMediaTracks();
    setCameraOn(false);
    setCameraDenied(false);
    setCapturing(false);
    setFramesDone(0);
  }

  /* — Step 2: camera start — */
  const startCamera = async () => {
    setCameraDenied(false);
    setResult(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      if (unmountedRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => undefined);
      }
      setCameraOn(true);
    } catch {
      stopMediaTracks();
      setCameraOn(false);
      setCameraDenied(true);
    }
  };

  /* — Capture 3 timed frames, then auto-submit with the document photo — */
  const handleCapture = async () => {
    if (!file || capturing || submitFace.isPending) return;
    const video = videoRef.current;
    if (!video || !streamRef.current) {
      setCameraDenied(true);
      return;
    }
    setResult(null);
    setCapturing(true);
    setFramesDone(0);

    const frames: string[] = [];
    for (let i = 0; i < FRAME_COUNT; i += 1) {
      const frame = captureFrame(video);
      if (!frame) break;
      frames.push(frame);
      setFramesDone(frames.length);
      if (i < FRAME_COUNT - 1) await wait(FRAME_INTERVAL_MS);
      if (unmountedRef.current) return;
    }

    stopMediaTracks();
    setCameraOn(false);
    setCapturing(false);

    if (frames.length < FRAME_COUNT) {
      onError('Couldn\u2019t capture the selfie frames — start the camera and try again.');
      return;
    }

    try {
      const docImageBase64 = await fileToBase64(file);
      const res = (await submitFace.mutateAsync({
        docImageBase64,
        selfieFrames: frames,
      })) as FaceVerdict;
      if (unmountedRef.current) return;
      setResult(res);
      if (res.verdict === 'FACE_VERIFIED' || res.verdict === 'ALREADY_VERIFIED') {
        void utils.kyc.status.invalidate();
        void utils.identityVault.status.invalidate();
        clearFile();
        onToast('Face verified — KYC complete');
      }
    } catch (err) {
      onError(errorMessage(err, 'Couldn\u2019t verify your face — try again.'));
    }
  };

  /* — Skeleton — */
  if (statusQuery.isLoading) {
    return (
      <div
        className="skeleton-shimmer h-44 rounded-[24px]"
        style={{ background: 'var(--field)' }}
        aria-label="Loading face verification"
      />
    );
  }

  /* — Error — */
  if (statusQuery.isError) {
    return (
      <GlassCard className="flex items-center justify-between gap-3 p-5">
        <span className="t-caption" style={{ color: 'var(--text-secondary)' }}>
          Couldn&rsquo;t load face verification.
        </span>
        <BtnGlass className="h-9 px-4" onClick={() => void statusQuery.refetch()}>
          Retry
        </BtnGlass>
      </GlassCard>
    );
  }

  const status = statusQuery.data;
  const verifiedNow =
    result?.verdict === 'FACE_VERIFIED' || result?.verdict === 'ALREADY_VERIFIED';

  /* — (a) Document must be verified first — face matches against it — */
  if (!status?.hasVaultRecord || status.vaultStatus !== 'verified') {
    return (
      <GlassCard className="p-5">
        <div className="flex items-center gap-2.5">
          <ScanFace
            size={18}
            className="shrink-0"
            style={{ color: 'var(--violet)' }}
            aria-hidden="true"
          />
          <p className="t-eyebrow min-w-0 flex-1">FACE VERIFICATION</p>
        </div>
        <p className="t-caption mt-3" style={{ color: 'var(--text-secondary)' }}>
          Verify your document above first — face verification matches you against it.
        </p>
      </GlassCard>
    );
  }

  /* — (b) Already verified (from status query or a verdict just returned) — */
  if (status.faceVerified || verifiedNow) {
    return <VerifiedCard />;
  }

  const attempts = result ?? status;
  const busy = capturing || submitFace.isPending;

  return (
    <GlassCard className="p-5">
      {/* Header: scan icon + eyebrow */}
      <div className="flex items-center gap-2.5">
        <ScanFace
          size={18}
          className="shrink-0"
          style={{ color: 'var(--violet)' }}
          aria-hidden="true"
        />
        <p className="t-eyebrow min-w-0 flex-1">FACE VERIFICATION</p>
      </div>
      <h2 className="t-title-sm mt-3" style={{ color: 'var(--text)' }}>
        Prove it&rsquo;s really you
      </h2>
      <p className="t-caption mt-2.5" style={{ color: 'var(--text-secondary)' }}>
        Retake your document photo and record a short live selfie — we compare the two
        faces.
      </p>

      {/* STEP 1 — document photo retake (dashed drop zone, tap opens camera) */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        aria-label="Retake your document photo"
        disabled={busy}
        onChange={handleFileChange}
      />
      {!previewUrl ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => fileInputRef.current?.click()}
          className={cn(
            'mt-4 flex min-h-[44px] w-full flex-col items-center justify-center gap-2 rounded-[24px] border-2 border-dashed px-4 py-6 transition-opacity duration-fast',
            busy ? 'cursor-not-allowed opacity-50' : 'active:opacity-70',
          )}
          style={{ borderColor: 'var(--violet)', color: 'var(--violet)' }}
        >
          <Camera size={24} aria-hidden="true" />
          <span className="t-caption text-center font-bold">
            Retake your document photo — the page with your photo
          </span>
        </button>
      ) : (
        /* Preview thumbnail */
        <div className="mt-4 flex items-center gap-3">
          <img
            src={previewUrl}
            alt="Your document photo"
            className="h-20 w-20 shrink-0 rounded-[16px] object-cover"
          />
          <span
            className="t-caption min-w-0 flex-1"
            style={{ color: 'var(--text-secondary)' }}
          >
            Looks good? Start the camera — or retake the photo.
          </span>
          <BtnGlass className="h-9 shrink-0 px-4" disabled={busy} onClick={clearFile}>
            Retake
          </BtnGlass>
        </div>
      )}

      {/* STEP 2 — live selfie sequence */}
      {file && (
        <div className="mt-4">
          {!cameraOn ? (
            <BtnPrimary className="w-full" disabled={busy} onClick={() => void startCamera()}>
              {submitFace.isPending ? (
                <Loader2 size={18} className="animate-spin" aria-hidden="true" />
              ) : (
                <Video size={17} aria-hidden="true" />
              )}
              Start camera
            </BtnPrimary>
          ) : (
            <>
              {/* Live preview (mirrored for natural selfie UX) */}
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="aspect-video w-full scale-x-[-1] rounded-[16px] object-cover"
                style={{ background: 'var(--field)' }}
              />
              <p
                className="t-caption mt-2.5 text-center"
                style={{ color: 'var(--text-secondary)' }}
              >
                Center your face, then slowly turn your head left and right
              </p>
              <BtnPrimary
                className="mt-3 w-full"
                disabled={busy}
                onClick={() => void handleCapture()}
              >
                {capturing ? (
                  <Loader2 size={18} className="animate-spin" aria-hidden="true" />
                ) : (
                  <ScanFace size={17} aria-hidden="true" />
                )}
                Capture
              </BtnPrimary>
            </>
          )}

          {/* Progress dots — one fills per captured frame */}
          {(capturing || framesDone > 0) && !submitFace.isPending && (
            <div
              className="mt-3 flex items-center justify-center gap-2"
              role="status"
              aria-label={`${framesDone} of ${FRAME_COUNT} frames captured`}
            >
              {Array.from({ length: FRAME_COUNT }, (_, i) => (
                <span
                  key={i}
                  className="h-2 w-2 rounded-full transition-colors duration-fast"
                  style={{
                    background:
                      i < framesDone ? 'var(--violet)' : 'var(--field)',
                  }}
                  aria-hidden="true"
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Camera permission denied — inline amber card + retry */}
      {cameraDenied && (
        <div
          className="mt-4 rounded-[16px] px-4 py-3"
          style={{ background: 'var(--field)' }}
          role="alert"
        >
          <div className="flex gap-2.5">
            <CameraOff
              size={18}
              className="mt-0.5 shrink-0"
              style={{ color: 'var(--warn)' }}
              aria-hidden="true"
            />
            <p className="t-caption" style={{ color: 'var(--warn)' }}>
              Camera access is needed for face verification
            </p>
          </div>
          <BtnGlass className="mt-3 h-9 px-4" onClick={() => void startCamera()}>
            Retry
          </BtnGlass>
        </div>
      )}

      {/* Staged progress (cosmetic) */}
      {submitFace.isPending && (
        <p
          className="t-caption mt-3 text-center"
          style={{ color: 'var(--text-secondary)' }}
          role="status"
        >
          {STAGE_TEXTS[stage]}
        </p>
      )}

      {/* FACE_MISMATCH — face doesn't match the document portrait */}
      {result?.verdict === 'FACE_MISMATCH' && (
        <VerdictPanel
          icon="mismatch"
          message={
            result.reason ??
            'The face doesn\u2019t match the document photo — make sure you\u2019re using your own document and have good, even lighting.'
          }
          actionLabel="Try again"
          onAction={() => {
            setResult(null);
            resetSelfie();
          }}
        />
      )}

      {/* LIVENESS_FAIL — live presence not confirmed */}
      {result?.verdict === 'LIVENESS_FAIL' && (
        <VerdictPanel
          icon="liveness"
          message={
            result.reason ??
            'We couldn\u2019t confirm live presence — keep your face centered and follow the movement instruction.'
          }
          actionLabel="Try again"
          onAction={() => {
            setResult(null);
            resetSelfie();
          }}
        />
      )}

      {/* UNREADABLE — selfie frames unreadable + tips */}
      {result?.verdict === 'UNREADABLE' && (
        <VerdictPanel
          icon="unreadable"
          message={result.reason ?? 'We couldn\u2019t read your selfie frames.'}
          tip="Use even light, remove glare, and make sure only one face is in the frame."
          actionLabel="Try again"
          onAction={() => {
            setResult(null);
            resetSelfie();
          }}
        />
      )}

      {/* DOC_UNREADABLE — no face in the document photo → back to step 1 */}
      {result?.verdict === 'DOC_UNREADABLE' && (
        <VerdictPanel
          icon="unreadable"
          message={
            result.reason ??
            'No face found in the document photo — retake it flat and fully visible.'
          }
          actionLabel="Try again"
          onAction={clearFile}
        />
      )}

      {/* Attempts + privacy */}
      {attempts && (
        <p className="t-micro mt-4 px-1" style={{ color: 'var(--text-secondary)' }}>
          Attempt {attempts.attemptsToday} of {attempts.maxAttempts} today
        </p>
      )}
      <p className="t-micro mt-1.5 px-1" style={{ color: 'var(--text-secondary)' }}>
        Photos are processed in memory and immediately discarded — never stored. No
        biometric data is kept.
      </p>
    </GlassCard>
  );
}
