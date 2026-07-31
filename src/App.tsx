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
import Profile from '@/pages/Profile'
import Settings from '@/pages/Settings'
import Login from '@/pages/Login'

export default function App() {
  return (
    <Routes>
      {/* Marketing landing — full-viewport, no phone shell */}
      <Route path="/" element={<Home />} />
      {/* Auth — plain placeholder, overwritten by the backend graft (Phase 5) */}
      <Route path="/login" element={<Login />} />

      {/* App pages — nested under the phone-shell layout */}
      <Route element={<Layout />}>
        <Route path="/onboarding" element={<Onboarding />} />
        <Route path="/profile-setup" element={<ProfileSetup />} />
        <Route path="/discover" element={<Discover />} />
        <Route path="/likes" element={<Likes />} />
        <Route path="/matches" element={<Matches />} />
        <Route path="/chat/:id" element={<Chat />} />
        <Route path="/events" element={<Events />} />
        <Route path="/premium" element={<Premium />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/settings" element={<Settings />} />
      </Route>
    </Routes>
  )
}
