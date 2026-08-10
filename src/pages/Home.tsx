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
import { useTranslation } from 'react-i18next';

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
  const { t } = useTranslation('landing');
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
            {t('hero.eyebrow')}
          </motion.p>
          <h1 className="t-display mt-4" style={{ color: 'var(--text-ink)' }}>
            <Words text={t('hero.title')} onLoad delay={0.1} />
          </h1>
          <motion.p
            className="t-value mt-5 max-w-md"
            style={{ color: 'var(--text-ink)' }}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.32, delay: 0.5, ease: EASE_OUT }}
          >
            {t('hero.subtitle')}
          </motion.p>
          <motion.div
            className="mt-8 flex flex-wrap items-center gap-4"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.32, delay: 0.62, ease: EASE_OUT }}
          >
            {/* AUTH-SLOT: rewired to useAuth() in Phase 5 */}
            <BtnPrimary to="/signin">{t('hero.getStarted')}</BtnPrimary>
            <BtnGhost
              onClick={() =>
                document
                  .getElementById('philosophy')
                  ?.scrollIntoView({ behavior: 'smooth' })
              }
            >
              {t('hero.seeHow')}
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
            {t('hero.caption')}
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
              aria-label={t('hero.offerAria')}
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
                    {t('hero.offerMeta')}
                  </span>
                  <span className="dc-card__meta text-white/70">
                    {t('hero.offerGrows')}
                  </span>
                </div>
                <p className="dc-card__title">{t('hero.offerTitle')}</p>
                <div className="dc-card__coin">
                  <div className="dc-card__coin-img" />
                  <div className="dc-card__coin-vignette" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <p className="text-[14px] font-bold leading-[19px] text-white">
                    {t('hero.offerFor')}
                  </p>
                  <p className="text-[13px] leading-[20px] text-white/[0.82]">
                    {t('hero.offerDesc')}
                  </p>
                </div>
                <div className="mt-1 flex items-center gap-3">
                  <span className="dc-card__pill">
                    {t('hero.offerPill')}
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

