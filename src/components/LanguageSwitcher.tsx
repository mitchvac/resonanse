import { useTranslation } from 'react-i18next';
import { Globe } from 'lucide-react';
import { SUPPORTED_LANGUAGES } from '@/i18n';

/**
 * LanguageSwitcher — V89. Native-name pills (so a German recognizes "Deutsch",
 * a Mandarin reader recognizes 中文 — never flags, never translated names).
 * The choice persists via i18next-browser-languagedetector (localStorage);
 * first visit follows the browser locale automatically.
 */
export default function LanguageSwitcher() {
  const { i18n, t } = useTranslation('settings');
  const active = i18n.resolvedLanguage ?? i18n.language;

  return (
    <div>
      <div className="flex items-center gap-2">
        <Globe size={16} style={{ color: 'var(--violet)' }} aria-hidden="true" />
        <p className="t-title-sm" style={{ color: 'var(--text)' }}>
          {t('language.title')}
        </p>
      </div>
      <p className="t-body mt-1" style={{ color: 'var(--text-secondary)' }}>
        {t('language.caption')}
      </p>
      <div className="mt-3 flex flex-wrap gap-2" role="radiogroup" aria-label={t('language.title')}>
        {SUPPORTED_LANGUAGES.map(({ code, label }) => {
          const on = active === code || active.startsWith(`${code}-`);
          return (
            <button
              key={code}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => void i18n.changeLanguage(code)}
              className="t-button min-h-[40px] rounded-full px-4 transition-all duration-fast"
              style={{
                background: on ? 'var(--violet)' : 'var(--field)',
                color: on ? '#fff' : 'var(--text)',
                boxShadow: on ? '0 4px 14px rgba(124,108,240,0.35)' : 'none',
              }}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
