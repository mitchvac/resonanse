import { Navigate, useLocation } from 'react-router'
import { useAuth } from '@/hooks/useAuth'
import { trpc } from '@/providers/trpc'

/** Routes a signed-in user may visit before finishing onboarding. */
const ONBOARDING_PATHS = ['/onboarding', '/profile-setup']

/**
 * Post-login gate: a signed-in user whose profile hasn't completed
 * onboarding (no name/intent/photo/prompt yet — the backend computes
 * `onboardingComplete` on every upsert) is routed into the onboarding
 * questionnaire first. Signed-out visitors pass through (demo mode).
 */
export default function RequireProfile({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading: authLoading } = useAuth()
  const me = trpc.profile.me.useQuery(undefined, { enabled: isAuthenticated })
  const { pathname } = useLocation()

  /* 1. Wait for auth to resolve before rendering anything — otherwise
        signed-in users get a flash of the app (and its authed queries)
        before the redirect can fire. */
  if (authLoading) return null

  /* 2. Signed-out visitors: demo mode, no gate. */
  if (!isAuthenticated) return <>{children}</>

  /* 3. Signed in: wait for the profile row; only a definitive,
        successfully-loaded incomplete profile triggers the redirect
        (errors never redirect — avoids loops). `!complete` also covers
        drivers that surface booleans as 0/1. */
  if (me.isLoading) return null
  const complete = me.data?.profile?.onboardingComplete
  if (me.isSuccess && !complete && !ONBOARDING_PATHS.some((p) => pathname.startsWith(p))) {
    return <Navigate to="/onboarding" replace />
  }
  return <>{children}</>
}
