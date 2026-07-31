import { Link } from 'react-router';
import { Instagram, Twitter, Youtube } from 'lucide-react';
import BrandMark from '@/components/BrandMark';

const COLUMNS: { title: string; links: string[] }[] = [
  { title: 'Product', links: ['Daily Queue', 'Modes', 'Events', 'Resonance+'] },
  { title: 'Company', links: ['About', 'Careers', 'Press', 'Contact'] },
  { title: 'Legal', links: ['Privacy', 'Terms', 'Cookies', 'Data requests'] },
  { title: 'Safety', links: ['Verification', 'Community rules', 'Report', 'Consent tools'] },
];

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
              <div className="mt-5 flex items-center gap-3">
                {[Instagram, Twitter, Youtube].map((Icon, i) => (
                  <a
                    key={i}
                    href="#"
                    className="flex h-10 w-10 items-center justify-center rounded-full bg-field transition-colors duration-fast"
                    style={{ color: 'var(--text-secondary)' }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text)')}
                    onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-secondary)')}
                    aria-label="Social link"
                  >
                    <Icon size={18} aria-hidden="true" />
                  </a>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
              {COLUMNS.map((col) => (
                <div key={col.title}>
                  <h3 className="t-micro uppercase" style={{ color: 'var(--text-secondary)' }}>
                    {col.title}
                  </h3>
                  <ul className="mt-3 space-y-2.5">
                    {col.links.map((link) => (
                      <li key={link}>
                        <a
                          href="#"
                          className="t-caption transition-colors duration-fast"
                          style={{ color: 'var(--text-secondary)' }}
                          onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text)')}
                          onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-secondary)')}
                        >
                          {link}
                        </a>
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
