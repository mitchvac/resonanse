import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  Check,
  CircleAlert,
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  ShieldCheck,
  ShieldOff,
} from 'lucide-react';
import GlassCard from '@/components/GlassCard';
import GlassSheet from '@/components/GlassSheet';
import { BtnGlass, BtnPrimary } from '@/components/ui/buttons';
import { Toggle } from '@/components/settings/controls';
import { trpc } from '@/providers/trpc';
import { cn } from '@/lib/utils';
import {
  decryptSeed,
  encryptSeed,
  generateXrplWallet,
  KDF_LABEL,
  passwordStrength,
  WalletSecurityError,
} from '@/lib/walletSecurity/crypto';

/**
 * WalletSecuritySection — "YOUR KEYS, YOUR WALLET"
 *
 * Customer-controlled wallet keys for the Date-Coin ecosystem. The wallet
 * password IS the secret key: it derives the AES-GCM key that seals the XRPL
 * seed entirely in the browser (WebCrypto). The server only ever stores
 * ciphertext + salt + iv + kdf params — it never sees the password or a
 * plaintext seed.
 *
 * Plaintext seed lifetime: scoped to the create/unlock handlers and the
 * one-time recovery reveal (a ref, never state, never storage). JS can't
 * guarantee GC timing, so references are overwritten explicitly after use.
 */

const inputClass = cn(
  't-body h-11 w-full rounded-2xl px-4 outline-none transition-shadow duration-fast',
  'bg-field text-[var(--text)] placeholder:text-[var(--text-secondary)]',
  'focus-visible:ring-2 focus-visible:ring-violet/40',
);

/** Middle-ellipsis for the public XRPL address. */
function ellipsize(address: string): string {
  if (address.length <= 16) return address;
  return `${address.slice(0, 8)}…${address.slice(-6)}`;
}

/** tRPC TOO_MANY_REQUESTS without importing server types. */
function isTooManyRequests(err: unknown): boolean {
  if (typeof err !== 'object' || err === null || !('data' in err)) return false;
  const data = (err as { data?: { code?: unknown } }).data;
  return data?.code === 'TOO_MANY_REQUESTS';
}

/* — Copy button with Check feedback (44px touch target) — */
function CopyButton({ text, ariaLabel }: { text: string; ariaLabel: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(t);
  }, [copied]);
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onClick={() => {
        void navigator.clipboard
          .writeText(text)
          .then(() => setCopied(true))
          .catch(() => undefined);
      }}
      className="flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-full transition-opacity duration-fast active:opacity-70"
      style={{ color: copied ? 'var(--ok)' : 'var(--text-secondary)' }}
    >
      {copied ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
    </button>
  );
}

