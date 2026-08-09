import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent, ReactNode } from 'react';
import {
  Camera,
  CircleAlert,
  FileWarning,
  IdCard,
  Loader2,
  ScanLine,
  ShieldCheck,
  TriangleAlert,
} from 'lucide-react';
import GlassCard from '@/components/GlassCard';
import { BtnGlass, BtnPrimary } from '@/components/ui/buttons';
import { trpc } from '@/providers/trpc';
import { cn } from '@/lib/utils';

/**
 * IdCaptureSection — "DOCUMENT VERIFICATION" (self-hosted KYC Phase 2a)
 *
 * The customer photographs the machine-readable zone (MRZ) page of their
 * passport or national ID card. The photo is base64-encoded in memory and
 * sent once to `kyc.submitDoc`, where it is parsed, matched against the
 * encrypted Identity Vault record and immediately discarded — only the
 * verdict (linked to the pseudonymous customer number) is kept.
 */

type DocType = 'passport' | 'national_id' | 'drivers_license';

type VerdictResult = {
  verdict: 'VERIFIED' | 'MISMATCH' | 'UNREADABLE' | 'UNSUPPORTED' | 'ALREADY_VERIFIED';
  mismatches?: string[];
  reason?: string;
  attemptsToday: number;
  maxAttempts: number;
};

const MAX_FILE_BYTES = 10 * 1024 * 1024;

const DOC_TYPES: { value: DocType; label: string }[] = [
  { value: 'passport', label: 'Passport' },
  { value: 'national_id', label: 'National ID' },
  { value: 'drivers_license', label: "Driver's license" },
];

const STAGE_TEXTS = [
  'Reading document…',
  'Checking security codes…',
  'Matching your vault details…',
];

/** Server mismatch keys → customer-friendly field names. */
const MISMATCH_LABELS: Record<string, string> = {
  name: 'Legal name',
  dob: 'Date of birth',
  expiry: 'Document expiry',
  'document integrity': 'Document security codes',
};

function mismatchLabel(key: string): string {
  return MISMATCH_LABELS[key] ?? key;
}

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

/* — Verified state (shared by query-verified and just-verified) — */
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
        <p className="t-eyebrow min-w-0 flex-1">DOCUMENT VERIFICATION</p>
      </div>
      <h2 className="t-title-sm mt-3" style={{ color: 'var(--text)' }}>
        Identity verified
      </h2>
      <p className="t-caption mt-2.5" style={{ color: 'var(--text-secondary)' }}>
        Your document matched your vault details.
      </p>
    </GlassCard>
  );
}

