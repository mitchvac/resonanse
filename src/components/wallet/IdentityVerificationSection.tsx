import { useState } from 'react';
import type { ReactNode } from 'react';
import {
  Check,
  CircleAlert,
  Copy,
  Download,
  Loader2,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import type { inferRouterOutputs } from '@trpc/server';
import GlassCard from '@/components/GlassCard';
import { BtnGlass, BtnPrimary } from '@/components/ui/buttons';
import { trpc } from '@/providers/trpc';
import { cn } from '@/lib/utils';
import type { AppRouter } from '../../../api/router';

/**
 * IdentityVerificationSection — "IDENTITY VAULT" (self-hosted KYC Phase 1)
 *
 * The customer's legal identity (name/DOB/address/TIN) is sealed server-side
 * into a single AES-256-GCM envelope and linked ONLY to the pseudonymous
 * customer number (RC-…). This section never sees a userId-shaped record:
 * status is PII-free, the form submits plaintext over TLS, and the only
 * plaintext that ever comes back is the customer's own record via `export`.
 */

type VaultRecord = inferRouterOutputs<AppRouter>['identityVault']['export'];

type DocType = 'passport' | 'drivers_license' | 'national_id';

type FormState = {
  legalName: string;
  dob: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  region: string;
  postalCode: string;
  country: string;
  taxId: string;
  docType: '' | DocType;
  docNumber: string;
};

const EMPTY_FORM: FormState = {
  legalName: '',
  dob: '',
  addressLine1: '',
  addressLine2: '',
  city: '',
  region: '',
  postalCode: '',
  country: '',
  taxId: '',
  docType: '',
  docNumber: '',
};

const DOC_TYPE_LABELS: Record<DocType, string> = {
  passport: 'Passport',
  drivers_license: "Driver's license",
  national_id: 'National ID',
};

const EXPORT_ROWS: [Extract<keyof VaultRecord, string>, string][] = [
  ['legalName', 'Legal name'],
  ['dob', 'Date of birth'],
  ['addressLine1', 'Address line 1'],
  ['addressLine2', 'Address line 2'],
  ['city', 'City'],
  ['region', 'Region / State'],
  ['postalCode', 'Postal code'],
  ['country', 'Country'],
  ['taxId', 'Tax ID / TIN'],
  ['docType', 'Document'],
  ['docNumber', 'Document number'],
];

const inputClass = cn(
  't-body h-11 w-full rounded-2xl px-4 outline-none transition-shadow duration-fast',
  'bg-field text-[var(--text)] placeholder:text-[var(--text-secondary)]',
  'focus-visible:ring-2 focus-visible:ring-violet/40',
);

/** Latest allowed DOB: exactly 18 years ago today. */
function maxDob(): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 18);
  return d.toISOString().slice(0, 10);
}

/** Pull a human message out of a tRPC/network error without `any`. */
function errorMessage(err: unknown, fallback: string): string {
  if (typeof err === 'object' && err !== null && 'message' in err) {
    const message = (err as { message?: unknown }).message;
    if (typeof message === 'string' && message.length > 0) return message;
  }
  return fallback;
}

/* — Copy button with Check feedback (mirrors WalletSecuritySection) — */
function CopyButton({ text, ariaLabel }: { text: string; ariaLabel: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onClick={() => {
        void navigator.clipboard
          .writeText(text)
          .then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          })
          .catch(() => undefined);
      }}
      className="flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-full transition-opacity duration-fast active:opacity-70"
      style={{ color: copied ? 'var(--ok)' : 'var(--text-secondary)' }}
    >
      {copied ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
    </button>
  );
}

/* — Labelled text/date input matching the wallet form language — */
function TextField({
  label,
  value,
  onChange,
  type = 'text',
  autoComplete,
  maxLength,
  max,
  placeholder,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  autoComplete?: string;
  maxLength?: number;
  max?: string;
  placeholder?: string;
  disabled?: boolean;
}) {
  return (
    <label className="block">
      <span className="t-caption mb-1.5 block font-bold" style={{ color: 'var(--text)' }}>
        {label}
      </span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        maxLength={maxLength}
        max={max}
        placeholder={placeholder}
        disabled={disabled}
        className={inputClass}
      />
    </label>
  );
}

