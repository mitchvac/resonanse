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
          <h1 className="t-display mt-4 text-white">
            <Words text="Less swiping. More meeting." onLoad delay={0.1} />
          </h1>
          <motion.p
            className="t-value mt-5 max-w-md text-secondary"
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
            <BtnPrimary to="/login">Get started</BtnPrimary>
            <BtnGhost
              onClick={() =>
                document
                  .getElementById('philosophy')
                  ?.scrollIntoView({ behavior: 'smooth' })
              }
            >
              See how it works ↓
            </BtnGhost>
          </motion.div>
          <motion.p
            className="t-caption mt-5 text-white/50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.32, delay: 0.74 }}
          >
            Free to start · Photo-verified community · All genders, all
            structures
          </motion.p>
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
      <div className="mx-auto mt-12 grid max-w-4xl gap-4 px-5 sm:grid-cols-3">
        {STATS.map((s, i) => (
          <Reveal key={s.label} delay={0.08 * i}>
            <GlassCard
              sheen="band"
              ringX={s.ringX}
              className="p-6 text-center transition-transform duration-med ease-glassy-out hover:-translate-y-0.5"
            >
              <p className="t-title text-white">
                {s.static ? (
                  s.static
                ) : (
                  <CountUp to={s.value ?? 0} suffix={s.suffix ?? ''} />
                )}
              </p>
              <p className="t-micro mt-2 text-white">{s.label}</p>
            </GlassCard>
          </Reveal>
        ))}
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
            className="absolute left-[7px] top-0 h-full w-0.5 bg-white/10 md:hidden"
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
                    <h3 className="t-title-sm mt-2 text-white">{step.title}</h3>
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
        <span className="absolute left-[38%] top-[30%] h-3.5 w-3.5 rounded-full bg-white" />
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
        <span key={c} className="t-micro rounded-full bg-field px-2.5 py-1.5 text-white">
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
            <GlassCard sheen={index % 2 === 0 ? 'right' : 'none'} ringX={index * 40 - 60} className="h-full p-6 text-left">
              <div className="flex h-full flex-col">
                <p className="t-micro text-white/60">{mode.tier}</p>
                <h3 className="t-title-sm mt-2 text-white">{mode.title}</h3>
                <p className="t-caption mt-2 text-secondary">{mode.caption}</p>
                <div className="mt-auto">
                  <ModeVignette kind={mode.vignette} />
                </div>
              </div>
            </GlassCard>
          </div>
          <div className="absolute inset-0 [backface-visibility:hidden] [transform:rotateY(180deg)]">
            <GlassCard className="h-full p-6 text-left">
              <h3 className="t-title-sm text-white">{mode.title}</h3>
              <ul className="mt-4 space-y-3">
                {mode.bullets.map((b) => (
                  <li key={b} className="t-caption flex items-start gap-2 text-white">
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
            <GlassCard sheen="orb" className="max-w-lg p-7">
              <p className="t-eyebrow">Outcomes, not engagement</p>
              <h2 className="t-heading mt-3 text-white">
                The metric we optimize is your first date.
              </h2>
              <p className="t-value mt-3 text-secondary">
                Our We Met loop asks how it went — and every answer makes the
                next queue sharper.
              </p>
              <p className="t-caption mt-4 text-white/80">
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
                  <row.icon size={20} color="#fff" aria-hidden="true" />
                  <span
                    className="absolute inset-0 rounded-full opacity-0 ring-2 ring-violet transition-opacity duration-med group-hover:opacity-100"
                    aria-hidden="true"
                  />
                </span>
                <div>
                  <h3 className="t-title-sm text-white">{row.title}</h3>
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
                <p className="t-value mt-4 text-white">“{q.quote}”</p>
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
  const sheenRef = useRef<HTMLDivElement>(null);
  const sheenInView = useInView(sheenRef, { amount: 0.5, once: true });

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
              <p className="t-micro text-white/60">FREE</p>
              <h3 className="t-title-sm mt-2 text-white">Start with intent</h3>
              <p className="t-caption mt-3 text-secondary">
                Daily queue · Limited likes · Full safety stack · Events RSVP
              </p>
            </GlassCard>
          </Reveal>
          <Reveal delay={0.08}>
            <div ref={sheenRef}>
              <GlassCard sheen="right" className="relative h-full overflow-hidden p-6">
                {sheenInView && (
                  <motion.span
                    className="pointer-events-none absolute inset-y-0 w-1/2"
                    style={{
                      background:
                        'linear-gradient(100deg, transparent, rgba(255,255,255,0.18), transparent)',
                    }}
                    initial={{ x: '-220%' }}
                    animate={{ x: '320%' }}
                    transition={{ duration: 0.56, ease: EASE_OUT }}
                    aria-hidden="true"
                  />
                )}
                <p className="t-micro text-violet">RESONANCE+</p>
                <h3 className="t-title-sm mt-2 text-white">Deeper signal</h3>
                <p className="t-caption mt-3 text-secondary">
                  See who likes you · More Pulses · Advanced filters · Nearby feed
                </p>
              </GlassCard>
            </div>
          </Reveal>
          <Reveal delay={0.16}>
            <GlassCard sheen="strip" ringX={60} className="h-full p-6">
              <p className="t-micro text-white/60">RESONANCE X</p>
              <h3 className="t-title-sm mt-2 text-white">Go anywhere</h3>
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
                    <span className="t-value font-bold text-white">{item.q}</span>
                    <motion.span
                      animate={{ rotate: isOpen ? 180 : 0 }}
                      transition={{ duration: 0.24, ease: EASE_OUT }}
                      className="shrink-0"
                    >
                      <ChevronDown size={18} color="#fff" aria-hidden="true" />
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
          <BtnPrimary to="/login" className="h-14 px-10">
            Create your profile
          </BtnPrimary>
        </div>
        <p className="t-caption mt-5 text-white/50">
          Free to start · Takes two minutes · Photo verification required
        </p>
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
