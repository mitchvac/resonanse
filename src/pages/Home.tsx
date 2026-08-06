import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  motion,
  useInView,
  useMotionValue,
  useTransform,
  animate,
  AnimatePresence,
} from 'framer-motion';
import {
  ChevronDown,
  BadgeCheck,
  Shield,
  EyeOff,
  Ghost,
  ScanFace,
  HeartHandshake,
} from 'lucide-react';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import StageBackdrop from '@/components/StageBackdrop';
import GlassCard from '@/components/GlassCard';
import BrandMark from '@/components/BrandMark';
import { BtnPrimary, BtnGhost } from '@/components/ui/buttons';
import LandingFX from '@/components/landing/LandingFX';
import HeroPhone from '@/components/landing/HeroPhone';
import ShareButton from '@/components/ShareButton';
import LightTrail from '@/components/LightTrail';
import { cn } from '@/lib/utils';

const EASE_OUT = [0.22, 1, 0.36, 1] as [number, number, number, number];

/* ------------------------------------------------------------------ */
/* Reveal helpers (Framer Motion — UI-level, no GSAP overlap)          */
/* ------------------------------------------------------------------ */

function Reveal({
  children,
  delay = 0,
  y = 24,
  className,
}: {
  children: ReactNode;
  delay?: number;
  y?: number;
  className?: string;
}) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ amount: 0.2, once: true }}
      transition={{ duration: 0.38, delay, ease: EASE_OUT }}
    >
      {children}
    </motion.div>
  );
}

/** Word-level headline reveal: each word translateY 40px + opacity, 60ms stagger */
function Words({
  text,
  className,
  delay = 0,
  onLoad = false,
}: {
  text: string;
  className?: string;
  delay?: number;
  onLoad?: boolean;
}) {
  const words = text.split(' ');
  const anim = { opacity: 1, y: 0 };
  return (
    <span className={className} aria-label={text} role="text">
      {words.map((w, i) => (
        <motion.span
          key={i}
          className="inline-block overflow-hidden align-bottom"
          aria-hidden="true"
        >
          <motion.span
            className="inline-block"
            initial={{ opacity: 0, y: 40 }}
            {...(onLoad
              ? { animate: anim }
              : { whileInView: anim, viewport: { amount: 0.2, once: true } })}
            transition={{ duration: 0.56, delay: delay + i * 0.06, ease: EASE_OUT }}
          >
            {w}
            {i < words.length - 1 ? ' ' : ''}
          </motion.span>
        </motion.span>
      ))}
    </span>
  );
}

