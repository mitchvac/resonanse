import type { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { ArrowLeft, ExternalLink } from 'lucide-react';
import BrandMark from '@/components/BrandMark';
import GlassCard from '@/components/GlassCard';
import StageBackdrop from '@/components/StageBackdrop';
import { BtnGhost } from '@/components/ui/buttons';

/* ------------------------------------------------------------------ */
/* Legal pages — one component, a registry of documents keyed by slug. */
/* Public routes (no phone shell): /privacy /terms /cookies            */
/* /guidelines /report /data — wired in App.tsx.                       */
/* ------------------------------------------------------------------ */

export type LegalDocSlug = 'privacy' | 'terms' | 'cookies' | 'guidelines' | 'report' | 'data';

const LAST_UPDATED = '2026-08-07';

/* V93 — the guidelines page is the first translated legal doc: its content
   is the condensed Community Standards (standards doc Part 1 §§2–7, copy
   deck §8 voice) and ships in the `landing` namespace for all 8 locales.
   The remaining docs stay English-only for now. */
function buildGuidelinesDoc(t: TFunction): LegalDoc {
  return {
    slug: 'guidelines',
    eyebrow: t('guidelines.eyebrow'),
    title: t('guidelines.title'),
    intro: t('guidelines.intro'),
    sections: [
      {
        heading: t('guidelines.promise.title'),
        body: [t('guidelines.promise.p1'), t('guidelines.promise.p2')],
      },
      {
        heading: t('guidelines.twoTiers.title'),
        body: [
          t('guidelines.twoTiers.p1'),
          <P key="safety">
            <strong style={{ color: 'var(--text)' }}>{t('guidelines.twoTiers.safetyTitle')} — </strong>
            {t('guidelines.twoTiers.safetyBody')}
          </P>,
          <P key="kind">
            <strong style={{ color: 'var(--text)' }}>{t('guidelines.twoTiers.kindTitle')} — </strong>
            {t('guidelines.twoTiers.kindBody')}
          </P>,
          t('guidelines.twoTiers.p2'),
        ],
      },
      {
        heading: t('guidelines.strike.title'),
        body: [
          t('guidelines.strike.p1'),
          t('guidelines.strike.s1'),
          t('guidelines.strike.s2'),
          t('guidelines.strike.s3'),
          t('guidelines.strike.p2'),
        ],
      },
      {
        heading: t('guidelines.money.title'),
        body: [t('guidelines.money.p1'), t('guidelines.money.p2')],
      },
      {
        heading: t('guidelines.kindness.title'),
        body: [t('guidelines.kindness.p1'), t('guidelines.kindness.p2')],
      },
      {
        heading: t('guidelines.removal.title'),
        body: [t('guidelines.removal.p1'), t('guidelines.removal.p2')],
      },
    ],
  };
}

type LegalSection = {
  heading: string;
  /** Strings render as standard body paragraphs; JSX for anything richer. */
  body: ReactNode[];
};

type LegalDoc = {
  slug: LegalDocSlug;
  eyebrow: string;
  title: string;
  intro: string;
  sections: LegalSection[];
};

/** Standard body paragraph — t-body, theme-aware secondary ink. */
function P({ children }: { children: ReactNode }) {
  return (
    <p className="t-body mt-3" style={{ color: 'var(--text-secondary)' }}>
      {children}
    </p>
  );
}

/** Inline link to an in-app screen. */
function AppLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className="underline underline-offset-2" style={{ color: 'var(--text)' }}>
      {children}
    </Link>
  );
}

/** External resource row — mirrors the safety-resources sheet in Settings. */
function ResourceLink({ href, title, caption }: { href: string; title: string; caption: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="mt-2 flex min-h-[56px] items-center gap-3 rounded-2xl px-4 transition-opacity duration-fast active:opacity-70"
      style={{ background: 'var(--field)' }}
    >
      <span className="min-w-0 flex-1">
        <span className="t-button block" style={{ color: 'var(--text)' }}>
          {title}
        </span>
        <span className="t-caption block" style={{ color: 'var(--text-secondary)' }}>
          {caption}
        </span>
      </span>
      <ExternalLink
        size={16}
        style={{ color: 'var(--text-secondary)', flexShrink: 0 }}
        aria-hidden="true"
      />
    </a>
  );
}

