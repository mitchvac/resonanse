import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { motion } from 'framer-motion';
import { Eye, EyeOff, Loader2, ShieldCheck } from 'lucide-react';
import BrandMark from '@/components/BrandMark';
import GlassCard from '@/components/GlassCard';
import StageBackdrop from '@/components/StageBackdrop';
import { BtnPrimary } from '@/components/ui/buttons';
import { trpc } from '@/providers/trpc';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';

const inputClass = cn(
  't-body h-12 w-full rounded-2xl px-4 outline-none transition-shadow duration-fast',
  'bg-field text-[var(--text)] placeholder:text-[var(--text-secondary)]',
  'focus-visible:ring-2 focus-visible:ring-violet/40',
);

function PasswordField({
  label,
  value,
  onChange,
  error,
  autoComplete,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  autoComplete: string;
}) {
  const [show, setShow] = useState(false);
  const { t } = useTranslation('landing');
  return (
    <label className="block">
      <span className="t-caption mb-1.5 block font-bold" style={{ color: 'var(--text)' }}>
        {label}
      </span>
      <span className="relative block">
        <input
          type={show ? 'text' : 'password'}
          autoComplete={autoComplete}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="••••••••"
          maxLength={128}
          className={cn(inputClass, 'pr-12')}
        />
        <button
          type="button"
          onClick={() => setShow((v) => !v)}
          aria-label={show ? t('resetPassword.hidePassword') : t('resetPassword.showPassword')}
          className="absolute inset-y-0 right-0 flex w-12 items-center justify-center transition-opacity duration-fast hover:opacity-70"
          style={{ color: 'var(--text-secondary)' }}
        >
          {show ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </span>
      {error && (
        <span className="t-caption mt-1.5 block text-danger" role="alert">
          {error}
        </span>
      )}
    </label>
  );
}

/**
 * Reset password — token arrives via /reset-password?token=…. The token is
 * lifted into state and stripped from the URL immediately so it can't leak
 * via history, referrer, or analytics.
 */
export default function ResetPassword() {
  const { t } = useTranslation('landing');
  const [params] = useSearchParams();
  const navigate = useNavigate();
  // undefined = not yet read from the URL; null = read but missing.
  const [token, setToken] = useState<string | null | undefined>(undefined);

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{ password?: string; confirm?: string }>({});
  const [done, setDone] = useState(false);
  const [linkInvalid, setLinkInvalid] = useState(false);

  // Lift the token out of the query string exactly once.
  useEffect(() => {
    const tokenParam = params.get('token');
    setToken(tokenParam && tokenParam.length > 0 ? tokenParam : null);
    if (tokenParam) {
      window.history.replaceState(null, '', window.location.pathname);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resetMutation = trpc.passwordAuth.resetPassword.useMutation({
    onSuccess: () => setDone(true),
    onError: () => setLinkInvalid(true),
  });

  const validate = (): boolean => {
    const errors: typeof fieldErrors = {};
    if (password.length < 8) {
      errors.password = t('resetPassword.errors.passwordShort');
    }
    if (confirm !== password) {
      errors.confirm = t('resetPassword.errors.confirmMismatch');
    }
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (resetMutation.isPending || !token || !validate()) return;
    resetMutation.mutate({ token, newPassword: password });
  };

  const requestNewLink = (
    <div className="text-center">
      <h1 className="t-title" style={{ color: 'var(--text)' }}>
        {t('resetPassword.invalidTitle')}
      </h1>
      <p className="t-body mt-2" style={{ color: 'var(--text-secondary)' }}>
        {t('resetPassword.invalidBody')}
      </p>
      <BtnPrimary
        onClick={() => navigate('/forgot-password')}
        className="mt-6 w-full"
        ariaLabel={t('resetPassword.requestNew')}
      >
        {t('resetPassword.requestNew')}
      </BtnPrimary>
      <p className="mt-4">
        <Link
          to="/signin"
          className="t-caption inline-flex min-h-[44px] items-center transition-opacity duration-fast hover:opacity-70"
          style={{ color: 'var(--text-secondary)' }}
        >
          {t('resetPassword.backToSignIn')}
        </Link>
      </p>
    </div>
  );

  return (
    <div className="relative flex min-h-[100dvh] items-center justify-center px-5 py-10">
      <StageBackdrop />

      <motion.div
        className="w-full max-w-sm"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="mb-6 flex items-center justify-center gap-2.5">
          <BrandMark size={30} />
          <span className="t-logo" style={{ color: 'var(--text-ink)' }}>
            Resonance.
          </span>
        </div>

        <GlassCard edge="amber" className="p-7 sm:p-8">
          {token === undefined ? null : linkInvalid || token === null ? (
            requestNewLink
          ) : done ? (
            <div className="text-center">
              <div
                className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full"
                style={{ background: 'var(--field)' }}
              >
                <ShieldCheck size={22} style={{ color: 'var(--text)' }} aria-hidden="true" />
              </div>
              <h1 className="t-title" style={{ color: 'var(--text)' }}>
                {t('resetPassword.doneTitle')}
              </h1>
              <p className="t-body mt-2" style={{ color: 'var(--text-secondary)' }}>
                {t('resetPassword.doneBody')}
              </p>
              <BtnPrimary
                onClick={() => navigate('/signin')}
                className="mt-6 w-full"
                ariaLabel={t('resetPassword.goToSignIn')}
              >
                {t('resetPassword.goToSignIn')}
              </BtnPrimary>
            </div>
          ) : (
            <>
              <h1 className="t-title text-center" style={{ color: 'var(--text)' }}>
                {t('resetPassword.title')}
              </h1>
              <p
                className="t-body mt-2 text-center"
                style={{ color: 'var(--text-secondary)' }}
              >
                {t('resetPassword.subtitle')}
              </p>

              <form onSubmit={handleSubmit} className="mt-6 space-y-4" noValidate>
                <PasswordField
                  label={t('resetPassword.newLabel')}
                  value={password}
                  onChange={setPassword}
                  error={fieldErrors.password}
                  autoComplete="new-password"
                />
                <PasswordField
                  label={t('resetPassword.confirmLabel')}
                  value={confirm}
                  onChange={setConfirm}
                  error={fieldErrors.confirm}
                  autoComplete="new-password"
                />

                <BtnPrimary
                  type="submit"
                  disabled={resetMutation.isPending}
                  className="w-full"
                  ariaLabel={t('resetPassword.submit')}
                >
                  {resetMutation.isPending && (
                    <Loader2 size={18} className="animate-spin" aria-hidden="true" />
                  )}
                  {resetMutation.isPending ? t('resetPassword.updating') : t('resetPassword.submit')}
                </BtnPrimary>
              </form>
            </>
          )}
        </GlassCard>
      </motion.div>
    </div>
  );
}