/** Number count-up: 600ms ease-out on first viewport entry */
function CountUp({
  to,
  prefix = '',
  suffix = '',
  className,
}: {
  to: number;
  prefix?: string;
  suffix?: string;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { amount: 0.6, once: true });
  const mv = useMotionValue(0);
  const rounded = useTransform(mv, (v) => `${prefix}${Math.round(v)}${suffix}`);

  useEffect(() => {
    if (!inView) return;
    const controls = animate(mv, to, { duration: 0.6, ease: EASE_OUT });
    return controls.stop;
  }, [inView, mv, to]);

  return (
    <span ref={ref} className={className}>
      <motion.span>{rounded}</motion.span>
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* §1 Hero                                                             */
/* ------------------------------------------------------------------ */

function Hero() {
  return (
    <section
      data-fx="hero"
      className="relative flex min-h-[100dvh] items-center overflow-hidden"
    >
      {/* faint ring arcs behind the phone (scale 1.1→1 via GSAP) */}
      <div
        data-fx="hero-rings"
        className="pointer-events-none absolute right-[-10%] top-1/2 hidden -translate-y-1/2 md:block"
        aria-hidden="true"
      >
        <svg width="640" height="640" viewBox="0 0 640 640" fill="none">
          <g stroke="var(--ring-stroke)" strokeWidth="2">
            <circle cx="320" cy="320" r="180" />
            <circle cx="320" cy="320" r="250" />
            <circle cx="320" cy="320" r="318" />
          </g>
        </svg>
      </div>

      <div className="mx-auto grid w-full max-w-6xl items-center gap-12 px-5 pb-16 pt-28 md:grid-cols-[minmax(0,560px)_1fr] md:pt-16">
        <div>
          <motion.p
            className="t-eyebrow"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.32 }}
          >
            Dating, de-noised
          </motion.p>
          <h1 className="t-display mt-4" style={{ color: 'var(--text-ink)' }}>
            <Words text="Less swiping. More meeting." onLoad delay={0.1} />
          </h1>
          <motion.p
            className="t-value mt-5 max-w-md"
            style={{ color: 'var(--text-ink)' }}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.32, delay: 0.5, ease: EASE_OUT }}
          >
            A daily queue of 5–10 people chosen for mutual intent — not an
            endless deck designed to keep you single and scrolling.
          </motion.p>
          <motion.div
            className="mt-8 flex flex-wrap items-center gap-4"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.32, delay: 0.62, ease: EASE_OUT }}
          >
            {/* AUTH-SLOT: rewired to useAuth() in Phase 5 */}
            <BtnPrimary to="/signin">Get started</BtnPrimary>
            <BtnGhost
              onClick={() =>
                document
                  .getElementById('philosophy')
                  ?.scrollIntoView({ behavior: 'smooth' })
              }
            >
              See how it works ↓
            </BtnGhost>
            <ShareButton />
          </motion.div>
          <motion.p
            className="t-caption mt-5"
            style={{ color: 'var(--text-secondary)' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.32, delay: 0.74 }}
          >
            Free to start · Photo-verified community · All genders, all
            structures
          </motion.p>
          <motion.div
            className="mt-10"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.86, ease: EASE_OUT }}
          >
            <div
              className="dc-card"
              role="note"
              aria-label="Founding member offer: 10,000 Date Coins"
            >
              <svg
                className="dc-card__rings"
                viewBox="0 0 334 207"
                preserveAspectRatio="none"
                aria-hidden="true"
              >
                <g fill="none" strokeWidth="2" transform="rotate(15 46 -60)">
                  {[70, 130, 190, 250].map((r) => (
                    <circle key={r} cx="46" cy="-60" r={r} />
                  ))}
                </g>
              </svg>
              <div className="dc-card__sheen" aria-hidden="true" />
              <div className="dc-card__grain" aria-hidden="true" />
              <div className="relative flex h-full flex-col gap-4 px-[22px] pb-6 pt-[22px]">
                <div className="flex items-center justify-between gap-3">
                  <span className="dc-card__meta text-[#F0D9A8]">
                    Resonance · founding offer
                  </span>
                  <span className="dc-card__meta text-white/70">
                    Grows every year
                  </span>
                </div>
                <p className="dc-card__title">10,000 Date Coins</p>
                <div className="dc-card__coin">
                  <div className="dc-card__coin-img" />
                  <div className="dc-card__coin-vignette" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <p className="text-[14px] font-bold leading-[19px] text-white">
                    For our first 100,000 founding members
                  </p>
                  <p className="text-[13px] leading-[20px] text-white/[0.82]">
                    A discount that grows every year you&rsquo;re with us.
                  </p>
                </div>
                <div className="mt-1 flex items-center gap-3">
                  <span className="dc-card__pill">
                    Founding Member Exclusive
                  </span>
                </div>
              </div>
            </div>
          </motion.div>
        </div>

        <div data-fx="hero-phone" className="relative">
          <HeroPhone />
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* §2 The problem                                                      */
/* ------------------------------------------------------------------ */

type Stat = { label: string; ringX: number; value?: number; suffix?: string; static?: string };
const STATS: Stat[] = [
  { value: 47, suffix: ' min', label: 'SWIPING / DAY', ringX: -60 },
  { value: 3, suffix: '%', label: 'MATCH → DATE', ringX: 0 },
  { static: '1 in 2', label: 'FEEL WORSE', ringX: 80 },
];

