import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Heart, Sparkle, BadgeCheck } from 'lucide-react';

/**
 * HeroPhone — home.md §1 "live phone mock".
 * A real rendered queue card (avatar-01 → avatar-03) inside a phone shell,
 * with a working ActionDock (demo state, no auth): Like fires the §7.2 heart
 * burst, Pulse plays the sheen sweep + pin, Pass flings the card. One
 * scripted swipe-right plays on load as a silent product demo.
 * Framer Motion only — no GSAP in this tree (library isolation).
 */

type DemoProfile = {
  img: string;
  name: string;
  intents: string[];
  prompt: string;
  compat: string;
};

const PROFILES: DemoProfile[] = [
  {
    img: '/avatar-01.jpg',
    name: 'Marcus, 29',
    intents: ['Serious', 'Hiking'],
    prompt: '“The way to my heart is…” — a sunrise trailhead and terrible coffee.',
    compat: '92% COMPATIBLE',
  },
  {
    img: '/avatar-03.jpg',
    name: 'Noa, 31',
    intents: ['Explore', 'ENM'],
    prompt: '“My simple pleasures…” — repotting plants and vinyl B-sides.',
    compat: '88% COMPATIBLE',
  },
];

const EASE_SPRING = [0.34, 1.56, 0.64, 1] as [number, number, number, number];
const EASE_OUT = [0.22, 1, 0.36, 1] as [number, number, number, number];

function LikeBurst({ burstKey }: { burstKey: number }) {
  const particles = useMemo(
    () =>
      Array.from({ length: 8 }, (_, i) => {
        const angle = (i / 8) * Math.PI * 2;
        return { x: Math.cos(angle) * 28, y: Math.sin(angle) * 28 };
      }),
    [],
  );
  if (burstKey === 0) return null;
  return (
    <span key={burstKey} className="pointer-events-none absolute inset-0" aria-hidden="true">
      {particles.map((p, i) => (
        <motion.span
          key={i}
          className="absolute left-1/2 top-1/2 h-1 w-1 rounded-full bg-white"
          initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
          animate={{ x: p.x, y: p.y, opacity: 0, scale: 0.4 }}
          transition={{ duration: 0.4, ease: EASE_OUT }}
        />
      ))}
    </span>
  );
}