function Problem() {
  const { t } = useTranslation('landing');
  const stats: Stat[] = [
    { value: 47, suffix: t('problem.stat1.suffix'), label: t('problem.stat1.label'), ringX: -60 },
    { value: 3, suffix: t('problem.stat2.suffix'), label: t('problem.stat2.label'), ringX: 0 },
    { static: t('problem.stat3.static'), label: t('problem.stat3.label'), ringX: 80 },
  ];
  return (
    <section className="relative py-24 md:py-32">
      <div className="mx-auto max-w-2xl px-5 text-center">
        <Reveal>
          <p className="t-eyebrow-on-stage">{t('problem.eyebrow')}</p>
          <h2 className="t-heading mt-3" style={{ color: 'var(--text-ink)' }}>
            {t('problem.heading')}
          </h2>
          <p className="t-value mt-4 text-ink-secondary">
            {t('problem.body')}
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
          {stats.map((s, i) => (
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

function Loop() {
  const { t } = useTranslation('landing');
  const loopSteps = [
    { n: '1', title: t('loop.step1.title'), body: t('loop.step1.body'), ringX: -40 },
    { n: '2', title: t('loop.step2.title'), body: t('loop.step2.body'), ringX: 30 },
    { n: '3', title: t('loop.step3.title'), body: t('loop.step3.body'), ringX: -80 },
    { n: '4', title: t('loop.step4.title'), body: t('loop.step4.body'), ringX: 60 },
  ];
  return (
    <section id="philosophy" data-fx="loop" className="relative py-24 md:py-32">
      <div className="mx-auto max-w-6xl px-5">
        <Reveal className="max-w-xl">
          <p className="t-eyebrow-on-stage">{t('loop.eyebrow')}</p>
          <h2 className="t-heading mt-3" style={{ color: 'var(--text-ink)' }}>
            {t('loop.heading')}
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
            {loopSteps.map((step, i) => (
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

type Mode = {
  title: string;
  caption: string;
  tier: string;
  bullets: string[];
  vignette: string;
};

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

function ModePanel({ mode, index }: { mode: Mode; index: number }) {
  const { t } = useTranslation('landing');
  const [flipped, setFlipped] = useState(false);
  return (
    <Reveal delay={0.08 * index} className="shrink-0 snap-start">
      <button
        type="button"
        onClick={() => setFlipped((f) => !f)}
        className="block h-[360px] w-[280px] [perspective:1200px]"
        aria-pressed={flipped}
        aria-label={t('modes.tapForDetails', { title: mode.title })}
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
                  {mode.tier === 'FREE' ? t('modes.tierFree') : mode.tier}
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

const MODE_ORDER = [
  { key: 'queue', tier: 'FREE', vignette: 'queue' },
  { key: 'swipe', tier: 'FREE', vignette: 'swipe' },
  { key: 'nearby', tier: 'RESONANCE+', vignette: 'nearby' },
  { key: 'events', tier: 'FREE', vignette: 'events' },
  { key: 'travel', tier: 'RESONANCE X', vignette: 'travel' },
] as const;

function Modes() {
  const { t } = useTranslation('landing');
  const modes: Mode[] = MODE_ORDER.map((m) => ({
    title: t(`modes.${m.key}.title`),
    caption: t(`modes.${m.key}.caption`),
    tier: m.tier,
    bullets: [
      t(`modes.${m.key}.bullet1`),
      t(`modes.${m.key}.bullet2`),
      t(`modes.${m.key}.bullet3`),
    ],
    vignette: m.vignette,
  }));
  return (
    <section id="modes" data-fx="modes" className="relative overflow-hidden py-24 md:py-32">
      <div className="mx-auto max-w-6xl px-5">
        <Reveal>
          <p className="t-eyebrow-on-stage">{t('modes.eyebrow')}</p>
          <h2 className="t-heading mt-3" style={{ color: 'var(--text-ink)' }}>
            {t('modes.heading')}
          </h2>
        </Reveal>
      </div>
      <div
        data-fx="modes-rail"
        className="no-scrollbar mt-12 flex snap-x snap-mandatory gap-4 overflow-x-auto px-5 md:px-[max(1.25rem,calc((100vw-72rem)/2))]"
      >
        {modes.map((m, i) => (
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
  const { t } = useTranslation('landing');
  return (
    <section data-fx="outcomes" className="relative my-8 overflow-hidden md:my-16">
      <div className="relative h-[80dvh] min-h-[520px] w-full overflow-hidden">
        <img
          data-fx="outcomes-img"
          src="/landing-date.jpg"
          alt={t('outcomes.alt')}
          className="absolute inset-0 h-full w-full object-cover"
          loading="lazy"
        />
        <div className="photo-scrim absolute inset-0" aria-hidden="true" />
        <div className="absolute inset-x-0 bottom-0 mx-auto w-full max-w-6xl px-5 pb-10">
          <Reveal y={40}>
            {/* Section hero glow surface (home.md §5): edge amber in Warm
                Glass / HUD gradient in Night HUD */}
            <GlassCard edge="amber" className="max-w-lg p-7">
              <p className="t-eyebrow">{t('outcomes.eyebrow')}</p>
              <h2 className="t-heading mt-3">
                {t('outcomes.heading')}
              </h2>
              <p className="t-value mt-3">
                {t('outcomes.body')}
              </p>
              <p className="t-caption mt-4 text-secondary">
                {t('outcomes.stats')}
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

function Safety() {
  const { t } = useTranslation('landing');
  const safetyRows = [
    { icon: BadgeCheck, title: t('safety.rows.verification.title'), body: t('safety.rows.verification.body') },
    { icon: Shield, title: t('safety.rows.screenshots.title'), body: t('safety.rows.screenshots.body') },
    { icon: EyeOff, title: t('safety.rows.hiddenWords.title'), body: t('safety.rows.hiddenWords.body') },
    { icon: Ghost, title: t('safety.rows.anonymity.title'), body: t('safety.rows.anonymity.body') },
    { icon: ScanFace, title: t('safety.rows.scam.title'), body: t('safety.rows.scam.body') },
    { icon: HeartHandshake, title: t('safety.rows.consent.title'), body: t('safety.rows.consent.body') },
  ];
  return (
    <section id="safety" className="relative py-24 md:py-32">
      <div className="mx-auto grid max-w-6xl gap-12 px-5 md:grid-cols-2">
        <div className="md:sticky md:top-28 md:self-start">
          <Reveal>
            <p className="t-eyebrow-on-stage">{t('safety.eyebrow')}</p>
            <h2 className="t-heading mt-3" style={{ color: 'var(--text-ink)' }}>
              {t('safety.heading')}
            </h2>
            <p className="t-value mt-4 max-w-md text-ink-secondary">
              {t('safety.body')}
            </p>
          </Reveal>
        </div>
        <div className="space-y-3">
          {safetyRows.map((row, i) => (
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

function Testimonials() {
  const { t } = useTranslation('landing');
  const quotes = [
    { img: '/avatar-t1.jpg', name: 'Elena, 29', quote: t('testimonials.q1.quote') },
    { img: '/avatar-t2.jpg', name: 'Arjun, 33', quote: t('testimonials.q2.quote') },
    { img: '/avatar-t3.jpg', name: 'Ren, 27', quote: t('testimonials.q3.quote') },
  ];
  return (
    <section className="relative py-24 md:py-32">
      <div className="mx-auto max-w-6xl px-5">
        <Reveal className="text-center">
          <p className="t-eyebrow-on-stage">{t('testimonials.eyebrow')}</p>
          <h2 className="t-heading mt-3" style={{ color: 'var(--text-ink)' }}>
            {t('testimonials.heading')}
          </h2>
        </Reveal>
        <div className="mt-12 grid gap-4 md:grid-cols-3">
          {quotes.map((q, i) => (
            <Reveal key={q.name} delay={0.1 * i} y={40}>
              <GlassCard ringX={i * 50 - 40} className="h-full p-6">
                <img
                  src={q.img}
                  alt={t('testimonials.headshotAlt', { name: q.name })}
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
  const { t } = useTranslation('landing');
  const plusRef = useRef<HTMLDivElement>(null);
  const plusInView = useInView(plusRef, { amount: 0.5, once: true });

  return (
    <section id="pricing" className="relative py-24 md:py-32">
      <div className="mx-auto max-w-6xl px-5 text-center">
        <Reveal>
          <p className="t-eyebrow-on-stage">{t('pricing.eyebrow')}</p>
          <h2 className="t-heading mt-3" style={{ color: 'var(--text-ink)' }}>
            {t('pricing.heading')}
          </h2>
          <p className="t-value mx-auto mt-4 max-w-lg text-ink-secondary">
            {t('pricing.body')}
          </p>
        </Reveal>

        <div className="mx-auto mt-12 grid max-w-4xl gap-4 text-left sm:grid-cols-3">
          <Reveal>
            <GlassCard ringX={-40} className="h-full p-6">
              <p className="t-micro" style={{ color: 'var(--text-secondary)' }}>
                {t('pricing.tierFree')}
              </p>
              <h3 className="t-title-sm mt-2">{t('pricing.free.title')}</h3>
              <p className="t-caption mt-3 text-secondary">
                {t('pricing.free.features')}
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
                <h3 className="t-title-sm mt-2">{t('pricing.plus.title')}</h3>
                <p className="t-caption mt-3 text-secondary">
                  {t('pricing.plus.features')}
                </p>
              </GlassCard>
            </div>
          </Reveal>
          <Reveal delay={0.16}>
            <GlassCard ringX={60} className="h-full p-6">
              <p className="t-micro" style={{ color: 'var(--text-secondary)' }}>
                RESONANCE X
              </p>
              <h3 className="t-title-sm mt-2">{t('pricing.x.title')}</h3>
              <p className="t-caption mt-3 text-secondary">
                {t('pricing.x.features')}
              </p>
            </GlassCard>
          </Reveal>
        </div>

        <Reveal delay={0.2} className="mt-8">
          <BtnGhost to="/premium">{t('pricing.compare')}</BtnGhost>
        </Reveal>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* §9 FAQ                                                              */
/* ------------------------------------------------------------------ */

function Faq() {
  const { t } = useTranslation('landing');
  const [open, setOpen] = useState<number | null>(null);
  const faqs = [
    { q: t('faq.q1.q'), a: t('faq.q1.a') },
    { q: t('faq.q2.q'), a: t('faq.q2.a') },
    { q: t('faq.q3.q'), a: t('faq.q3.a') },
    { q: t('faq.q4.q'), a: t('faq.q4.a') },
    { q: t('faq.q5.q'), a: t('faq.q5.a') },
  ];
  return (
    <section className="relative py-24 md:py-32">
      <div className="mx-auto max-w-2xl px-5">
        <Reveal className="text-center">
          <p className="t-eyebrow-on-stage">{t('faq.eyebrow')}</p>
          <h2 className="t-heading mt-3" style={{ color: 'var(--text-ink)' }}>
            {t('faq.heading')}
          </h2>
        </Reveal>
        <Reveal delay={0.1} className="mt-10">
          <GlassCard className="p-2">
            {faqs.map((item, i) => {
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
  const { t } = useTranslation('landing');
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
        <Words text={t('finalCta.heading')} />
      </h2>
      <Reveal delay={0.2}>
        <p className="t-value mx-auto mt-4 max-w-sm text-ink-secondary">
          {t('finalCta.body')}
        </p>
        <div className="relative mt-9 inline-block">
          <span
            className="pointer-events-none absolute inset-0 animate-ping rounded-full ring-1 ring-violet [animation-delay:800ms] [animation-iteration-count:2]"
            aria-hidden="true"
          />
          {/* AUTH-SLOT: rewired to useAuth() in Phase 5 */}
          <BtnPrimary to="/signin" className="h-14 px-10">
            {t('finalCta.button')}
          </BtnPrimary>
        </div>
        <p className="t-caption mt-5" style={{ color: 'var(--text-secondary)' }}>
          {t('finalCta.caption')}
        </p>
        <div className="mt-7 flex justify-center">
          <ShareButton label={t('finalCta.share')} />
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