const DOCS: Record<Exclude<LegalDocSlug, 'guidelines'>, LegalDoc> = {
  privacy: {
    slug: 'privacy',
    eyebrow: 'Legal',
    title: 'Privacy Policy',
    intro:
      'The short version: we collect what we need to match you and keep the community safe, we never sell your data, and you can export or delete everything from Settings at any time.',
    sections: [
      {
        heading: 'What we collect',
        body: [
          'Account and profile details you give us: name, age, gender, pronouns, prompts and answers, dating preferences, and an approximate location derived from your device (with permission) so the queue is actually near you.',
          'Photos you upload, voice notes you record, verification status, and the messages you send and receive — stored so we can deliver them and enforce safety rules.',
        ],
      },
      {
        heading: 'Photos & verification',
        body: [
          'Photo verification compares a short liveness capture against your profile photos. The capture is used only to verify you, is never shown to other members, and is deleted once the check completes. Your profile keeps a verification status, not the images.',
        ],
      },
      {
        heading: 'Payments & wallet',
        body: [
          'Subscriptions and purchases are processed by the app store or payment provider — we never see or store your full card number.',
          'The Smart Custody Wallet is watch-only: it reads public balances for Date-Coin and supported assets from the blockchain. We never collect, store, or have access to seed phrases or private keys. There is nothing in our systems that could move your funds.',
        ],
      },
      {
        heading: 'What we never collect',
        body: [
          'No seed phrases or private keys, ever. No precise background location tracking. No contact-list uploads without explicit permission. No selling or renting of your personal data to anyone, for any price.',
        ],
      },
      {
        heading: 'How we use your data',
        body: [
          'To build your daily queue, deliver messages, run safety and anti-scam systems, process payments, and improve matching. Consent-gated tags stay private unless you choose to share them. We do not use your private messages for advertising.',
        ],
      },
      {
        heading: 'Retention',
        body: [
          'We keep your data while your account is active. When you delete your account, your profile, matches, and messages are removed from production systems within 30 days and from encrypted backups within 90 days. Vanish-mode chats are deleted 24 hours after they start, as designed.',
        ],
      },
      {
        heading: 'Your rights (GDPR / CCPA)',
        body: [
          <P key="rights">
            You can export everything we hold about you —{' '}
            <AppLink to="/settings">Settings → Download my data</AppLink> gives you a complete JSON
            export instantly. You can correct your profile in-app at any time, and{' '}
            <AppLink to="/settings">Settings → Delete account</AppLink> removes it permanently. See
            our <AppLink to="/data">Data Requests</AppLink> page for details.
          </P>,
          'Residents of the EEA, UK, and California have additional rights (access, correction, portability, objection). Exercising them is free and never affects your membership.',
        ],
      },
      {
        heading: 'Who we share with',
        body: [
          'A short list of processors that run the service: cloud hosting, payment processing, and abuse prevention. Each is bound by contract to use your data only for the service. We disclose data to authorities only when legally required, and we tell you when the law allows.',
        ],
      },
      {
        heading: 'Security',
        body: [
          'Data is encrypted in transit and at rest. Access inside Resonance is limited to people who need it to keep the service safe and running, and is logged.',
        ],
      },
      {
        heading: 'Contact',
        body: [
          <P key="contact">
            Questions or requests:{' '}
            <a
              href="mailto:privacy@resonanse.app"
              className="underline underline-offset-2"
              style={{ color: 'var(--text)' }}
            >
              privacy@resonanse.app
            </a>
            . We answer every privacy request within 30 days.
          </P>,
        ],
      },
    ],
  },

  terms: {
    slug: 'terms',
    eyebrow: 'Legal',
    title: 'Terms of Service',
    intro:
      'These terms govern your use of Resonance. They are written to be read — no surprises buried in clause 47.',
    sections: [
      {
        heading: 'Eligibility',
        body: [
          'You must be at least 18 years old to use Resonance. By creating an account you confirm that you are 18 or older and able to form a binding agreement. One person, one account.',
        ],
      },
      {
        heading: 'Your account',
        body: [
          'Keep your login credentials to yourself and your profile honest. Photo verification is part of the deal: profiles that misrepresent identity may be suspended until verified.',
        ],
      },
      {
        heading: 'Conduct',
        body: [
          'Resonance is for meeting people in real life with intent. Harassment, hate speech, scams, solicitation, and impersonation are prohibited. The full rules live in our Community Guidelines — breaking them can end your account.',
        ],
      },
      {
        heading: 'Subscriptions & the 7-day trial',
        body: [
          'New members can start a free 7-day trial of Resonance+ — no card required. If you subscribe, your plan renews automatically until you cancel. You can cancel anytime in Settings → Membership; cancellation takes effect at the end of the current billing period and no further charges are made. Refunds follow the policy of the store you purchased through.',
        ],
      },
      {
        heading: 'Date-Coin',
        body: [
          'Date-Coin is an in-app credit used for features inside Resonance (Boosts, Pulses, community games). It is not an investment, a security, or money. It has no cash value, cannot be redeemed for currency, cannot be transferred between members, and we do not promise it will ever be exchangeable for anything outside the app. Purchased Date-Coin is non-refundable except where required by law.',
        ],
      },
      {
        heading: 'Smart Custody Wallet',
        body: [
          'The wallet view is watch-only: it displays public on-chain balances for addresses you choose to watch. Resonance never takes custody of your assets, never asks for seed phrases or private keys, and cannot initiate transactions. Anyone asking for your seed phrase — in-app or out — is scamming you.',
        ],
      },
      {
        heading: 'Community games',
        body: [
          'The community game room may include automated players. Bots are always labelled “BOT · name” in the player list, always. Games are for entertainment; there is no real-money wagering.',
        ],
      },
      {
        heading: 'Your content',
        body: [
          'You own your photos, prompts, and messages. You grant Resonance a limited license to host and display them so the service works — showing your profile to other members, delivering your messages. That license ends when you delete the content or your account, except where safety or law requires retention.',
        ],
      },
      {
        heading: 'Termination',
        body: [
          'You can delete your account anytime in Settings. We can suspend or terminate accounts that break these terms or endanger other members, with notice where reasonable.',
        ],
      },
      {
        heading: 'Limitation of liability',
        body: [
          'Resonance provides the service “as is” and is not responsible for the conduct of members, online or offline — please use the safety tools and meet in public. To the maximum extent permitted by law, our aggregate liability is limited to the amount you paid us in the 12 months before the claim. Nothing in these terms limits liability that cannot be limited by law.',
        ],
      },
      {
        heading: 'Contact',
        body: [
          <P key="contact">
            Questions about these terms:{' '}
            <a
              href="mailto:legal@resonanse.app"
              className="underline underline-offset-2"
              style={{ color: 'var(--text)' }}
            >
              legal@resonanse.app
            </a>
            .
          </P>,
        ],
      },
    ],
  },

  cookies: {
    slug: 'cookies',
    eyebrow: 'Legal',
    title: 'Cookie Preferences',
    intro:
      'Our stance is minimal on purpose: one essential session cookie and a few local preferences. No advertising trackers, no cross-site profiling, nothing to “manage” beyond clearing your browser storage.',
    sections: [
      {
        heading: 'The essential cookie',
        body: [
          'A single session cookie keeps you signed in between visits. It is strictly necessary for the service to work, contains no tracking identifiers beyond your session, and expires when you log out.',
        ],
      },
      {
        heading: 'Local preferences',
        body: [
          'Your browser’s localStorage holds interface preferences you set: theme (Warm Glass / Night HUD / system), reduced-motion preference, quiet hours, and discovery filters. These never leave your device and are not transmitted to our servers as tracking data.',
        ],
      },
      {
        heading: 'What we don’t use',
        body: [
          'No third-party advertising cookies. No cross-site trackers. No fingerprinting. No analytics beacons that follow you around the web. Because of that, you will never see a “accept 1,400 partners” banner here — there is nothing to accept.',
        ],
      },
      {
        heading: 'How to clear everything',
        body: [
          'Use your browser’s “clear site data” control for this site (usually the lock icon in the address bar → Cookies / Site data). This signs you out and resets theme and preferences to defaults. Your account, profile, and matches are unaffected — they live on our servers, not in cookies.',
        ],
      },
      {
        heading: 'Changes',
        body: [
          'If this list ever grows beyond the essentials, this page will say so before it happens, and anything non-essential will be opt-in.',
        ],
      },
      {
        heading: 'Contact',
        body: [
          <P key="contact">
            Questions:{' '}
            <a
              href="mailto:privacy@resonanse.app"
              className="underline underline-offset-2"
              style={{ color: 'var(--text)' }}
            >
              privacy@resonanse.app
            </a>
            .
          </P>,
        ],
      },
    ],
  },

  report: {
    slug: 'report',
    eyebrow: 'Safety',
    title: 'Report & Safety',
    intro:
      'Reporting takes seconds and is always confidential — the other person never learns who reported them.',
    sections: [
      {
        heading: 'Report from a profile',
        body: [
          'Open any profile sheet and tap Report. Choose the closest reason, add anything that helps (screenshots welcome), and submit. The profile is immediately hidden from your queue while we review.',
        ],
      },
      {
        heading: 'Report from a chat',
        body: [
          'Open the Trust & safety sheet inside any chat. From there you can report, block, or both — blocking stops all contact instantly and permanently unless you unblock.',
        ],
      },
      {
        heading: 'Manage blocked accounts',
        body: [
          <P key="blocked">
            <AppLink to="/settings">Settings → Blocked accounts</AppLink> lists everyone you’ve
            blocked. Unblocking restores the chance of appearing in each other’s queues; old
            conversations are not restored.
          </P>,
        ],
      },
      {
        heading: 'What happens next',
        body: [
          'A trained reviewer reads every report — no auto-bans from reports alone. Most reviews complete within 24 hours. If we need more context we may reach out to you; you’ll never be contacted about the outcome of someone else’s account, but we confirm every report was reviewed.',
        ],
      },
      {
        heading: 'Scams & financial safety',
        body: [
          'Anyone asking for money, crypto, gift cards, or your seed phrase is a scammer — full stop. Resonance’s wallet is watch-only and staff will never request credentials. Report first, ask questions later.',
        ],
      },
      {
        heading: 'Emergency resources',
        body: [
          'Free, confidential, 24/7. You don’t have to handle anything alone.',
          <div key="resources" className="mt-3 flex flex-col gap-2">
            <ResourceLink
              href="https://rainn.org"
              title="RAINN"
              caption="National Sexual Assault Hotline — 1-800-656-4673"
            />
            <ResourceLink
              href="https://www.crisistextline.org"
              title="Crisis Text Line"
              caption="Text HOME to 741741 — trained counselors, any crisis"
            />
          </div>,
          'In immediate danger? Call your local emergency number first, then report in-app so we can preserve evidence and act on the account.',
        ],
      },
      {
        heading: 'False reporting',
        body: [
          'Reports made in good faith are always protected. Deliberately false or retaliatory reporting is itself a guidelines violation.',
        ],
      },
      {
        heading: 'Contact the safety team',
        body: [
          <P key="contact">
            <a
              href="mailto:safety@resonanse.app"
              className="underline underline-offset-2"
              style={{ color: 'var(--text)' }}
            >
              safety@resonanse.app
            </a>{' '}
            — for anything urgent that doesn’t fit the in-app tools.
          </P>,
        ],
      },
    ],
  },

  data: {
    slug: 'data',
    eyebrow: 'Legal',
    title: 'Data Requests',
    intro:
      'Your data is yours. Export it or erase it directly from Settings — no forms, no waiting on an agent for the standard requests.',
    sections: [
      {
        heading: 'Export your data',
        body: [
          <P key="export">
            Go to <AppLink to="/settings">Settings → Download my data</AppLink>. The export starts
            immediately and downloads as a single JSON file (resonance-data.json) containing
            everything we hold about your account.
          </P>,
        ],
      },
      {
        heading: 'What the export includes',
        body: [
          'Your profile and preferences, photos and prompt answers, verification status, match and message history, consent-tag settings, purchase and entitlement records, and your Date-Coin balance and watched wallet addresses.',
        ],
      },
      {
        heading: 'Delete your account',
        body: [
          <P key="delete">
            Go to <AppLink to="/settings">Settings → Delete account</AppLink> and confirm with the
            hold-to-confirm control. Deletion is permanent and starts immediately — there is no
            grace period once confirmed.
          </P>,
        ],
      },
      {
        heading: 'What deletion removes',
        body: [
          'Your profile, photos, voice notes, matches, and messages are removed from production systems within 30 days and from encrypted backups within 90 days. Purchase records required for tax and fraud purposes may be retained as the law requires, stripped of profile data.',
        ],
      },
      {
        heading: 'Response expectations',
        body: [
          'Exports and deletions through Settings are self-serve and immediate. Anything else — access requests for a deceased member’s account, data questions from authorities, corrections you can’t make in-app — email us and we respond within 30 days, usually much faster.',
        ],
      },
      {
        heading: 'Verification of requests',
        body: [
          'Self-serve actions are authorized by your signed-in session. For email requests we verify identity against account details before disclosing or changing anything — we will never email your data to an address that isn’t on the account.',
        ],
      },
      {
        heading: 'Contact',
        body: [
          <P key="contact">
            <a
              href="mailto:privacy@resonanse.app"
              className="underline underline-offset-2"
              style={{ color: 'var(--text)' }}
            >
              privacy@resonanse.app
            </a>{' '}
            — GDPR, CCPA, and every other data-rights request lands here.
          </P>,
        ],
      },
    ],
  },
};

