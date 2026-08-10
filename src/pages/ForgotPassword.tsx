import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router';
import { motion } from 'framer-motion';
import { Loader2, MailCheck } from 'lucide-react';
import BrandMark from '@/components/BrandMark';
import GlassCard from '@/components/GlassCard';
import StageBackdrop from '@/components/StageBackdrop';
import { BtnPrimary } from '@/components/ui/buttons';
import { trpc } from '@/providers/trpc';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const inputClass = cn(
  't-body h-12 w-full rounded-2xl px-4 outline-none transition-shadow duration-fast',
  'bg-field text-[var(--text)] placeholder:text-[var(--text-secondary)]',
  'focus-visible:ring-2 focus-visible:ring-violet/40',
);

/**
 * Forgot password — always shows the same generic success state after submit,
 * whether or not the account exists (no email enumeration).
 */
export default function ForgotPassword() {
  const { t } = useTranslation('landing');
  const [email, setEmail] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const requestMutation = trpc.passwordAuth.requestPasswordReset.useMutation({
    onSuccess: () => setSent(true),
    // Even a transport/server error must not reveal account existence — the
    // server already returns a generic body; treat any completion as sent.
    onError: () => setSent(true),
  });

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (requestMutation.isPending) return;
    if (!EMAIL_RE.test(email.trim())) {
      setFieldError(t('forgotPassword.emailInvalid'));
      return;
    }
    setFieldError(null);
    requestMutation.mutate({ email: email.trim() });
  };

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
          {sent ? (
            <div className="text-center">
              <div
                className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full"
                style={{ background: 'var(--field)' }}
              >
                <MailCheck size={22} style={{ color: 'var(--text)' }} aria-hidden="true" />
              </div>
              <h1 className="t-title" style={{ color: 'var(--text)' }}>
                {t('forgotPassword.sentTitle')}
              </h1>
              <p className="t-body mt-2" style={{ color: 'var(--text-secondary)' }}>
                {t('forgotPassword.sentBody')}
              </p>
              <Link
                to="/signin"
                className="t-button mt-6 inline-flex min-h-[44px] items-center justify-center transition-opacity duration-fast hover:opacity-70"
                style={{ color: 'var(--text)' }}
              >
                {t('forgotPassword.backToSignIn')}
              </Link>
            </div>
          ) : (
            <>
              <h1 className="t-title text-center" style={{ color: 'var(--text)' }}>
                Forgot your password?
              </h1>
              <p
                className="t-body mt-2 text-center"
                style={{ color: 'var(--text-secondary)' }}
              >
                Enter your email and we'll send you a reset link.
              </p>

              <form onSubmit={handleSubmit} className="mt-6 space-y-4" noValidate>
                <label className="block">
                  <span
                    className="t-caption mb-1.5 block font-bold"
                    style={{ color: 'var(--text)' }}
                  >
                    {t('forgotPassword.emailLabel')}
                  </span>
                  <input
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    maxLength={320}
                    className={inputClass}
                  />
                  {fieldError && (
                    <span className="t-caption mt-1.5 block text-danger" role="alert">
                      {fieldError}
                    </span>
                  )}
                </label>

                <BtnPrimary
                  type="submit"
                  disabled={requestMutation.isPending}
                  className="w-full"
                  ariaLabel={t('forgotPassword.send')}
                >
                  {requestMutation.isPending && (
                    <Loader2 size={18} className="animate-spin" aria-hidden="true" />
                  )}
                  {requestMutation.isPending ? t('forgotPassword.sending') : t('forgotPassword.send')}
                </BtnPrimary>
              </form>

              <p className="mt-6 text-center">
                <Link
                  to="/signin"
                  className="t-caption inline-flex min-h-[44px] items-center transition-opacity duration-fast hover:opacity-70"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  {t('forgotPassword.backToSignIn')}
                </Link>
              </p>
            </>
          )}
        </GlassCard>
      </motion.div>
    </div>
  );
}