/* — Password input with show/hide eye (44px row) — */
function PasswordField({
  label,
  value,
  onChange,
  autoComplete,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete: string;
  disabled?: boolean;
}) {
  const [show, setShow] = useState(false);
  return (
    <label className="block">
      <span className="t-caption mb-1.5 block font-bold" style={{ color: 'var(--text)' }}>
        {label}
      </span>
      <span className="relative block">
        <input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          disabled={disabled}
          className={cn(inputClass, 'pr-12')}
        />
        <button
          type="button"
          aria-label={show ? 'Hide password' : 'Show password'}
          onClick={() => setShow((s) => !s)}
          className="absolute inset-y-0 right-0 flex w-11 items-center justify-center"
          style={{ color: 'var(--text-secondary)' }}
        >
          {show ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
        </button>
      </span>
    </label>
  );
}

/* — Create wallet password sheet — */
function CreateWalletSheet({
  open,
  busy,
  onClose,
  onSubmit,
}: {
  open: boolean;
  busy: boolean;
  onClose: () => void;
  onSubmit: (password: string) => void;
}) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  useEffect(() => {
    if (!open) {
      // Wipe field contents whenever the sheet closes — passwords are
      // ephemeral and must not linger in unmounted component state.
      setPassword('');
      setConfirm('');
    }
  }, [open]);

  const strength = passwordStrength(password);
  const matches = confirm.length > 0 && password === confirm;
  const valid = password.length >= 12 && strength.score >= 2 && matches;

  return (
    <GlassSheet open={open} onClose={busy ? () => undefined : onClose} labelledBy="wallet-create-title">
      <div className="px-5 pb-8">
        <h3 id="wallet-create-title" className="t-title-sm" style={{ color: 'var(--text)' }}>
          Create your wallet password
        </h3>
        <div className="mt-4 flex flex-col gap-4">
          <div>
            <PasswordField
              label="Wallet password"
              value={password}
              onChange={setPassword}
              autoComplete="new-password"
              disabled={busy}
            />
            {/* Strength meter — thin violet→ok bar + label */}
            <div className="mt-2 flex items-center gap-2.5">
              <div
                className="h-1 flex-1 rounded-full"
                style={{ background: 'var(--field)' }}
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={4}
                aria-valuenow={strength.score}
                aria-label="Password strength"
              >
                <div
                  className="h-1 rounded-full transition-all duration-med"
                  style={{
                    width: `${(strength.score / 4) * 100}%`,
                    background: strength.score >= 3 ? 'var(--ok)' : 'var(--violet)',
                  }}
                />
              </div>
              <span className="t-micro w-16 text-right" style={{ color: 'var(--text-secondary)' }}>
                {password.length > 0 ? strength.label : ''}
              </span>
            </div>
            {password.length > 0 && password.length < 12 && (
              <p className="t-micro mt-1.5" style={{ color: 'var(--text-secondary)' }}>
                Use at least 12 characters.
              </p>
            )}
          </div>
          <div>
            <PasswordField
              label="Confirm password"
              value={confirm}
              onChange={setConfirm}
              autoComplete="new-password"
              disabled={busy}
            />
            {confirm.length > 0 && !matches && (
              <p className="t-micro mt-1.5" style={{ color: 'var(--danger)' }}>
                Passwords don&rsquo;t match.
              </p>
            )}
          </div>
        </div>

        {/* Non-recoverable warning */}
        <div
          className="mt-4 flex gap-2.5 rounded-[16px] px-4 py-3"
          style={{ background: 'var(--field)' }}
        >
          <CircleAlert
            size={18}
            className="mt-0.5 shrink-0"
            style={{ color: 'var(--warn)' }}
            aria-hidden="true"
          />
          <p className="t-caption" style={{ color: 'var(--warn)' }}>
            This password is your secret key. Write it down. Resonance never sees it and cannot
            recover it — losing it means losing your wallet.
          </p>
        </div>

        <BtnPrimary
          className="mt-5 w-full"
          disabled={!valid || busy}
          onClick={() => onSubmit(password)}
        >
          {busy ? (
            <Loader2 size={18} className="animate-spin" aria-hidden="true" />
          ) : (
            'Seal my wallet'
          )}
        </BtnPrimary>
      </div>
    </GlassSheet>
  );
}

/* — Unlock sheet (turn system access ON) — */
function UnlockSheet({
  open,
  busy,
  error,
  onClose,
  onSubmit,
}: {
  open: boolean;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (password: string) => void;
}) {
  const [password, setPassword] = useState('');
  useEffect(() => {
    if (!open) setPassword('');
  }, [open]);

  return (
    <GlassSheet open={open} onClose={busy ? () => undefined : onClose} labelledBy="wallet-unlock-title">
      <div className="px-5 pb-8">
        <h3 id="wallet-unlock-title" className="t-title-sm" style={{ color: 'var(--text)' }}>
          Unlock with your wallet password
        </h3>
        <p className="t-caption mt-2" style={{ color: 'var(--text-secondary)' }}>
          Your password proves the key is yours. It never leaves this device.
        </p>
        <div className="mt-4">
          <PasswordField
            label="Wallet password"
            value={password}
            onChange={setPassword}
            autoComplete="current-password"
            disabled={busy}
          />
          {error && (
            <p
              className="t-caption mt-2 flex items-center gap-1.5"
              style={{ color: 'var(--danger)' }}
              role="alert"
            >
              <CircleAlert size={14} aria-hidden="true" />
              {error}
            </p>
          )}
        </div>
        <BtnPrimary
          className="mt-5 w-full"
          disabled={password.length === 0 || busy}
          onClick={() => onSubmit(password)}
        >
          {busy ? (
            <Loader2 size={18} className="animate-spin" aria-hidden="true" />
          ) : (
            'Turn on system access'
          )}
        </BtnPrimary>
      </div>
    </GlassSheet>
  );
}