const DOC_ORDER: LegalDocSlug[] = ['privacy', 'terms', 'cookies', 'guidelines', 'report', 'data'];

export default function Legal({ doc }: { doc: LegalDocSlug }) {
  const navigate = useNavigate();
  const { t } = useTranslation('landing');
  const d = doc === 'guidelines' ? buildGuidelinesDoc(t) : DOCS[doc];
  return (
    <div className="relative min-h-[100dvh] overflow-x-clip">
      <StageBackdrop />
      <header className="relative z-10 mx-auto flex w-full max-w-3xl items-center justify-between px-5 pt-6">
        <BtnGhost onClick={() => navigate(-1)} ariaLabel="Go back">
          <ArrowLeft size={18} aria-hidden="true" />
          Back
        </BtnGhost>
        <Link to="/" className="flex items-center gap-2" aria-label="Resonance home">
          <span className="t-logo text-base" style={{ color: 'var(--text)' }}>
            Resonance.
          </span>
          <BrandMark size={22} />
        </Link>
      </header>

      <main className="relative z-10 mx-auto w-full max-w-3xl px-5 pb-24 pt-10">
        <p className="t-eyebrow">{d.eyebrow}</p>
        <h1 className="t-title mt-2" style={{ color: 'var(--text)' }}>
          {d.title}
        </h1>
        <p className="t-caption mt-2" style={{ color: 'var(--text-secondary)' }}>
          Last updated {LAST_UPDATED}
        </p>
        <p className="t-body mt-5" style={{ color: 'var(--text-secondary)' }}>
          {d.intro}
        </p>

        <div className="mt-8 flex flex-col gap-4">
          {d.sections.map((s, i) => (
            <GlassCard key={s.heading} ringX={(i % 3) * 40} className="p-6">
              <h2 className="t-title-sm" style={{ color: 'var(--text)' }}>
                {s.heading}
              </h2>
              {s.body.map((node, j) =>
                typeof node === 'string' ? <P key={j}>{node}</P> : <div key={j}>{node}</div>,
              )}
            </GlassCard>
          ))}
        </div>

        <nav className="mt-10" aria-label="More legal and safety documents">
          <p className="t-micro uppercase" style={{ color: 'var(--text-secondary)' }}>
            More documents
          </p>
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
            {DOC_ORDER.filter((s) => s !== doc).map((s) => (
              <Link
                key={s}
                to={`/${s}`}
                className="t-caption underline underline-offset-2"
                style={{ color: 'var(--text-secondary)' }}
              >
                {s === 'guidelines' ? t('guidelines.title') : DOCS[s].title}
              </Link>
            ))}
          </div>
        </nav>
      </main>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Route wrappers — one per public route in App.tsx                    */
/* ------------------------------------------------------------------ */
export function PrivacyPolicy() {
  return <Legal doc="privacy" />;
}
export function TermsOfService() {
  return <Legal doc="terms" />;
}
export function CookiePreferences() {
  return <Legal doc="cookies" />;
}
export function CommunityGuidelines() {
  return <Legal doc="guidelines" />;
}
export function ReportSafety() {
  return <Legal doc="report" />;
}
export function DataRequests() {
  return <Legal doc="data" />;
}
