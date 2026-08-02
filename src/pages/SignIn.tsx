import { useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router';
import { motion } from 'framer-motion';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import BrandMark from '@/components/BrandMark';
import GlassCard from '@/components/GlassCard';
import GoogleMark from '@/components/GoogleMark';
import StageBackdrop from '@/components/StageBackdrop';
import { BtnGlass, BtnPrimary } from '@/components/ui/buttons';
import { useAuth } from '@/hooks/useAuth';
import { trpc } from '@/providers/trpc';
import { LOGIN_PATH } from '@/const';
import { cn } from '@/lib/utils';

type Mode = 'signin' | 'register';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const inputClass = cn(
  't-body h-12 w-full rounded-2xl px-4 outline-none transition-shadow duration-fast',
  'bg-field text-[var(--text)] placeholder:text-[var(--text-secondary)]',
  'focus-visible:ring-2 focus-visible:ring-violet/40',
);

function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="t-caption mb-1.5 block font-bold" style={{ color: 'var(--text)' }}>
        {label}
      </span>
      {children}
      {error ? (
        <span className="t-caption mt-1.5 block text-danger" role="alert">
          {error}
        </span>
      ) : hint ? (
        <span className="t-caption mt-1.5 block" style={{ color: 'var(--text-secondary)' }}>
          {hint}
        </span>
      ) : null}
    </label>
  );
}

/**
 * Unified sign-in — email + password accounts alongside Kimi OAuth.
 * Full-screen Warm Glass stage (not the phone shell): centered glass card,
 * segmented Sign in / Create account toggle, violet primary CTA, and a
 * secondary glass button that hands off to the graft-owned OAuth page.
 */
