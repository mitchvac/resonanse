import { Link } from 'react-router';
import type { CSSProperties } from 'react';
import BrandMark from '@/components/BrandMark';

type FooterLink = { label: string; to: string; external?: boolean };

const COLUMNS: { title: string; links: FooterLink[] }[] = [
  {
    title: 'Product',
    links: [
      { label: 'Daily Queue', to: '/#philosophy' },
      { label: 'Modes', to: '/#modes' },
      { label: 'Events', to: '/#philosophy' },
      { label: 'Resonance+', to: '/#pricing' },
    ],
  },
  {
    title: 'Company',
    links: [
      { label: 'About', to: '/#philosophy' },
      { label: 'Careers', to: 'mailto:press@resonanse.app', external: true },
      { label: 'Press', to: 'mailto:press@resonanse.app', external: true },
      { label: 'Contact', to: 'mailto:hello@resonanse.app', external: true },
    ],
  },
  {
    title: 'Legal',
    links: [
      { label: 'Privacy', to: '/privacy' },
      { label: 'Terms', to: '/terms' },
      { label: 'Cookies', to: '/cookies' },
      { label: 'Data requests', to: '/data' },
    ],
  },
  {
    title: 'Safety',
    links: [
      { label: 'Verification', to: '/#safety' },
      { label: 'Community rules', to: '/guidelines' },
      { label: 'Report', to: '/report' },
      { label: 'Consent tools', to: '/report' },
    ],
  },
];

const linkClass = 't-caption transition-colors duration-fast';
const linkStyle: CSSProperties = { color: 'var(--text-secondary)' };
const linkHover = {
  onMouseEnter: (e: React.MouseEvent<HTMLElement>) =>
    (e.currentTarget.style.color = 'var(--text)'),
  onMouseLeave: (e: React.MouseEvent<HTMLElement>) =>
    (e.currentTarget.style.color = 'var(--text-secondary)'),
};

/**
 * Marketing footer — home.md "Global page furniture"
 * Glass top edge (single blurred strip): wordmark, ember micro label
 * "DATE WITH INTENT", link columns, social icons, microcopy. All text is
 * var(--text)/var(--text-secondary) — warm ink in Warm Glass, white in
 * Night HUD.
 */
export default function Footer() {
  return (
    <footer className="relative z-10 mt-24">
      <div
        className="glass rounded-none border-0"
        style={{ borderRadius: 0 }}
      >
        <div className="glass-content mx-auto w-full max-w-6xl px-5 py-12">
          <div className="flex flex-col gap-10 md:flex-row md:justify-between">
            <div className="max-w-xs">
              <div className="flex items-center gap-2.5">
                <span className="t-logo" style={{ color: 'var(--text)' }}>
                  Resonance.
                </span>
                <BrandMark size={26} />
              </div>
              <p className="t-eyebrow mt-4">Date with intent</p>
              <p className="t-caption mt-3 text-secondary">
                A daily queue of people who match your intent — and the tools to
                turn a match into a first date.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
              {COLUMNS.map((col) => (
                <div key={col.title}>
                  <h3 className="t-micro uppercase" style={{ color: 'var(--text-secondary)' }}>
                    {col.title}
                  </h3>
                  <ul className="mt-3 space-y-2.5">
                    {col.links.map((link) => (
                      <li key={link.label}>
                        {link.external ? (
                          <a href={link.to} className={linkClass} style={linkStyle} {...linkHover}>
                            {link.label}
                          </a>
                        ) : (
                          <Link to={link.to} className={linkClass} style={linkStyle} {...linkHover}>
                            {link.label}
                          </Link>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>

          <div
            className="mt-12 flex flex-col gap-2 border-t pt-6 sm:flex-row sm:items-center sm:justify-between"
            style={{ borderColor: 'var(--ring-stroke)' }}
          >
            <p className="t-caption text-secondary">
              © Resonance. Made for meeting in real life.
            </p>
            <p className="t-micro" style={{ color: 'var(--text-secondary)' }}>
              Warm Glass by day, Night HUD by night — switch in Settings.
            </p>
          </div>
        </div>
      </div>
      <Link to="/login" className="sr-only">
        Sign in
      </Link>
    </footer>
  );
}