export default function HeroPhone() {
  const [index, setIndex] = useState(0);
  const [exit, setExit] = useState<'like' | 'pass' | null>(null);
  const [burst, setBurst] = useState(0);
  const [heartPop, setHeartPop] = useState(0);
  const [pulsed, setPulsed] = useState(false);
  const [pulseSweep, setPulseSweep] = useState(0);
  const reduced = useRef(false);
  const profile = PROFILES[index % PROFILES.length];

  const advance = useCallback((kind: 'like' | 'pass') => {
    setExit(kind);
    window.setTimeout(() => {
      setIndex((i) => (i + 1) % PROFILES.length);
      setExit(null);
      setPulsed(false);
    }, 260);
  }, []);

  const doLike = useCallback(() => {
    setBurst((b) => b + 1);
    setHeartPop((h) => h + 1);
    if (!reduced.current) window.setTimeout(() => advance('like'), 380);
  }, [advance]);

  const doPass = useCallback(() => advance('pass'), [advance]);

  const doPulse = useCallback(() => {
    setPulseSweep((s) => s + 1);
    window.setTimeout(() => setPulsed(true), 480);
  }, []);

  /* Scripted demo swipe (silent product demo) — once on load */
  useEffect(() => {
    reduced.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced.current) return;
    const t = window.setTimeout(() => doLike(), 1800);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      className="phone-shell relative mx-auto w-[300px] overflow-hidden rounded-[36px] sm:w-[320px]"
      style={{
        outline: '1px solid rgba(255,255,255,0.08)',
        boxShadow: '0 0 80px rgba(123,73,245,0.25), 0 0 160px rgba(123,73,245,0.12)',
      }}
    >
      <div className="phone-bloom" aria-hidden="true" />
      <div className="relative z-10 px-4 pb-6 pt-4">
        {/* Queue card */}
        <div className="relative aspect-[4/5] w-full">
          <AnimatePresence>
            <motion.article
              key={index}
              className="absolute inset-0 overflow-hidden rounded-[20px]"
              initial={{ scale: 0.96, y: 28, opacity: 0 }}
              animate={
                exit === 'like'
                  ? { x: 320, rotate: 8, opacity: 0 }
                  : exit === 'pass'
                    ? { x: -320, rotate: -8, opacity: 0 }
                    : { scale: 1, y: 0, x: 0, rotate: 0, opacity: 1 }
              }
              transition={
                exit
                  ? { duration: 0.24, ease: EASE_OUT }
                  : { duration: 0.42, ease: EASE_SPRING }
              }
            >
              <img
                src={profile.img}
                alt={`${profile.name} profile photo`}
                className="absolute inset-0 h-full w-full object-cover"
                loading="eager"
              />
              <div className="photo-scrim absolute inset-x-0 bottom-0 h-[45%]" aria-hidden="true" />

              {/* LIKE stamp */}
              <motion.div
                className="absolute left-4 top-5 rotate-[-12deg] rounded-lg px-3 py-1"
                style={{ border: '2px solid var(--violet)' }}
                initial={{ opacity: 0 }}
                animate={{ opacity: exit === 'like' ? 1 : 0 }}
              >
                <span className="t-title-sm text-violet">LIKE</span>
              </motion.div>

              {/* Glass info panel — sheen-orb, the only blurred surface per card */}
              <div className="glass absolute inset-x-2 bottom-2 rounded-[20px]">
                <div className="sheen-orb" aria-hidden="true" />
                <div className="grain" aria-hidden="true" />
                <div className="glass-content p-4">
                  <div className="flex items-center gap-1.5">
                    <span className="t-title text-white">{profile.name}</span>
                    <span
                      className="flex h-4 w-4 items-center justify-center rounded-full"
                      style={{ background: 'var(--violet)' }}
                      aria-label="Photo verified"
                    >
                      <BadgeCheck size={12} color="#fff" aria-hidden="true" />
                    </span>
                  </div>
                  <div className="mt-2 flex gap-1.5">
                    {profile.intents.map((tag) => (
                      <span
                        key={tag}
                        className="t-caption rounded-full bg-field px-2.5 py-1 text-white"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                  <p className="t-value mt-2 text-white">{profile.prompt}</p>
                  <p className="t-micro mt-2 text-white">{profile.compat}</p>
                </div>
              </div>
            </motion.article>
          </AnimatePresence>
        </div>

        {/* Remaining likes micro label */}
        <p className="t-micro mt-4 text-center text-white">3 LIKES LEFT TODAY</p>

        {/* ActionDock — Pass / Like (elevated) / Pulse */}
        <div className="mt-2 flex items-end justify-center gap-5">
          <motion.button
            type="button"
            aria-label="Pass"
            onClick={doPass}
            className="glass flex h-12 w-12 items-center justify-center rounded-full"
            whileTap={{ scale: 0.92 }}
          >
            <span className="glass-content flex">
              <X size={20} color="#fff" aria-hidden="true" />
            </span>
          </motion.button>

          <motion.button
            type="button"
            aria-label="Like"
            onClick={doLike}
            className="relative -translate-y-2 rounded-full bg-violet shadow-violet-glow"
            style={{ width: 64, height: 64 }}
            whileTap={{ scale: 0.96 }}
          >
            <motion.span
              key={heartPop}
              className="flex h-full w-full items-center justify-center"
              animate={{ scale: [1, 1.35, 1] }}
              transition={{ duration: 0.38, ease: EASE_SPRING }}
            >
              <Heart size={26} color="#fff" fill="#fff" aria-hidden="true" />
            </motion.span>
            <LikeBurst burstKey={burst} />
          </motion.button>

          <motion.button
            type="button"
            aria-label="Send a Pulse"
            onClick={doPulse}
            className="glass relative flex h-12 w-12 items-center justify-center overflow-visible rounded-full"
            whileTap={{ scale: 0.92 }}
          >
            <motion.span
              key={pulseSweep}
              className="glass-content relative flex overflow-hidden rounded-full p-3"
              animate={pulseSweep ? { y: [0, -40, 0] } : undefined}
              transition={{ duration: 0.48, ease: EASE_OUT }}
            >
              {pulseSweep > 0 && (
                <motion.span
                  className="pointer-events-none absolute inset-y-0 w-1/2"
                  style={{
                    background:
                      'linear-gradient(100deg, transparent, rgba(255,255,255,0.2), transparent)',
                  }}
                  initial={{ x: '-120%' }}
                  animate={{ x: '240%' }}
                  transition={{ duration: 0.48, ease: EASE_OUT }}
                  aria-hidden="true"
                />
              )}
              <Sparkle
                size={20}
                aria-hidden="true"
                color={pulsed ? 'var(--violet)' : '#fff'}
                fill={pulsed ? 'var(--violet)' : 'none'}
              />
            </motion.span>
            {pulsed && (
              <motion.span
                className="absolute -bottom-1.5 h-0.5 w-6 rounded-full"
                style={{ background: 'var(--violet)' }}
                initial={{ scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{ duration: 0.32, ease: EASE_OUT }}
                aria-hidden="true"
              />
            )}
          </motion.button>
        </div>
      </div>
    </div>
  );
}