export default function SignIn() {
  const [mode, setMode] = useState<Mode>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{
    name?: string;
    email?: string;
    password?: string;
  }>({});

  const navigate = useNavigate();
  const utils = trpc.useUtils();
  const [searchParams] = useSearchParams();
  const { isAuthenticated, isLoading: authLoading } = useAuth();

  // Friendly notice for OAuth handoff failures (e.g. provider not configured).
  const oauthErrorCode = searchParams.get('error');
  const oauthNotice =
    oauthErrorCode === 'google-not-configured'
      ? 'Google sign-in isn’t available yet — use email or Kimi instead.'
      : oauthErrorCode === 'google-auth-failed'
        ? 'Google sign-in didn’t complete. Try again, or use email or Kimi.'
        : null;

  const onSuccess = async () => {
    await utils.invalidate();
    navigate('/discover');
  };
  const loginMutation = trpc.passwordAuth.login.useMutation({ onSuccess });
  const registerMutation = trpc.passwordAuth.register.useMutation({ onSuccess });

  const activeMutation = mode === 'signin' ? loginMutation : registerMutation;
  const serverError = activeMutation.error?.message ?? null;
  const pending = activeMutation.isPending;

  const switchMode = (next: Mode) => {
    if (next === mode) return;
    setMode(next);
    setFieldErrors({});
    loginMutation.reset();
    registerMutation.reset();
  };

  const validate = (): boolean => {
    const errors: typeof fieldErrors = {};
    if (mode === 'register' && name.trim().length === 0) {
      errors.name = 'Tell us your name';
    }
    if (!EMAIL_RE.test(email.trim())) {
      errors.email = 'Enter a valid email address';
    }
    if (mode === 'register' && password.length < 8) {
      errors.password = 'At least 8 characters';
    } else if (mode === 'signin' && password.length === 0) {
      errors.password = 'Enter your password';
    }
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (pending || !validate()) return;
    if (mode === 'signin') {
      loginMutation.mutate({ email: email.trim(), password });
    } else {
      registerMutation.mutate({ email: email.trim(), password, name: name.trim() });
    }
  };

  // Already signed in — no reason to sit on the auth screen.
  if (!authLoading && isAuthenticated) {
    return <Navigate to="/discover" replace />;
  }

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
          <h1 className="t-title text-center" style={{ color: 'var(--text)' }}>
            {mode === 'signin' ? 'Welcome back.' : 'Create your account.'}
          </h1>
          <p
            className="t-body mt-2 text-center"
            style={{ color: 'var(--text-secondary)' }}
          >
            {mode === 'signin'
              ? 'Pick up where you left off.'
              : 'A quieter way to meet people worth meeting.'}
          </p>

          {/* Mode toggle — segmented control */}
          <div
            className="mt-6 flex rounded-full bg-field p-1"
            role="tablist"
            aria-label="Sign in or create account"
          >
            {(
              [
                { id: 'signin', label: 'Sign in' },
                { id: 'register', label: 'Create account' },
              ] as const
            ).map((option) => (
              <button
                key={option.id}
                type="button"
                role="tab"
                aria-selected={mode === option.id}
                onClick={() => switchMode(option.id)}
                className="t-button h-10 min-h-[44px] flex-1 rounded-full transition-all duration-fast"
                style={{
                  color: mode === option.id ? 'var(--text)' : 'var(--text-secondary)',
                  background:
                    mode === option.id ? 'var(--glass-solid)' : 'transparent',
                }}
              >
                {option.label}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4" noValidate>
            {mode === 'register' && (
              <Field label="Name" error={fieldErrors.name}>
                <input
                  type="text"
                  autoComplete="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your first name"
                  maxLength={80}
                  className={inputClass}
                />
              </Field>
            )}

            <Field label="Email" error={fieldErrors.email}>
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                maxLength={320}
                className={inputClass}
              />
            </Field>

            <Field
              label="Password"
              hint={mode === 'register' ? 'At least 8 characters' : undefined}
              error={fieldErrors.password}
            >
              <span className="relative block">
                <input
                  type={showPassword ? 'text' : 'password'}
                  autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  maxLength={128}
                  className={cn(inputClass, 'pr-12')}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute inset-y-0 right-0 flex w-12 items-center justify-center transition-opacity duration-fast hover:opacity-70"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </span>
            </Field>

            {mode === 'signin' && (
              <div className="-mt-2 text-right">
                <Link
                  to="/forgot-password"
                  className="t-caption inline-flex min-h-[44px] items-center transition-opacity duration-fast hover:opacity-70"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  Forgot password?
                </Link>
              </div>
            )}

            {oauthNotice && (
              <p
                className="t-caption rounded-2xl px-4 py-3 ring-1 ring-inset ring-[var(--ring-stroke)]"
                role="status"
                style={{ color: 'var(--text)' }}
              >
                {oauthNotice}
              </p>
            )}

            {serverError && (
              <p
                className="t-caption rounded-2xl px-4 py-3 text-danger ring-1 ring-inset ring-[var(--danger)]/40"
                role="alert"
              >
                {serverError}
              </p>
            )}

            <BtnPrimary
              type="submit"
              disabled={pending}
              className="w-full"
              ariaLabel={mode === 'signin' ? 'Sign in' : 'Create account'}
            >
              {pending && <Loader2 size={18} className="animate-spin" aria-hidden="true" />}
              {pending
                ? 'One moment…'
                : mode === 'signin'
                  ? 'Sign in'
                  : 'Create account'}
            </BtnPrimary>
          </form>

          <div className="my-6 flex items-center gap-3" aria-hidden="true">
            <span className="h-px flex-1" style={{ background: 'var(--ring-stroke)' }} />
            <span className="t-caption" style={{ color: 'var(--text-secondary)' }}>
              or
            </span>
            <span className="h-px flex-1" style={{ background: 'var(--ring-stroke)' }} />
          </div>

          <div className="space-y-3">
            <BtnGlass to={LOGIN_PATH} className="w-full" ariaLabel="Continue with Kimi">
              Continue with Kimi
            </BtnGlass>
            <BtnGlass
              onClick={() => {
                window.location.href = '/api/auth/google';
              }}
              className="w-full"
              ariaLabel="Continue with Google"
            >
              <GoogleMark size={18} />
              Continue with Google
            </BtnGlass>
          </div>
        </GlassCard>
      </motion.div>
    </div>
  );
}