/* — One-time recovery words reveal (explicit confirm first) — */
function RecoverySheet({
  open,
  revealed,
  seed,
  onReveal,
  onClose,
}: {
  open: boolean;
  revealed: boolean;
  /** Plaintext seed — read from a ref at render time only while revealed. */
  seed: string | null;
  onReveal: () => void;
  onClose: () => void;
}) {
  return (
    <GlassSheet open={open} onClose={onClose} labelledBy="wallet-recovery-title">
      <div className="px-5 pb-8">
        <h3 id="wallet-recovery-title" className="t-title-sm" style={{ color: 'var(--text)' }}>
          {revealed ? 'Your recovery words' : 'Show recovery words?'}
        </h3>
        {!revealed ? (
          <>
            <div
              className="mt-4 flex gap-2.5 rounded-[16px] px-4 py-3"
              style={{ background: 'var(--field)' }}
            >
              <CircleAlert
                size={18}
                className="mt-0.5 shrink-0"
                style={{ color: 'var(--warn)' }}
                aria-hidden="true"
              />
              <p className="t-caption" style={{ color: 'var(--warn)' }}>
                Anyone with these words controls your coins. Only reveal them somewhere private.
              </p>
            </div>
            <BtnPrimary className="mt-5 w-full" onClick={onReveal}>
              I understand — reveal them
            </BtnPrimary>
            <BtnGlass className="mt-2.5 w-full" onClick={onClose}>
              Cancel
            </BtnGlass>
          </>
        ) : (
          <>
            <div
              className="mt-4 flex items-center gap-1 rounded-[16px] px-4 py-3"
              style={{ background: 'var(--field)' }}
            >
              <span
                className="t-caption min-w-0 flex-1 break-all font-mono"
                style={{ color: 'var(--text)' }}
              >
                {seed ?? ''}
              </span>
              {seed && <CopyButton text={seed} ariaLabel="Copy recovery words" />}
            </div>
            <p className="t-micro mt-2.5" style={{ color: 'var(--text-secondary)' }}>
              Shown once — store it offline. Later, your wallet password unlocks it again.
            </p>
            <BtnPrimary className="mt-5 w-full" onClick={onClose}>
              Done — I&rsquo;ve stored it
            </BtnPrimary>
          </>
        )}
      </div>
    </GlassSheet>
  );
}

