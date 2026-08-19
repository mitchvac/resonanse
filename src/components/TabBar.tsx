import { NavLink } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Compass, Heart, MessageCircle, CalendarDays, TrendingUp, Gamepad2, User } from 'lucide-react';

/**
 * TabBar — design.md §8.4
 * Height 72px + safe-area. One blurred container (.glass, radius 24px,
 * --tabbar-bg fill, floating 12px from edges/bottom — 1 of the ≤8 blurred
 * surfaces). 5 tabs, icon 22px + micro label 9px −0.03em. Active: solid
 * --text icon + violet 6px dot beneath; inactive: --text at 0.64 (Warm Glass)
 * / white 0.64 (Night HUD) — i.e. var(--text-secondary). Likes tab carries a
 * count badge (violet pill, 10px 700, white text). Unread chat dot on
 * Matches (--ok).
 */
const TABS = [
  { to: '/discover', labelKey: 'nav.discover', icon: Compass },
  { to: '/likes', labelKey: 'nav.likes', icon: Heart, badge: true },
  { to: '/matches', labelKey: 'nav.matches', icon: MessageCircle, unread: true },
  { to: '/events', labelKey: 'nav.events', icon: CalendarDays },
  { to: '/markets', labelKey: 'nav.markets', icon: TrendingUp },
  { to: '/community', labelKey: 'nav.community', icon: Gamepad2 },
  { to: '/profile', labelKey: 'nav.profile', icon: User },
] as const;

export default function TabBar({
  likesCount = 0,
  hasUnreadChat = false,
}: {
  likesCount?: number;
  hasUnreadChat?: boolean;
}) {
  const { t } = useTranslation('common');
  return (
    <nav
      aria-label={t('nav.primary')}
      className="absolute inset-x-3 z-30"
      style={{ bottom: 'max(12px, env(safe-area-inset-bottom, 0px))' }}
    >
      <div
        className="glass h-[72px] rounded-[24px]"
        style={{ background: 'var(--tabbar-bg)' }}
      >
        <div className="glass-content grid h-full grid-cols-7">
          {TABS.map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              className="relative flex min-h-[44px] flex-col items-center justify-center gap-1"
              aria-label={t(tab.labelKey)}
            >
              {({ isActive }) => (
                <>
                  <span className="relative">
                    <tab.icon
                      size={22}
                      strokeWidth={isActive ? 2.2 : 1.8}
                      style={{
                        color: isActive
                          ? 'var(--text)'
                          : 'var(--text-secondary)',
                      }}
                      aria-hidden="true"
                    />
                    {'badge' in tab && tab.badge && likesCount > 0 && (
                      <span
                        className="absolute -right-2.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold leading-none text-white"
                        style={{ background: 'var(--violet)' }}
                        aria-label={t('nav.likesBadge', { count: likesCount })}
                      >
                        {likesCount}
                      </span>
                    )}
                    {'unread' in tab && tab.unread && hasUnreadChat && (
                      <span
                        className="absolute -right-1.5 -top-0.5 h-2 w-2 rounded-full"
                        style={{ background: 'var(--ok)' }}
                        aria-label={t('nav.unreadMessages')}
                      />
                    )}
                  </span>
                  <span
                    className="t-micro"
                    style={{
                      color: isActive ? 'var(--text)' : 'var(--text-secondary)',
                    }}
                  >
                    {t(tab.labelKey)}
                  </span>
                  {isActive && (
                    <span
                      className="absolute bottom-2 h-1.5 w-1.5 rounded-full"
                      style={{ background: 'var(--violet)' }}
                      aria-hidden="true"
                    />
                  )}
                </>
              )}
            </NavLink>
          ))}
        </div>
      </div>
    </nav>
  );
}
