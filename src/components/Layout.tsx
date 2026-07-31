import { Outlet } from 'react-router';
import StageBackdrop from '@/components/StageBackdrop';

/**
 * Layout — the PHONE SHELL (design.md §2)
 * StageBackdrop (fixed themed stage: warm cream + amber bloom in Warm Glass,
 * navy + blue bloom in Night HUD) + centered 430px phone frame on desktop
 * (radius 40px, theme-aware slab rim + shadow/glow via .phone-shell chrome),
 * full-bleed on mobile. Content slot renders <Outlet/> — App wires app pages
 * as nested routes under this layout. Status bar spacer 12px top.
 *
 * The landing page `/` renders full-screen WITHOUT this shell.
 */
export default function Layout() {
  return (
    <div className="relative min-h-[100dvh]">
      <StageBackdrop />
      <div className="mx-auto flex min-h-[100dvh] w-full max-w-[430px] md:items-center md:py-6">
        <div className="phone-shell relative flex min-h-[100dvh] w-full flex-col overflow-hidden md:h-[min(920px,calc(100dvh-48px))] md:min-h-0">
          <div className="phone-bloom" aria-hidden="true" />
          {/* Status bar spacer (12px) */}
          <div className="relative z-10 h-3 shrink-0" aria-hidden="true" />
          <div className="relative z-10 flex-1 overflow-hidden">
            <Outlet />
          </div>
        </div>
      </div>
    </div>
  );
}
