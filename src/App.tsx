import { Routes, Route } from 'react-router'
import Layout from '@/components/Layout'
import Home from '@/pages/Home'
import Onboarding from '@/pages/Onboarding'
import ProfileSetup from '@/pages/ProfileSetup'
import Discover from '@/pages/Discover'
import Likes from '@/pages/Likes'
import Matches from '@/pages/Matches'
import Chat from '@/pages/Chat'
import Events from '@/pages/Events'
import Premium from '@/pages/Premium'
import Wallet from '@/pages/Wallet'
import Profile from '@/pages/Profile'
import Settings from '@/pages/Settings'
import Login from '@/pages/Login'
import SignIn from '@/pages/SignIn'
import NotFound from '@/pages/NotFound'
import RequireProfile from '@/components/RequireProfile'

export default function App() {
  return (
    <Routes>
      {/* Marketing landing — full-viewport, no phone shell */}
      <Route path="/" element={<Home />} />
      {/* Auth — plain placeholder, overwritten by the backend graft (Phase 5) */}
      <Route path="/login" element={<Login />} />
      {/* Unified sign-in — email + password accounts, or continue with Kimi */}
      <Route path="/signin" element={<SignIn />} />

      {/* App pages — nested under the phone-shell layout; signed-in users
          who haven't answered the onboarding questionnaire are routed there
          first (onboarding/profile-setup stay reachable during the flow) */}
      <Route
        element={
          <RequireProfile>
            <Layout />
          </RequireProfile>
        }
      >
        <Route path="/onboarding" element={<Onboarding />} />
        <Route path="/profile-setup" element={<ProfileSetup />} />
        <Route path="/discover" element={<Discover />} />
        <Route path="/likes" element={<Likes />} />
        <Route path="/matches" element={<Matches />} />
        <Route path="/chat/:id" element={<Chat />} />
        <Route path="/events" element={<Events />} />
        <Route path="/premium" element={<Premium />} />
        <Route path="/wallet" element={<Wallet />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/settings" element={<Settings />} />
      </Route>

      {/* Catch-all */}
      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}