export default function IdentityVerificationSection({
  onToast,
  onError,
}: {
  onToast: (message: string, icon?: ReactNode) => void;
  onError: (message: string) => void;
}) {
  const utils = trpc.useUtils();
  const walletQuery = trpc.walletSecurity.status.useQuery(undefined, { retry: 1 });
  const hasWallet = walletQuery.data?.hasWallet === true;
  const customerRef = walletQuery.data?.customerRef ?? null;

  const statusQuery = trpc.identityVault.status.useQuery(undefined, {
    enabled: hasWallet,
    retry: 1,
  });
  const upsert = trpc.identityVault.upsert.useMutation();
  const purge = trpc.identityVault.purge.useMutation();

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [editing, setEditing] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [exported, setExported] = useState<VaultRecord | null>(null);
  const [exportBusy, setExportBusy] = useState(false);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const hasRecord = statusQuery.data?.hasRecord === true;
  const vaultStatus = statusQuery.data?.status ?? null;
  const showForm = hasWallet && (!hasRecord || editing);

  /* — Submit: strip empty optionals, seal server-side via upsert — */
  const handleSubmit = async () => {
    setFormError(null);
    const payload = {
      legalName: form.legalName.trim(),
      dob: form.dob,
      addressLine1: form.addressLine1.trim(),
      ...(form.addressLine2.trim() ? { addressLine2: form.addressLine2.trim() } : {}),
      city: form.city.trim(),
      region: form.region.trim(),
      postalCode: form.postalCode.trim(),
      country: form.country.trim().toUpperCase(),
      ...(form.taxId.trim() ? { taxId: form.taxId.trim() } : {}),
      ...(form.docType ? { docType: form.docType } : {}),
      ...(form.docNumber.trim() ? { docNumber: form.docNumber.trim() } : {}),
    };
    try {
      await upsert.mutateAsync(payload);
      setEditing(false);
      void utils.identityVault.status.invalidate();
      onToast(
        'Identity details stored — encrypted end to end.',
        <ShieldCheck size={14} style={{ color: 'var(--ok)' }} aria-hidden="true" />,
      );
    } catch (err) {
      setFormError(errorMessage(err, "Couldn't store your details — try again."));
    }
  };

  /* — Download own record: decrypted server-side, shown read-only — */
  const handleExport = async () => {
    setExportBusy(true);
    try {
      const data = await utils.identityVault.export.fetch();
      setExported(data);
    } catch (err) {
      onError(errorMessage(err, "Couldn't download your record — try again."));
    } finally {
      setExportBusy(false);
    }
  };

  /* — Delete record: explicit confirm, instant purge — */
  const handlePurge = async () => {
    if (
      !window.confirm(
        'Delete your encrypted identity record? This cannot be undone.',
      )
    ) {
      return;
    }
    try {
      await purge.mutateAsync();
      setExported(null);
      setForm(EMPTY_FORM);
      setEditing(false);
      void utils.identityVault.status.invalidate();
      onToast(
        'Identity record deleted.',
        <Trash2 size={14} style={{ color: 'var(--warn)' }} aria-hidden="true" />,
      );
    } catch (err) {
      onError(errorMessage(err, "Couldn't delete your record — try again."));
    }
  };

  /* — Skeleton — */
  if (walletQuery.isLoading) {
    return (
      <div
        className="skeleton-shimmer h-44 rounded-[24px]"
        style={{ background: 'var(--field)' }}
        aria-label="Loading identity vault"
      />
    );
  }

  /* — Wallet error — */
  if (walletQuery.isError) {
    return (
      <GlassCard className="flex items-center justify-between gap-3 p-5">
        <span className="t-caption" style={{ color: 'var(--text-secondary)' }}>
          Couldn&rsquo;t load your identity vault.
        </span>
        <BtnGlass className="h-9 px-4" onClick={() => void walletQuery.refetch()}>
          Retry
        </BtnGlass>
      </GlassCard>
    );
  }

  /* — No wallet yet: the customerRef link doesn't exist — */
  if (!hasWallet) {
    return (
      <GlassCard className="p-5">
        <p className="t-eyebrow">IDENTITY VAULT</p>
        <h2 className="t-title-sm mt-1" style={{ color: 'var(--text)' }}>
          Set up your wallet first.
        </h2>
        <p className="t-caption mt-2.5" style={{ color: 'var(--text-secondary)' }}>
          Your identity record is linked only to your customer number — create your
          wallet above to get one, then come back here.
        </p>
      </GlassCard>
    );
  }

  const pill =
    !hasRecord || vaultStatus === null
      ? { label: 'Not submitted', color: 'var(--text-secondary)', bg: 'var(--stage-base)' }
      : vaultStatus === 'verified'
        ? { label: 'Verified', color: 'var(--ok)', bg: 'var(--field)' }
        : vaultStatus === 'suspended'
          ? { label: 'Suspended', color: 'var(--danger)', bg: 'var(--field)' }
          : { label: 'Unverified', color: 'var(--warn)', bg: 'var(--field)' };

  return (
    <GlassCard className="p-5">
      {/* Header: shield + eyebrow + status pill */}
      <div className="flex items-center gap-2.5">
        <ShieldCheck
          size={18}
          className="shrink-0"
          style={{ color: 'var(--violet)' }}
          aria-hidden="true"
        />
        <p className="t-eyebrow min-w-0 flex-1">IDENTITY VAULT</p>
        <span
          className="t-micro inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 font-bold"
          style={{ background: pill.bg, color: pill.color }}
        >
          {hasRecord && (
            <span
              className="h-1.5 w-1.5 shrink-0 rounded-full"
              style={{ background: pill.color }}
              aria-hidden="true"
            />
          )}
          {pill.label}
        </span>
      </div>

      {/* Customer number — the ONLY link between this record and the account */}
      {customerRef && (
        <div
          className="mt-3 flex items-center gap-1 rounded-[16px] py-1 pl-4 pr-1"
          style={{ background: 'var(--field)' }}
        >
          <span className="min-w-0 flex-1">
            <span className="t-micro block" style={{ color: 'var(--text-secondary)' }}>
              CUSTOMER NUMBER
            </span>
            <span className="t-caption block font-mono font-bold" style={{ color: 'var(--text)' }}>
              {customerRef}
            </span>
          </span>
          <CopyButton text={customerRef} ariaLabel="Copy customer number" />
        </div>
      )}

      <p className="t-caption mt-2.5" style={{ color: 'var(--text-secondary)' }}>
        Your legal identity is stored encrypted and linked only by your customer number
        — no name or email is attached to it on our systems. Used only for tax
        reporting and verification.
      </p>

      {hasWallet && statusQuery.isLoading && (
        <div className="mt-4 flex justify-center">
          <Loader2
            size={22}
            className="animate-spin"
            style={{ color: 'var(--violet)' }}
            aria-label="Loading identity record status"
          />
        </div>
      )}

      {/* — Form: first submission or explicit "Update details" — */}
      {showForm && !statusQuery.isLoading && (
        <div className="mt-4 flex flex-col gap-4">
          <TextField
            label="Legal name"
            value={form.legalName}
            onChange={(v) => set('legalName', v)}
            autoComplete="name"
            maxLength={200}
            disabled={upsert.isPending}
          />
          <TextField
            label="Date of birth"
            type="date"
            value={form.dob}
            onChange={(v) => set('dob', v)}
            autoComplete="bday"
            max={maxDob()}
            disabled={upsert.isPending}
          />
          <TextField
            label="Address line 1"
            value={form.addressLine1}
            onChange={(v) => set('addressLine1', v)}
            autoComplete="address-line1"
            maxLength={200}
            disabled={upsert.isPending}
          />
          <TextField
            label="Address line 2 (optional)"
            value={form.addressLine2}
            onChange={(v) => set('addressLine2', v)}
            autoComplete="address-line2"
            maxLength={200}
            disabled={upsert.isPending}
          />
          <TextField
            label="City"
            value={form.city}
            onChange={(v) => set('city', v)}
            autoComplete="address-level2"
            maxLength={100}
            disabled={upsert.isPending}
          />
          <TextField
            label="Region / State"
            value={form.region}
            onChange={(v) => set('region', v)}
            autoComplete="address-level1"
            maxLength={100}
            disabled={upsert.isPending}
          />
          <TextField
            label="Postal code"
            value={form.postalCode}
            onChange={(v) => set('postalCode', v)}
            autoComplete="postal-code"
            maxLength={20}
            disabled={upsert.isPending}
          />
          <TextField
            label="Country (2-letter code)"
            value={form.country}
            onChange={(v) => set('country', v.toUpperCase())}
            autoComplete="country"
            maxLength={2}
            placeholder="GB"
            disabled={upsert.isPending}
          />
          <TextField
            label="Tax ID / TIN (optional)"
            value={form.taxId}
            onChange={(v) => set('taxId', v)}
            maxLength={64}
            disabled={upsert.isPending}
          />
          <label className="block">
            <span className="t-caption mb-1.5 block font-bold" style={{ color: 'var(--text)' }}>
              ID document (optional)
            </span>
            <select
              value={form.docType}
              onChange={(e) => set('docType', e.target.value as FormState['docType'])}
              disabled={upsert.isPending}
              className={cn(inputClass, 'appearance-none')}
            >
              <option value="">None</option>
              <option value="passport">Passport</option>
              <option value="drivers_license">Driver&rsquo;s license</option>
              <option value="national_id">National ID</option>
            </select>
          </label>
          {form.docType !== '' && (
            <TextField
              label="Document number (optional)"
              value={form.docNumber}
              onChange={(v) => set('docNumber', v)}
              maxLength={64}
              disabled={upsert.isPending}
            />
          )}

          {formError && (
            <p
              className="t-caption flex items-center gap-1.5"
              style={{ color: 'var(--danger)' }}
              role="alert"
            >
              <CircleAlert size={14} aria-hidden="true" />
              {formError}
            </p>
          )}

          <BtnPrimary
            className="w-full"
            disabled={upsert.isPending}
            onClick={() => void handleSubmit()}
          >
            {upsert.isPending ? (
              <Loader2 size={18} className="animate-spin" aria-hidden="true" />
            ) : hasRecord ? (
              'Save updated details'
            ) : (
              'Store my identity details'
            )}
          </BtnPrimary>
          {hasRecord && (
            <BtnGlass
              className="w-full"
              disabled={upsert.isPending}
              onClick={() => {
                setEditing(false);
                setFormError(null);
              }}
            >
              Cancel
            </BtnGlass>
          )}
        </div>
      )}

      {/* — Existing record: actions + optional decrypted summary — */}
      {hasRecord && !editing && !statusQuery.isLoading && (
        <div className="mt-4 flex flex-col gap-2.5">
          {statusQuery.data?.submittedAt && (
            <p className="t-micro px-1" style={{ color: 'var(--text-secondary)' }}>
              First submitted{' '}
              {new Date(statusQuery.data.submittedAt).toLocaleDateString(undefined, {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            </p>
          )}
          <BtnGlass
            className="w-full"
            disabled={exportBusy || purge.isPending}
            onClick={() => setEditing(true)}
          >
            Update details
          </BtnGlass>
          <BtnGlass
            className="w-full"
            disabled={exportBusy || purge.isPending}
            onClick={() => void handleExport()}
          >
            {exportBusy ? (
              <Loader2 size={17} className="animate-spin" aria-hidden="true" />
            ) : (
              <Download size={16} aria-hidden="true" />
            )}
            Download my record
          </BtnGlass>

          {exported && (
            <div
              className="rounded-[16px] px-4 py-3"
              style={{ background: 'var(--field)' }}
            >
              <p className="t-micro mb-2" style={{ color: 'var(--text-secondary)' }}>
                This is your data as we hold it — decrypted just for you, read-only.
              </p>
              <dl className="flex flex-col gap-1.5">
                {EXPORT_ROWS.filter(([key]) => {
                  const value = exported[key];
                  return value !== undefined && value !== '';
                }).map(([key, label]) => (
                  <div key={key} className="flex items-baseline justify-between gap-3">
                    <dt
                      className="t-micro shrink-0"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      {label}
                    </dt>
                    <dd
                      className="t-caption min-w-0 break-words text-right"
                      style={{ color: 'var(--text)' }}
                    >
                      {key === 'docType'
                        ? DOC_TYPE_LABELS[exported[key] as DocType]
                        : String(exported[key])}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          )}

          <BtnGlass
            className="w-full"
            disabled={purge.isPending || exportBusy}
            onClick={() => void handlePurge()}
          >
            {purge.isPending ? (
              <Loader2 size={17} className="animate-spin" aria-hidden="true" />
            ) : (
              <Trash2 size={16} style={{ color: 'var(--danger)' }} aria-hidden="true" />
            )}
            <span style={{ color: 'var(--danger)' }}>Delete record</span>
          </BtnGlass>
        </div>
      )}
    </GlassCard>
  );
}