export default function IdCaptureSection({
  onToast,
  onError,
}: {
  onToast: (message: string, icon?: ReactNode) => void;
  onError: (message: string) => void;
}) {
  const utils = trpc.useUtils();
  const statusQuery = trpc.kyc.status.useQuery(undefined, { retry: 1 });
  const submitDoc = trpc.kyc.submitDoc.useMutation();

  const [docType, setDocType] = useState<DocType>('passport');
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [stage, setStage] = useState(0);
  const [result, setResult] = useState<VerdictResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /* — Cosmetic staged progress while the mutation runs (mutation is truth) — */
  useEffect(() => {
    if (!submitDoc.isPending) {
      setStage(0);
      return;
    }
    const t = setInterval(() => setStage((s) => (s + 1) % STAGE_TEXTS.length), 1800);
    return () => clearInterval(t);
  }, [submitDoc.isPending]);

  /* — Revoke the object URL when replaced or unmounted — */
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const licenseSelected = docType === 'drivers_license';
  const captureDisabled = licenseSelected || submitDoc.isPending;

  /* — File select: size guard → preview thumbnail — */
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
  };

  /* — Submit: encode → mutate → verdict handling — */
  const handleVerify = async () => {
    if (!file || licenseSelected) return;
    setResult(null);
    try {
      const imageBase64 = await fileToBase64(file);
      const res = await submitDoc.mutateAsync({ imageBase64, docType });
      setResult(res);
      if (res.verdict === 'VERIFIED' || res.verdict === 'ALREADY_VERIFIED') {
        void utils.kyc.status.invalidate();
        void utils.identityVault.status.invalidate();
        clearFile();
        onToast(
          'Identity verified',
          <ShieldCheck size={14} style={{ color: 'var(--ok)' }} aria-hidden="true" />,
        );
      }
    } catch (err) {
      onError(errorMessage(err, "Couldn't verify your document — try again."));
    }
  };

  /* — Skeleton — */
  if (statusQuery.isLoading) {
    return (
      <div
        className="skeleton-shimmer h-44 rounded-[24px]"
        style={{ background: 'var(--field)' }}
        aria-label="Loading document verification"
      />
    );
  }

  /* — Error — */
  if (statusQuery.isError) {
    return (
      <GlassCard className="flex items-center justify-between gap-3 p-5">
        <span className="t-caption" style={{ color: 'var(--text-secondary)' }}>
          Couldn&rsquo;t load document verification.
        </span>
        <BtnGlass className="h-9 px-4" onClick={() => void statusQuery.refetch()}>
          Retry
        </BtnGlass>
      </GlassCard>
    );
  }

  const status = statusQuery.data;
  const verifiedNow =
    result?.verdict === 'VERIFIED' || result?.verdict === 'ALREADY_VERIFIED';

  /* — (a) No vault record yet: document is matched against it — */
  if (!status?.hasVaultRecord) {
    return (
      <GlassCard className="p-5">
        <div className="flex items-center gap-2.5">
          <IdCard
            size={18}
            className="shrink-0"
            style={{ color: 'var(--violet)' }}
            aria-hidden="true"
          />
          <p className="t-eyebrow min-w-0 flex-1">DOCUMENT VERIFICATION</p>
        </div>
        <p className="t-caption mt-3" style={{ color: 'var(--text-secondary)' }}>
          Complete your Identity Vault details above first — your document is verified
          against them.
        </p>
      </GlassCard>
    );
  }

  /* — (b) Already verified — */
  if (status.vaultStatus === 'verified' || verifiedNow) {
    return <VerifiedCard />;
  }

  const attempts = result ?? status;

  return (
    <GlassCard className="p-5">
      {/* Header: scan icon + eyebrow */}
      <div className="flex items-center gap-2.5">
        <ScanLine
          size={18}
          className="shrink-0"
          style={{ color: 'var(--violet)' }}
          aria-hidden="true"
        />
        <p className="t-eyebrow min-w-0 flex-1">DOCUMENT VERIFICATION</p>
      </div>
      <p className="t-caption mt-2.5" style={{ color: 'var(--text-secondary)' }}>
        Photograph your ID document and we&rsquo;ll match it against your Identity Vault
        details.
      </p>

      {/* Document type selector — segmented pills */}
      <div
        className="mt-4 flex gap-1 rounded-full p-1"
        style={{ background: 'var(--field)' }}
        role="radiogroup"
        aria-label="Document type"
      >
        {DOC_TYPES.map(({ value, label }) => {
          const active = docType === value;
          return (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={submitDoc.isPending}
              onClick={() => {
                setDocType(value);
                setResult(null);
              }}
              className={cn(
                't-micro min-h-[44px] min-w-0 flex-1 rounded-full px-2 font-bold transition-colors duration-fast',
                active ? 'text-white' : '',
              )}
              style={{
                background: active ? 'var(--violet)' : 'transparent',
                color: active ? undefined : 'var(--text-secondary)',
              }}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* Driver's license: not verifiable (no MRZ) */}
      {licenseSelected && (
        <div
          className="mt-3 flex gap-2.5 rounded-[16px] px-4 py-3"
          style={{ background: 'var(--field)' }}
        >
          <CircleAlert
            size={18}
            className="mt-0.5 shrink-0"
            style={{ color: 'var(--warn)' }}
            aria-hidden="true"
          />
          <p className="t-caption" style={{ color: 'var(--warn)' }}>
            Not verifiable yet — licenses don&rsquo;t have a machine-readable zone. Please
            use a passport or national ID.
          </p>
        </div>
      )}

      {/* Capture: dashed drop zone (tap opens the camera) */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        aria-label="Photograph your document"
        disabled={captureDisabled}
        onChange={handleFileChange}
      />
      {!previewUrl ? (
        <button
          type="button"
          disabled={captureDisabled}
          onClick={() => fileInputRef.current?.click()}
          className={cn(
            'mt-4 flex min-h-[44px] w-full flex-col items-center justify-center gap-2 rounded-[24px] border-2 border-dashed px-4 py-6 transition-opacity duration-fast',
            captureDisabled ? 'cursor-not-allowed opacity-50' : 'active:opacity-70',
          )}
          style={{ borderColor: 'var(--violet)', color: 'var(--violet)' }}
        >
          <Camera size={24} aria-hidden="true" />
          <span className="t-caption text-center font-bold">
            {docType === 'national_id'
              ? 'Tap to photograph the back with the code lines'
              : 'Tap to photograph the page with the code lines ≪ at the bottom'}
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
          <span className="t-caption min-w-0 flex-1" style={{ color: 'var(--text-secondary)' }}>
            Looks good? Verify it — or retake the photo.
          </span>
          <BtnGlass
            className="h-9 shrink-0 px-4"
            disabled={submitDoc.isPending}
            onClick={clearFile}
          >
            Retake
          </BtnGlass>
        </div>
      )}

      {/* Submit */}
      <BtnPrimary
        className="mt-4 w-full"
        disabled={!file || captureDisabled}
        onClick={() => void handleVerify()}
      >
        {submitDoc.isPending ? (
          <Loader2 size={18} className="animate-spin" aria-hidden="true" />
        ) : (
          <ScanLine size={17} aria-hidden="true" />
        )}
        Verify my document
      </BtnPrimary>

      {/* Staged progress (cosmetic) */}
      {submitDoc.isPending && (
        <p
          className="t-caption mt-3 text-center"
          style={{ color: 'var(--text-secondary)' }}
          role="status"
        >
          {STAGE_TEXTS[stage]}
        </p>
      )}

      {/* MISMATCH — amber panel with friendly field labels */}
      {result?.verdict === 'MISMATCH' && (
        <div
          className="mt-4 flex gap-2.5 rounded-[16px] px-4 py-3"
          style={{ background: 'var(--field)' }}
          role="alert"
        >
          <TriangleAlert
            size={18}
            className="mt-0.5 shrink-0"
            style={{ color: 'var(--warn)' }}
            aria-hidden="true"
          />
          <div className="min-w-0">
            <p className="t-caption font-bold" style={{ color: 'var(--warn)' }}>
              Some details don&rsquo;t match your vault:
            </p>
            {result.mismatches && result.mismatches.length > 0 && (
              <ul className="t-caption mt-1.5 list-disc pl-4" style={{ color: 'var(--warn)' }}>
                {result.mismatches.map((m) => (
                  <li key={m}>{mismatchLabel(m)}</li>
                ))}
              </ul>
            )}
            <p className="t-caption mt-1.5" style={{ color: 'var(--text-secondary)' }}>
              Fix your vault details above or retake the photo.
            </p>
          </div>
        </div>
      )}

      {/* UNREADABLE — reason + photo tips */}
      {result?.verdict === 'UNREADABLE' && (
        <div
          className="mt-4 flex gap-2.5 rounded-[16px] px-4 py-3"
          style={{ background: 'var(--field)' }}
          role="alert"
        >
          <FileWarning
            size={18}
            className="mt-0.5 shrink-0"
            style={{ color: 'var(--warn)' }}
            aria-hidden="true"
          />
          <div className="min-w-0">
            <p className="t-caption font-bold" style={{ color: 'var(--warn)' }}>
              {result.reason ?? 'We couldn\u2019t read your document.'}
            </p>
            <p className="t-caption mt-1.5" style={{ color: 'var(--text-secondary)' }}>
              Use good light, fill the frame, avoid glare, and make sure the ≪ code lines
              are visible.
            </p>
          </div>
        </div>
      )}

      {/* UNSUPPORTED — reason */}
      {result?.verdict === 'UNSUPPORTED' && (
        <div
          className="mt-4 flex gap-2.5 rounded-[16px] px-4 py-3"
          style={{ background: 'var(--field)' }}
          role="alert"
        >
          <CircleAlert
            size={18}
            className="mt-0.5 shrink-0"
            style={{ color: 'var(--warn)' }}
            aria-hidden="true"
          />
          <p className="t-caption" style={{ color: 'var(--warn)' }}>
            {result.reason ?? 'This document type isn\u2019t supported yet.'}
          </p>
        </div>
      )}

      {/* Attempts + privacy */}
      {attempts && (
        <p className="t-micro mt-4 px-1" style={{ color: 'var(--text-secondary)' }}>
          Attempt {attempts.attemptsToday} of {attempts.maxAttempts} today
        </p>
      )}
      <p className="t-micro mt-1.5 px-1" style={{ color: 'var(--text-secondary)' }}>
        Your photo is processed in memory and immediately discarded — it is never stored.
        Only the verification result is kept, linked to your customer number.
      </p>
    </GlassCard>
  );
}
