import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

/**
 * Resonance site i18n — V89.
 *
 * Namespaces (one per surface group so translators/agents never collide):
 *   common   — TabBar, shared buttons/labels, NotFound
 *   landing  — Home/landing, Login, SignIn, Forgot/Reset password
 *   discover — Discover + Likes You (incl. gesture UI)
 *   settings — Settings + Profile
 *   connect  — Matches, Chat, Community, Events
 *   safety   — V93 Community Standards: Your standing, Scam Shield, appeals
 *
 * Each namespace ships in en/es/de/fr/pt/zh/ja/ko under src/locales/<lng>/<ns>.json
 * (Latin Europe + the Orient: Mandarin, Japanese, Korean).
 * en is the source AND the fallback: any missing key renders English, so a
 * partial translation never breaks the UI.
 *
 * Detection: the visitor's own choice (localStorage) beats the browser
 * locale; a German browser sees German on first visit, no click needed.
 * <html lang> follows the active language for screen readers/SEO.
 */

import enCommon from '@/locales/en/common.json';
import enLanding from '@/locales/en/landing.json';
import enDiscover from '@/locales/en/discover.json';
import enSettings from '@/locales/en/settings.json';
import enConnect from '@/locales/en/connect.json';
import enGames from '@/locales/en/games.json';
import enSafety from '@/locales/en/safety.json';

import esCommon from '@/locales/es/common.json';
import esLanding from '@/locales/es/landing.json';
import esDiscover from '@/locales/es/discover.json';
import esSettings from '@/locales/es/settings.json';
import esConnect from '@/locales/es/connect.json';
import esGames from '@/locales/es/games.json';
import esSafety from '@/locales/es/safety.json';

import deCommon from '@/locales/de/common.json';
import deLanding from '@/locales/de/landing.json';
import deDiscover from '@/locales/de/discover.json';
import deSettings from '@/locales/de/settings.json';
import deConnect from '@/locales/de/connect.json';
import deGames from '@/locales/de/games.json';
import deSafety from '@/locales/de/safety.json';

import frCommon from '@/locales/fr/common.json';
import frLanding from '@/locales/fr/landing.json';
import frDiscover from '@/locales/fr/discover.json';
import frSettings from '@/locales/fr/settings.json';
import frConnect from '@/locales/fr/connect.json';
import frGames from '@/locales/fr/games.json';
import frSafety from '@/locales/fr/safety.json';

import ptCommon from '@/locales/pt/common.json';
import ptLanding from '@/locales/pt/landing.json';
import ptDiscover from '@/locales/pt/discover.json';
import ptSettings from '@/locales/pt/settings.json';
import ptConnect from '@/locales/pt/connect.json';
import ptGames from '@/locales/pt/games.json';
import ptSafety from '@/locales/pt/safety.json';

import zhCommon from '@/locales/zh/common.json';
import zhLanding from '@/locales/zh/landing.json';
import zhDiscover from '@/locales/zh/discover.json';
import zhSettings from '@/locales/zh/settings.json';
import zhConnect from '@/locales/zh/connect.json';
import zhGames from '@/locales/zh/games.json';
import zhSafety from '@/locales/zh/safety.json';

import jaCommon from '@/locales/ja/common.json';
import jaLanding from '@/locales/ja/landing.json';
import jaDiscover from '@/locales/ja/discover.json';
import jaSettings from '@/locales/ja/settings.json';
import jaConnect from '@/locales/ja/connect.json';
import jaGames from '@/locales/ja/games.json';
import jaSafety from '@/locales/ja/safety.json';

import koCommon from '@/locales/ko/common.json';
import koLanding from '@/locales/ko/landing.json';
import koDiscover from '@/locales/ko/discover.json';
import koSettings from '@/locales/ko/settings.json';
import koConnect from '@/locales/ko/connect.json';
import koGames from '@/locales/ko/games.json';
import koSafety from '@/locales/ko/safety.json';

export const SUPPORTED_LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Español' },
  { code: 'de', label: 'Deutsch' },
  { code: 'fr', label: 'Français' },
  { code: 'pt', label: 'Português' },
  { code: 'zh', label: '中文' },
  { code: 'ja', label: '日本語' },
  { code: 'ko', label: '한국어' },
] as const;

export type LanguageCode = (typeof SUPPORTED_LANGUAGES)[number]['code'];

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { common: enCommon, landing: enLanding, discover: enDiscover, settings: enSettings, connect: enConnect, games: enGames, safety: enSafety },
      es: { common: esCommon, landing: esLanding, discover: esDiscover, settings: esSettings, connect: esConnect, games: esGames, safety: esSafety },
      de: { common: deCommon, landing: deLanding, discover: deDiscover, settings: deSettings, connect: deConnect, games: deGames, safety: deSafety },
      fr: { common: frCommon, landing: frLanding, discover: frDiscover, settings: frSettings, connect: frConnect, games: frGames, safety: frSafety },
      pt: { common: ptCommon, landing: ptLanding, discover: ptDiscover, settings: ptSettings, connect: ptConnect, games: ptGames, safety: ptSafety },
      zh: { common: zhCommon, landing: zhLanding, discover: zhDiscover, settings: zhSettings, connect: zhConnect, games: zhGames, safety: zhSafety },
      ja: { common: jaCommon, landing: jaLanding, discover: jaDiscover, settings: jaSettings, connect: jaConnect, games: jaGames, safety: jaSafety },
      ko: { common: koCommon, landing: koLanding, discover: koDiscover, settings: koSettings, connect: koConnect, games: koGames, safety: koSafety },
    },
    fallbackLng: 'en',
    defaultNS: 'common',
    supportedLngs: SUPPORTED_LANGUAGES.map((l) => l.code),
    nonExplicitSupportedLngs: true, // 'de-AT' → 'de', 'pt-BR' → 'pt'
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
      lookupLocalStorage: 'resonance.lng',
    },
    interpolation: { escapeValue: false }, // React already escapes
    returnNull: false,
  });

// keep <html lang> honest for screen readers + SEO
i18n.on('languageChanged', (lng) => {
  document.documentElement.lang = lng;
});
document.documentElement.lang = i18n.language;

export default i18n;