function Problem() {
  return (
    <section className="relative py-24 md:py-32">
      <div className="mx-auto max-w-2xl px-5 text-center">
        <Reveal>
          <p className="t-eyebrow-on-stage">The problem</p>
          <h2 className="t-heading mt-3" style={{ color: 'var(--text-ink)' }}>
            Endless decks. Mixed intents. Dead chats.
          </h2>
          <p className="t-value mt-4 text-ink-secondary">
            Legacy apps monetize your loneliness. Volume over quality, paywalls
            over outcomes, and a swipe economy that rewards never meeting.
          </p>
        </Reveal>
      </div>
      <div className="relative mx-auto mt-12 max-w-4xl px-5">
        {/* Light-trail thread connecting the three stat cards (home.md §2) —
            draws via dashoffset 600ms on entry; sits above the stage, below cards */}
        <LightTrail
          width={896}
          height={160}
          d="M 20 80 C 180 20, 300 140, 448 80 S 716 20, 876 80"
          nodes={[
            { x: 20, y: 80 },
            { x: 448, y: 80 },
            { x: 876, y: 80 },
          ]}
          className="hidden sm:block"
          style={{ left: '50%', top: '50%', transform: 'translate(-50%, -50%)', zIndex: 0 }}
        />
        <div className="relative grid gap-4 sm:grid-cols-3">
          {STATS.map((s, i) => (
            <Reveal key={s.label} delay={0.08 * i}>
              <GlassCard
                ringX={s.ringX}
                className="p-6 text-center transition-[transform,box-shadow] duration-med ease-glassy-out hover:-translate-y-0.5 hover:shadow-[var(--glass-shadow-lift)]"
              >
                <p className="t-title">
                  {s.static ? (
                    s.static
                  ) : (
                    <CountUp to={s.value ?? 0} suffix={s.suffix ?? ''} />
                  )}
                </p>
                <p className="t-micro mt-2">{s.label}</p>
              </GlassCard>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* §3 The Resonance loop                                               */
/* ------------------------------------------------------------------ */

const LOOP_STEPS = [
  {
    n: '1',
    title: 'State your intent',
    body: 'Serious, casual, explore, ENM, friendship — declared up front, matched on mutuality.',
    ringX: -40,
  },
  {
    n: '2',
    title: 'Get your daily queue',
    body: '5–10 curated profiles. Compatibility, intent alignment, and real behavioral signals.',
    ringX: 30,
  },
  {
    n: '3',
    title: 'Send signal, not spam',
    body: 'Limited likes. Comment on prompts. Spend a Pulse when someone really matters.',
    ringX: -80,
  },
  {
    n: '4',
    title: 'Meet in real life',
    body: 'AI starters, date ideas, and a We Met loop that keeps tuning your matches.',
    ringX: 60,
  },
];

function Loop() {
  return (
    <section id="philosophy" data-fx="loop" className="relative py-24 md:py-32">
      <div className="mx-auto max-w-6xl px-5">
        <Reveal className="max-w-xl">
          <p className="t-eyebrow-on-stage">The Resonance loop</p>
          <h2 className="t-heading mt-3" style={{ color: 'var(--text-ink)' }}>
            Four steps. One direction: offline.
          </h2>
        </Reveal>

        <div className="relative mt-14">
          {/* violet progress line (mobile timeline) */}
          <div
            className="absolute left-[7px] top-0 h-full w-0.5 bg-field md:hidden"
            aria-hidden="true"
          />
          <div
            data-fx="loop-line"
            className="absolute left-[7px] top-0 h-full w-0.5 bg-violet md:hidden"
            aria-hidden="true"
          />
          <ol className="grid gap-10 md:grid-cols-4 md:gap-4">
            {LOOP_STEPS.map((step, i) => (
              <li key={step.n} className="relative pl-8 md:pl-0">
                <span
                  className="absolute left-0 top-2 h-3.5 w-3.5 rounded-full bg-violet md:hidden"
                  aria-hidden="true"
                />
                <Reveal delay={0.1 * i} y={32}>
                  <GlassCard
                    ringX={step.ringX}
                    className="h-full p-6 transition-transform duration-med ease-glassy-out hover:-translate-y-0.5"
                  >
                    <p className="t-title text-violet">{step.n}</p>
                    <h3 className="t-title-sm mt-2">{step.title}</h3>
                    <p className="t-caption mt-2 text-secondary">{step.body}</p>
                  </GlassCard>
                </Reveal>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
/* ------------------------------------------------------------------ */
/* §4 Modes                                                            */
/* ------------------------------------------------------------------ */

const MODES = [
  {
    title: 'Daily Queue',
    caption: 'Your 5–10 best shots at something real. Refreshes at noon.',
    tier: 'FREE',
    bullets: ['Curated on intent + compatibility', 'Refreshes at noon', 'Filters & dealbreakers included'],
    vignette: 'queue',
  },
  {
    title: 'Classic Swipe',
    caption: 'Volume mode, when you want it. Intent filters still on.',
    tier: 'FREE',
    bullets: ['Full deck access', 'Intent filters stay on', 'Same limited likes'],
    vignette: 'swipe',
  },
  {
    title: 'Nearby Feed',
    caption: 'Real-time, local, now.',
    tier: 'RESONANCE+',
    bullets: ['Live local grid', 'Activity-based surfacing', 'Same safety rules'],
    vignette: 'nearby',
  },
  {
    title: 'Events',
    caption: 'RSVP and meet IRL, low pressure.',
    tier: 'FREE',
    bullets: ['Curated local events', 'See who else is going', 'Group-first formats'],
    vignette: 'events',
  },
  {
    title: 'Travel',
    caption: 'Change your city before you land.',
    tier: 'RESONANCE X',
    bullets: ['Set your destination early', 'Queue pre-builds on arrival', 'Local date ideas ready'],
    vignette: 'travel',
  },
] as const;

function ModeVignette({ kind }: { kind: string }) {
  /* tiny CSS-only UI vignettes */
  if (kind === 'queue')
    return (
      <div className="flex items-end justify-center gap-2" aria-hidden="true">
        {[0.7, 1, 0.8].map((o, i) => (
          <div
            key={i}
            className="w-10 rounded-lg bg-field"
            style={{ height: 44 + i * 8, opacity: o }}
          />
        ))}
      </div>
    );
  if (kind === 'swipe')
    return (
      <div className="relative mx-auto h-16 w-16" aria-hidden="true">
        <div className="absolute inset-0 rotate-[-8deg] rounded-xl bg-field" />
        <div className="absolute inset-0 rotate-[6deg] rounded-xl bg-field-focus" />
      </div>
    );
  if (kind === 'nearby')
    return (
      <div className="relative mx-auto h-16 w-full max-w-[140px]" aria-hidden="true">
        {[
          { l: '12%', t: '20%' },
          { l: '55%', t: '55%' },
          { l: '75%', t: '15%' },
        ].map((p, i) => (
          <span
            key={i}
            className="absolute h-2.5 w-2.5 rounded-full bg-violet"
            style={{ left: p.l, top: p.t }}
          />
        ))}
        <span
          className="absolute left-[38%] top-[30%] h-3.5 w-3.5 rounded-full"
          style={{ background: 'var(--text)' }}
        />
      </div>
    );
  if (kind === 'events')
    return (
      <div className="mx-auto grid w-full max-w-[140px] grid-cols-4 gap-1.5" aria-hidden="true">
        {Array.from({ length: 8 }, (_, i) => (
          <div
            key={i}
            className={cn('h-6 rounded-md', i === 5 ? 'bg-violet' : 'bg-field')}
          />
        ))}
      </div>
    );
  return (
    <div className="flex items-center justify-center gap-2" aria-hidden="true">
      {['LIS', 'TYO', 'CDG'].map((c) => (
        <span key={c} className="t-micro rounded-full bg-field px-2.5 py-1.5">
          {c}
        </span>
      ))}
    </div>
  );
}

function ModePanel({ mode, index }: { mode: (typeof MODES)[number]; index: number }) {
  const [flipped, setFlipped] = useState(false);
  return (
    <Reveal delay={0.08 * index} className="shrink-0 snap-start">
      <button
        type="button"
        onClick={() => setFlipped((f) => !f)}
        className="block h-[360px] w-[280px] [perspective:1200px]"
        aria-pressed={flipped}
        aria-label={`${mode.title} — tap for details`}
      >
        <motion.div
          className="relative h-full w-full [transform-style:preserve-3d]"
          animate={{ rotateY: flipped ? 180 : 0 }}
          transition={{ duration: 0.48, ease: EASE_OUT }}
        >
          <div className="absolute inset-0 [backface-visibility:hidden]">
            {/* Daily Queue is the rail hero — the only edge-glow surface in
                this section (home.md §4 / design.md §3.3 budget) */}
            <GlassCard
              edge={index === 0 ? 'amber' : 'none'}
              ringX={index * 40 - 60}
              className="h-full p-6 text-left"
            >
              <div className="flex h-full flex-col">
                <p className="t-micro" style={{ color: 'var(--text-secondary)' }}>
                  {mode.tier}
                </p>
                <h3 className="t-title-sm mt-2">{mode.title}</h3>
                <p className="t-caption mt-2 text-secondary">{mode.caption}</p>
                <div className="mt-auto">
                  <ModeVignette kind={mode.vignette} />
                </div>
              </div>
            </GlassCard>
          </div>
          <div className="absolute inset-0 [backface-visibility:hidden] [transform:rotateY(180deg)]">
            <GlassCard className="h-full p-6 text-left">
              <h3 className="t-title-sm">{mode.title}</h3>
              <ul className="mt-4 space-y-3">
                {mode.bullets.map((b) => (
                  <li key={b} className="t-caption flex items-start gap-2">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-violet" aria-hidden="true" />
                    {b}
                  </li>
                ))}
              </ul>
            </GlassCard>
          </div>
        </motion.div>
      </button>
    </Reveal>
  );
}

function Modes() {
  return (
    <section id="modes" data-fx="modes" className="relative overflow-hidden py-24 md:py-32">
      <div className="mx-auto max-w-6xl px-5">
        <Reveal>
          <p className="t-eyebrow-on-stage">Modes</p>
          <h2 className="t-heading mt-3" style={{ color: 'var(--text-ink)' }}>
            One app, every way to meet
          </h2>
        </Reveal>
      </div>
      <div
        data-fx="modes-rail"
        className="no-scrollbar mt-12 flex snap-x snap-mandatory gap-4 overflow-x-auto px-5 md:px-[max(1.25rem,calc((100vw-72rem)/2))]"
      >
        {MODES.map((m, i) => (
          <ModePanel key={m.title} mode={m} index={i} />
        ))}
        <div className="w-1 shrink-0" aria-hidden="true" />
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* §5 Outcomes band                                                    */
/* ------------------------------------------------------------------ */

function Outcomes() {
  return (
    <section data-fx="outcomes" className="relative my-8 overflow-hidden md:my-16">
      <div className="relative h-[80dvh] min-h-[520px] w-full overflow-hidden">
        <img
          data-fx="outcomes-img"
          src="/landing-date.jpg"
          alt="A couple mid-laugh at a small café table in the evening"
          className="absolute inset-0 h-full w-full object-cover"
          loading="lazy"
        />
        <div className="photo-scrim absolute inset-0" aria-hidden="true" />
        <div className="absolute inset-x-0 bottom-0 mx-auto w-full max-w-6xl px-5 pb-10">
          <Reveal y={40}>
            {/* Section hero glow surface (home.md §5): edge amber in Warm
                Glass / HUD gradient in Night HUD */}
            <GlassCard edge="amber" className="max-w-lg p-7">
              <p className="t-eyebrow">Outcomes, not engagement</p>
              <h2 className="t-heading mt-3">
                The metric we optimize is your first date.
              </h2>
              <p className="t-value mt-3">
                Our We Met loop asks how it went — and every answer makes the
                next queue sharper.
              </p>
              <p className="t-caption mt-4 text-secondary">
                68% match→conversation · 31% conversation→date · 4.6★ match
                quality (beta cohort)
              </p>
            </GlassCard>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* §6 Safety & intent                                                  */
/* ------------------------------------------------------------------ */

const SAFETY_ROWS = [
  { icon: BadgeCheck, title: 'Photo verification', body: 'Mandatory selfie + live check. No badge, no browsing.' },
  { icon: Shield, title: 'Screenshot alerts', body: 'If someone screenshots your chat or photos, you know.' },
  { icon: EyeOff, title: 'Hidden words', body: 'Filter the phrases you never want to receive.' },
  { icon: Ghost, title: 'Anonymity mode', body: 'Browse unseen until you choose to be seen.' },
  { icon: ScanFace, title: 'AI scam defense', body: 'Romance-scam patterns flagged before they reach you.' },
  { icon: HeartHandshake, title: 'Consent tools', body: 'Clear, in-app ways to set and respect boundaries.' },
];

function Safety() {
  return (
    <section id="safety" className="relative py-24 md:py-32">
      <div className="mx-auto grid max-w-6xl gap-12 px-5 md:grid-cols-2">
        <div className="md:sticky md:top-28 md:self-start">
          <Reveal>
            <p className="t-eyebrow-on-stage">Safety & intent</p>
            <h2 className="t-heading mt-3" style={{ color: 'var(--text-ink)' }}>
              Safety isn't a settings page.
            </h2>
            <p className="t-value mt-4 max-w-md text-ink-secondary">
              Verification, consent, and reporting are first-class UI — visible
              where you browse, match, and chat. Never buried three menus deep.
            </p>
          </Reveal>
        </div>
        <div className="space-y-3">
          {SAFETY_ROWS.map((row, i) => (
            <Reveal key={row.title} delay={0.06 * i}>
              <div className="group flex items-start gap-4 rounded-[20px] bg-field p-5 transition-transform duration-med ease-glassy-out hover:-translate-y-0.5">
                <span className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-field-focus">
                  <row.icon size={20} style={{ color: 'var(--text)' }} aria-hidden="true" />
                  <span
                    className="absolute inset-0 rounded-full opacity-0 ring-2 ring-violet transition-opacity duration-med group-hover:opacity-100"
                    aria-hidden="true"
                  />
                </span>
                <div>
                  <h3 className="t-title-sm">{row.title}</h3>
                  <p className="t-caption mt-1 text-secondary">{row.body}</p>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
/* ------------------------------------------------------------------ */
/* §7 Testimonials                                                     */
/* ------------------------------------------------------------------ */

const QUOTES = [
  {
    img: '/avatar-t1.jpg',
    name: 'Elena, 29',
    quote: 'The daily cap felt limiting for a day. Then it felt like relief.',
  },
  {
    img: '/avatar-t2.jpg',
    name: 'Arjun, 33',
    quote: 'Prompts did what my opening lines never could. We met in five days.',
  },
  {
    img: '/avatar-t3.jpg',
    name: 'Ren, 27',
    quote: 'First app where stating my intent upfront didn\u2019t scare people off — it attracted the right ones.',
  },
];

function Testimonials() {
  return (
    <section className="relative py-24 md:py-32">
      <div className="mx-auto max-w-6xl px-5">
        <Reveal className="text-center">
          <p className="t-eyebrow-on-stage">Early signals</p>
          <h2 className="t-heading mt-3" style={{ color: 'var(--text-ink)' }}>
            People who stopped scrolling
          </h2>
        </Reveal>
        <div className="mt-12 grid gap-4 md:grid-cols-3">
          {QUOTES.map((q, i) => (
            <Reveal key={q.name} delay={0.1 * i} y={40}>
              <GlassCard ringX={i * 50 - 40} className="h-full p-6">
                <img
                  src={q.img}
                  alt={`${q.name} headshot`}
                  className="h-10 w-10 rounded-full object-cover"
                  loading="lazy"
                />
                <p className="t-value mt-4">“{q.quote}”</p>
                <p className="t-caption mt-4 text-secondary">{q.name}</p>
              </GlassCard>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* §8 Pricing teaser                                                   */
/* ------------------------------------------------------------------ */

function Pricing() {
  const plusRef = useRef<HTMLDivElement>(null);
  const plusInView = useInView(plusRef, { amount: 0.5, once: true });

  return (
    <section id="pricing" className="relative py-24 md:py-32">
      <div className="mx-auto max-w-6xl px-5 text-center">
        <Reveal>
          <p className="t-eyebrow-on-stage">Pricing</p>
          <h2 className="t-heading mt-3" style={{ color: 'var(--text-ink)' }}>
            Free is real. Plus is power. X is wings.
          </h2>
          <p className="t-value mx-auto mt-4 max-w-lg text-ink-secondary">
            Resonance works without paying. Resonance+ and Resonance X add
            depth for people who want more signal, more reach, and more places.
          </p>
        </Reveal>

        <div className="mx-auto mt-12 grid max-w-4xl gap-4 text-left sm:grid-cols-3">
          <Reveal>
            <GlassCard ringX={-40} className="h-full p-6">
              <p className="t-micro" style={{ color: 'var(--text-secondary)' }}>
                FREE
              </p>
              <h3 className="t-title-sm mt-2">Start with intent</h3>
              <p className="t-caption mt-3 text-secondary">
                Daily queue · Limited likes · Full safety stack · Events RSVP
              </p>
            </GlassCard>
          </Reveal>
          <Reveal delay={0.08}>
            <div ref={plusRef}>
              {/* Teaser hero (home.md §8): edge amber/hud + one-time edge-glow
                  energize (opacity 0→1, 560ms) when scrolled into view */}
              <GlassCard
                edge="amber"
                className={cn(
                  'relative h-full p-6',
                  plusInView ? 'edge-energize' : 'edge-gated',
                )}
              >
                <p className="t-micro text-violet">RESONANCE+</p>
                <h3 className="t-title-sm mt-2">Deeper signal</h3>
                <p className="t-caption mt-3 text-secondary">
                  See who likes you · More Pulses · Advanced filters · Nearby feed
                </p>
              </GlassCard>
            </div>
          </Reveal>
          <Reveal delay={0.16}>
            <GlassCard ringX={60} className="h-full p-6">
              <p className="t-micro" style={{ color: 'var(--text-secondary)' }}>
                RESONANCE X
              </p>
              <h3 className="t-title-sm mt-2">Go anywhere</h3>
              <p className="t-caption mt-3 text-secondary">
                Everything in + · Travel mode · Priority placement · X-only events
              </p>
            </GlassCard>
          </Reveal>
        </div>

        <Reveal delay={0.2} className="mt-8">
          {/* AUTH-SLOT: rewired to useAuth() in Phase 5 */}
          <BtnGhost to="/login">Compare plans →</BtnGhost>
        </Reveal>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* §9 FAQ                                                              */
/* ------------------------------------------------------------------ */

const FAQS = [
  {
    q: 'Is Resonance free?',
    a: 'Yes. The daily queue, limited likes, messaging, events, and the full safety stack are free forever. Resonance+ and X add convenience and reach — never core safety.',
  },
  {
    q: 'Why a daily limit?',
    a: 'Because attention is the ingredient. A small queue means every profile gets read, every like means something, and the app can optimize for dates instead of time-on-screen.',
  },
  {
    q: 'How does photo verification work?',
    a: 'During onboarding you take a selfie and pass a quick live check. Verified members get a badge; unverified accounts can’t browse or be seen. It takes under a minute.',
  },
  {
    q: 'What is a Pulse?',
    a: 'A Pulse is a super-like with weight. It pins you to the top of their Likes You grid with a violet underline. They’re intentionally scarce — free members get a few per week.',
  },
  {
    q: 'Which modes are free?',
    a: 'Daily Queue, Classic Swipe, and Events are free. Nearby Feed is Resonance+. Travel mode is Resonance X. Filters and dealbreakers are free in every mode.',
  },
];

function Faq() {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <section className="relative py-24 md:py-32">
      <div className="mx-auto max-w-2xl px-5">
        <Reveal className="text-center">
          <p className="t-eyebrow-on-stage">FAQ</p>
          <h2 className="t-heading mt-3" style={{ color: 'var(--text-ink)' }}>
            Fair questions
          </h2>
        </Reveal>
        <Reveal delay={0.1} className="mt-10">
          <GlassCard className="p-2">
            {FAQS.map((item, i) => {
              const isOpen = open === i;
              return (
                <div key={item.q} className={cn(i > 0 && 'mt-2')}>
                  <button
                    type="button"
                    onClick={() => setOpen(isOpen ? null : i)}
                    aria-expanded={isOpen}
                    className="flex min-h-[44px] w-full items-center justify-between gap-4 rounded-2xl bg-field px-5 py-4 text-left"
                  >
                    <span className="t-value font-bold">{item.q}</span>
                    <motion.span
                      animate={{ rotate: isOpen ? 180 : 0 }}
                      transition={{ duration: 0.24, ease: EASE_OUT }}
                      className="shrink-0"
                    >
                      <ChevronDown size={18} style={{ color: 'var(--text)' }} aria-hidden="true" />
                    </motion.span>
                  </button>
                  <AnimatePresence initial={false}>
                    {isOpen && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.24, ease: EASE_OUT }}
                        className="overflow-hidden"
                      >
                        <p className="t-body px-5 py-4 text-secondary">{item.a}</p>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </GlassCard>
        </Reveal>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* §10 Final CTA                                                       */
/* ------------------------------------------------------------------ */

function FinalCta() {
  return (
    <section className="relative px-5 py-28 text-center md:py-36">
      <motion.div
        className="mx-auto flex justify-center"
        initial={{ opacity: 0, scale: 0.7 }}
        whileInView={{ opacity: 1, scale: 1 }}
        viewport={{ amount: 0.4, once: true }}
        transition={{ duration: 0.56, ease: EASE_OUT }}
      >
        <BrandMark size={72} />
      </motion.div>
      <h2 className="t-heading mx-auto mt-8 max-w-md" style={{ color: 'var(--text-ink)' }}>
        <Words text="Your queue opens tomorrow at noon." />
      </h2>
      <Reveal delay={0.2}>
        <p className="t-value mx-auto mt-4 max-w-sm text-ink-secondary">
          Build your profile tonight. Wake up to people worth meeting.
        </p>
        <div className="relative mt-9 inline-block">
          <span
            className="pointer-events-none absolute inset-0 animate-ping rounded-full ring-1 ring-violet [animation-delay:800ms] [animation-iteration-count:2]"
            aria-hidden="true"
          />
          {/* AUTH-SLOT: rewired to useAuth() in Phase 5 */}
          <BtnPrimary to="/signin" className="h-14 px-10">
            Create your profile
          </BtnPrimary>
        </div>
        <p className="t-caption mt-5" style={{ color: 'var(--text-secondary)' }}>
          Free to start · Takes two minutes · Photo verification required
        </p>
        <div className="mt-7 flex justify-center">
          <ShareButton label="Share with a friend who needs this" />
        </div>
      </Reveal>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export default function Home() {
  return (
    <LandingFX>
      <div className="relative min-h-[100dvh] overflow-x-clip">
        <StageBackdrop />
        <Navbar />
        <main>
          <Hero />
          <Problem />
          <Loop />
          <Modes />
          <Outcomes />
          <Safety />
          <Testimonials />
          <Pricing />
          <Faq />
          <FinalCta />
        </main>
        <Footer />
      </div>
    </LandingFX>
  );
}
