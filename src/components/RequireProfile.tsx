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

  if (!isAuthenticated) return <>{children}</>
  if (authLoading || me.isLoading) return null

  const complete = me.data?.profile?.onboardingComplete
  if (complete === false && !ONBOARDING_PATHS.some((p) => pathname.startsWith(p))) {
    return <Navigate to="/onboarding" replace />
  }
  return <>{children}</>
}
