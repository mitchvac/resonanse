import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { motion } from 'framer-motion';
import BrandMark from '@/components/BrandMark';
import { BtnPrimary, BtnGhost } from '@/components/ui/buttons';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';

const LINKS = [
  { label: 'How it works', href: '#philosophy' },
  { label: 'Modes', href: '#modes' },
  { label: 'Safety', href: '#safety' },
  { label: 'Pricing', href: '#pricing' },
];

/**
 * Marketing navbar — home.md "Global page furniture"
 * Fixed, 64px; blurs into a thin frosted glass bar after 24px of scroll.
 * Text is var(--text-ink)/var(--text) — warm ink in Warm Glass, white in
 * Night HUD. Left wordmark "Resonance." + brand mark; right anchor links +
 * Sign in (→ /login) + Get started (→ /login).
 */
export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const { user, isAuthenticated, isLoading, logout } = useAuth();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header
      className={cn(
        'fixed inset-x-0 top-0 z-50 transition-all duration-med ease-glassy-out',
        scrolled ? 'h-16' : 'h-[72px]',
      )}
    >
      <div
        className={cn(
          'absolute inset-0 transition-opacity duration-med',
          scrolled ? 'opacity-100' : 'opacity-0',
        )}
        style={{
          background: 'var(--glass-a)',
          backdropFilter: 'blur(var(--glass-blur))',
          WebkitBackdropFilter: 'blur(var(--glass-blur))',
          borderBottom: '1px solid var(--ring-stroke)',
        }}
        aria-hidden="true"
      />
      <nav
        className="relative mx-auto flex h-full w-full max-w-6xl items-center justify-between px-5"
        aria-label="Marketing"
      >
        <Link to="/" className="flex items-center gap-2.5" aria-label="Resonance home">
          <span className="t-logo" style={{ color: 'var(--text-ink)' }}>
            Resonance.
          </span>
          <BrandMark size={26} />
        </Link>

        <div className="flex items-center gap-1 md:gap-2">
          <div className="hidden items-center gap-1 md:flex">
            {LINKS.map((link, i) => (
              <motion.a
                key={link.href}
                href={link.href}
                className="t-caption rounded-full px-3 py-2 transition-colors duration-fast"
                style={{ color: 'var(--text-secondary)' }}
                onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text)')}
                onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-secondary)')}
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.04 * i, duration: 0.32 }}
              >
                {link.label}
              </motion.a>
            ))}
          </div>
          {isLoading ? (
            <span className="inline-block h-10 w-24 rounded-full bg-field" aria-hidden="true" />
          ) : isAuthenticated ? (
            <>
              <BtnGhost to="/discover" className="hidden sm:inline-flex">
                Open app
              </BtnGhost>
              <BtnPrimary to="/discover" className="h-10 px-5">
                {user?.name ? `Hi, ${user.name.split(' ')[0]}` : 'Continue'}
              </BtnPrimary>
              <BtnGhost onClick={() => logout()} className="hidden md:inline-flex">
                Sign out
              </BtnGhost>
            </>
          ) : (
            <>
              <BtnGhost to="/signin" className="hidden sm:inline-flex">
                Sign in
              </BtnGhost>
              <BtnPrimary to="/signin" className="h-10 px-5">
                Get started
              </BtnPrimary>
            </>
          )}
        </div>
      </nav>
    </header>
  );
}