export default function WalletSecuritySection({
  onToast,
  onError,
}: {
  onToast: (message: string, icon?: ReactNode) => void;
  onError: (message: string) => void;
}) {
  const utils = trpc.useUtils();
  const statusQuery = trpc.walletSecurity.status.useQuery(undefined, { retry: 1 });
  const status = statusQuery.data ?? null;

  const provision = trpc.walletSecurity.provision.useMutation();
  const grant = trpc.walletSecurity.grant.useMutation();
  const revoke = trpc.walletSecurity.revoke.useMutation();

  const [createOpen, setCreateOpen] = useState(false);
  const [createBusy, setCreateBusy] = useState(false);
  const [unlockOpen, setUnlockOpen] = useState(false);
  const [unlockBusy, setUnlockBusy] = useState(false);
  const [unlockError, setUnlockError] = useState<string | null>(null);

  /**
   * One-time recovery reveal: the plaintext seed lives ONLY in this ref —
   * component memory, never React state, never localStorage. (JS can't
   * guarantee GC of strings, so we overwrite the reference explicitly and
   * the lifetime ends when the reveal closes or the section unmounts.)
   */
  const seedRef = useRef<string | null>(null);
  const [recoveryAvailable, setRecoveryAvailable] = useState(false);
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const [recoveryRevealed, setRecoveryRevealed] = useState(false);

  const wipeSeed = useCallback(() => {
    seedRef.current = null;
  }, []);
  useEffect(() => wipeSeed, [wipeSeed]);

  /* — Create: generate → seal client-side → provision ciphertext only — */
  const handleCreate = async (password: string) => {
    setCreateBusy(true);
    try {
      const generated = await generateXrplWallet();
      const sealed = await encryptSeed(password, generated.seed);
      await provision.mutateAsync({
        walletId: `wk_${crypto.randomUUID()}`,
        xrplAddress: generated.address,
        ciphertext: sealed.ciphertextB64,
        salt: sealed.saltB64,
        iv: sealed.ivB64,
      });
      // Keep the plaintext for the ONE-TIME recovery reveal only (ref, not
      // state/storage); overwrite the handler-local reference immediately.
      seedRef.current = generated.seed;
      generated.seed = '';
      setRecoveryAvailable(true);
      setCreateOpen(false);
      void utils.walletSecurity.status.invalidate();
      onToast(
        'Wallet created — only your password controls it.',
        <ShieldCheck size={14} style={{ color: 'var(--ok)' }} aria-hidden="true" />,
      );
    } catch {
      onError("Couldn't create your wallet — try again.");
    } finally {
      setCreateBusy(false);
    }
  };

  /* — Turn ON: fetch sealed payload → decrypt locally → grant — */
  const handleUnlock = async (password: string) => {
    setUnlockBusy(true);
    setUnlockError(null);
    let seed: string | null = null;
    try {
      const payload = await utils.walletSecurity.unlockPayload.fetch();
      if (payload.kdf !== KDF_LABEL) {
        throw new WalletSecurityError('DECRYPT_FAILED', 'Unsupported KDF');
      }
      // Custody is proven entirely on-device: decrypting with the wallet
      // password is the unlock. The plaintext seed never leaves this handler.
      seed = await decryptSeed(password, {
        ciphertextB64: payload.ciphertext,
        saltB64: payload.salt,
        ivB64: payload.iv,
      });
      // Existence check is the only read — a successful decrypt IS the proof.
      if (seed.length === 0) {
        throw new WalletSecurityError('DECRYPT_FAILED', 'Empty seed');
      }
      seed = null; // wipe the reference — GC timing isn't guaranteed
      await grant.mutateAsync();
      void utils.walletSecurity.status.invalidate();
      setUnlockOpen(false);
      onToast(
        "System access on — you're in the ecosystem.",
        <ShieldCheck size={14} style={{ color: 'var(--ok)' }} aria-hidden="true" />,
      );
    } catch (err) {
      if (err instanceof WalletSecurityError && err.code === 'WRONG_PASSWORD') {
        setUnlockError("That password doesn't match this wallet.");
      } else if (isTooManyRequests(err)) {
        setUnlockError('Too many attempts — wait a few minutes and try again.');
      } else {
        setUnlockError("Couldn't turn on system access — try again.");
      }
    } finally {
      seed = null;
      setUnlockBusy(false);
    }
  };

  /* — Turn OFF: instant revoke, no password, always allowed — */
  const handleRevoke = async () => {
    try {
      await revoke.mutateAsync();
      void utils.walletSecurity.status.invalidate();
      onToast(
        'Switched off. Only your password can move your coins.',
        <ShieldOff size={14} style={{ color: 'var(--warn)' }} aria-hidden="true" />,
      );
    } catch {
      onError("Couldn't switch off — try again.");
    }
  };

  const closeRecovery = () => {
    setRecoveryOpen(false);
    if (recoveryRevealed) {
      // Shown once — wipe the plaintext and never offer the reveal again.
      // (Unlocking with the password later IS the recovery path.)
      wipeSeed();
      setRecoveryAvailable(false);
      setRecoveryRevealed(false);
    }
  };

  /* — Skeleton — */
  if (statusQuery.isLoading) {
    return (
      <div
        className="skeleton-shimmer h-44 rounded-[24px]"
        style={{ background: 'var(--field)' }}
        aria-label="Loading wallet keys"
      />
    );
  }

  /* — Error — */
  if (statusQuery.isError) {
    return (
      <GlassCard className="flex items-center justify-between gap-3 p-5">
        <span className="t-caption" style={{ color: 'var(--text-secondary)' }}>
          Couldn&rsquo;t load your wallet keys.
        </span>
        <BtnGlass className="h-9 px-4" onClick={() => void statusQuery.refetch()}>
          Retry
        </BtnGlass>
      </GlassCard>
    );
  }

  const hasWallet = status?.hasWallet === true;
  const address = status?.xrplAddress ?? null;
  const participating = status?.delegation.status === 'active';
  const switchBusy = revoke.isPending || unlockBusy;

  return (
    <>
      {!hasWallet ? (
        /* — No wallet yet — */
        <GlassCard className="p-5">
          <p className="t-eyebrow">YOUR KEYS, YOUR WALLET</p>
          <h2 className="t-title-sm mt-1" style={{ color: 'var(--text)' }}>
            You hold the only key.
          </h2>
          <p className="t-caption mt-2.5" style={{ color: 'var(--text-secondary)' }}>
            Create a wallet password and your wallet key is generated on this device and sealed
            with it. We never see your password — and we can&rsquo;t recover it.
          </p>
          <BtnPrimary className="mt-4 w-full" onClick={() => setCreateOpen(true)}>
            <KeyRound size={17} aria-hidden="true" />
            Create wallet password
          </BtnPrimary>
        </GlassCard>
      ) : (
        /* — Has wallet: address + participation — */
        <GlassCard className="p-5">
          <p className="t-eyebrow">YOUR KEYS, YOUR WALLET</p>
          {address && (
            <div
              className="mt-3 flex items-center gap-1 rounded-[16px] py-1 pl-4 pr-1"
              style={{ background: 'var(--field)' }}
            >
              <span
                className="t-caption min-w-0 flex-1 truncate font-mono"
                style={{ color: 'var(--text)' }}
                title={address}
              >
                {ellipsize(address)}
              </span>
              <CopyButton text={address} ariaLabel="Copy wallet address" />
            </div>
          )}

          {/* Customer number — the ONLY identifier Resonance stores for this wallet */}
          {status?.customerRef && (
            <div className="mt-3">
              <div
                className="flex items-center gap-1 rounded-[16px] py-1 pl-4 pr-1"
                style={{ background: 'var(--field)' }}
              >
                <span className="min-w-0 flex-1">
                  <span
                    className="t-micro block"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    CUSTOMER NUMBER
                  </span>
                  <span
                    className="t-caption block font-mono font-bold"
                    style={{ color: 'var(--text)' }}
                  >
                    {status.customerRef}
                  </span>
                </span>
                <CopyButton text={status.customerRef} ariaLabel="Copy customer number" />
              </div>
              <p className="t-micro mt-1.5 px-1" style={{ color: 'var(--text-secondary)' }}>
                This number is how Resonance recognizes your wallet. No name, email or
                personal details are attached to it — your identity documents stay with
                the verification provider, not with us.
              </p>
            </div>
          )}

          {/* Participation: status pill + switch */}
          <div className="mt-4 flex items-center gap-3">
            <span
              className="t-micro inline-flex min-w-0 flex-1 items-center gap-1.5 rounded-full px-2.5 py-1 font-bold"
              style={
                participating
                  ? { background: 'var(--field)', color: 'var(--ok)' }
                  : { background: 'var(--stage-base)', color: 'var(--text-secondary)' }
              }
            >
              {participating && (
                <span
                  className="h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ background: 'var(--ok)' }}
                  aria-hidden="true"
                />
              )}
              <span className="truncate">
                {participating ? 'Participating · system access on' : 'Switched off'}
              </span>
            </span>
            {switchBusy ? (
              <Loader2
                size={22}
                className="shrink-0 animate-spin"
                style={{ color: 'var(--violet)' }}
                aria-label="Updating system access"
              />
            ) : (
              <Toggle
                checked={participating}
                disabled={switchBusy}
                ariaLabel="Date-Coin ecosystem system access"
                onChange={(next) => {
                  if (next) {
                    setUnlockError(null);
                    setUnlockOpen(true);
                  } else {
                    void handleRevoke();
                  }
                }}
              />
            )}
          </div>
          <p className="t-caption mt-2.5" style={{ color: 'var(--text-secondary)' }}>
            {participating
              ? 'System access is on. Flip off any time — access ends instantly and only your password can move your coins.'
              : "The platform can't touch your coins. Flip on to trade, earn and spend in the Date-Coin ecosystem."}
          </p>

          {/* One-time recovery words — only right after creation */}
          {recoveryAvailable && !recoveryRevealed && (
            <BtnGlass className="mt-4 w-full" onClick={() => setRecoveryOpen(true)}>
              Show recovery words
            </BtnGlass>
          )}
        </GlassCard>
      )}

      <CreateWalletSheet
        open={createOpen}
        busy={createBusy}
        onClose={() => setCreateOpen(false)}
        onSubmit={(pw) => void handleCreate(pw)}
      />
      <UnlockSheet
        open={unlockOpen}
        busy={unlockBusy}
        error={unlockError}
        onClose={() => setUnlockOpen(false)}
        onSubmit={(pw) => void handleUnlock(pw)}
      />
      <RecoverySheet
        open={recoveryOpen}
        revealed={recoveryRevealed}
        seed={recoveryRevealed ? seedRef.current : null}
        onReveal={() => setRecoveryRevealed(true)}
        onClose={closeRecovery}
      />
    </>
  );
}
