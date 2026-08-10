import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import type { CSSProperties } from 'react';
import BrandMark from '@/components/BrandMark';

type FooterLink = { labelKey?: string; label?: string; to: string; external?: boolean };

const COLUMNS: { titleKey: string; links: FooterLink[] }[] = [
  {
    titleKey: 'footer.product',
    links: [
      { labelKey: 'footer.links.dailyQueue', to: '/#philosophy' },
      { labelKey: 'footer.links.modes', to: '/#modes' },
      { labelKey: 'footer.links.events', to: '/#philosophy' },
      { label: 'Resonance+', to: '/#pricing' },
    ],
  },
  {
    titleKey: 'footer.company',
    links: [
      { labelKey: 'footer.links.about', to: '/#philosophy' },
      { labelKey: 'footer.links.careers', to: 'mailto:press@resonanse.app', external: true },
      { labelKey: 'footer.links.press', to: 'mailto:press@resonanse.app', external: true },
      { labelKey: 'footer.links.contact', to: 'mailto:hello@resonanse.app', external: true },
    ],
  },
  {
    titleKey: 'footer.legal',
    links: [
      { labelKey: 'footer.links.privacy', to: '/privacy' },
      { labelKey: 'footer.links.terms', to: '/terms' },
      { labelKey: 'footer.links.cookies', to: '/cookies' },
      { labelKey: 'footer.links.dataRequests', to: '/data' },
    ],
  },
  {
    titleKey: 'footer.safety',
    links: [
      { labelKey: 'footer.links.verification', to: '/#safety' },
      { labelKey: 'footer.links.communityRules', to: '/guidelines' },
      { labelKey: 'footer.links.report', to: '/report' },
      { labelKey: 'footer.links.consentTools', to: '/report' },
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
  const { t } = useTranslation('common');
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
              <p className="t-eyebrow mt-4">{t('footer.tagline')}</p>
              <p className="t-caption mt-3 text-secondary">
                {t('footer.description')}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
              {COLUMNS.map((col) => (
                <div key={col.titleKey}>
                  <h3 className="t-micro uppercase" style={{ color: 'var(--text-secondary)' }}>
                    {t(col.titleKey)}
                  </h3>
                  <ul className="mt-3 space-y-2.5">
                    {col.links.map((link) => {
                      const label = link.labelKey ? t(link.labelKey) : link.label;
                      return (
                        <li key={label}>
                          {link.external ? (
                            <a href={link.to} className={linkClass} style={linkStyle} {...linkHover}>
                              {label}
                            </a>
                          ) : (
                            <Link to={link.to} className={linkClass} style={linkStyle} {...linkHover}>
                              {label}
                            </Link>
                          )}
                        </li>
                      );
                    })}
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
        {t('footer.signIn')}
      </Link>
    </footer>
  );
}
