import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';

gsap.registerPlugin(ScrollTrigger);

/**
 * LandingFX — home.md scroll choreography (GSAP + Lenis, landing only).
 * Owns ALL scroll-driven animation on `/`; UI interactions elsewhere use
 * Framer Motion (library isolation — the two never animate the same nodes;
 * GSAP only touches [data-fx] wrapper elements).
 *
 * - Lenis smooth scroll synced with ScrollTrigger
 * - Hero pinned 150vh: phone y +60→0, rotate 4°→0°, ring arcs scale 1.1→1
 * - §3 violet progress line scaleY 0→1 (scrub)
 * - §4 modes rail pinned 120vh with parallax drift (desktop)
 * - §5 outcomes image scale 1.08→1.0 (scrub)
 * Reduced motion: everything skipped (static composition, no pins).
 */
export default function LandingFX({ children }: { children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) return;

    const lenis = new Lenis({ duration: 1.1, smoothWheel: true });
    lenis.on('scroll', ScrollTrigger.update);
    const tick = (time: number) => lenis.raf(time * 1000);
    gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(0);

    const mm = gsap.matchMedia();
    const ctx = gsap.context(() => {
      /* §1 Hero — pinned 150vh */
      gsap
        .timeline({
          scrollTrigger: {
            trigger: '[data-fx="hero"]',
            start: 'top top',
            end: '+=150%',
            pin: true,
            scrub: 0.6,
          },
        })
        .fromTo(
          '[data-fx="hero-phone"]',
          { y: 60, rotate: 4 },
          { y: 0, rotate: 0, ease: 'none', duration: 0.5 },
          0,
        )
        .fromTo(
          '[data-fx="hero-rings"]',
          { scale: 1.1 },
          { scale: 1, ease: 'none', duration: 0.5 },
          0,
        );

      /* §3 Loop — violet progress line draws down (scaleY scrub) */
      gsap.fromTo(
        '[data-fx="loop-line"]',
        { scaleY: 0 },
        {
          scaleY: 1,
          transformOrigin: 'top center',
          ease: 'none',
          scrollTrigger: {
            trigger: '[data-fx="loop"]',
            start: 'top 70%',
            end: 'bottom 60%',
            scrub: true,
          },
        },
      );

      /* §4 Modes rail — pinned 120vh, parallax drift (desktop) */
      mm.add('(min-width: 768px)', () => {
        gsap.fromTo(
          '[data-fx="modes-rail"]',
          { x: 60 },
          {
            x: -140,
            ease: 'none',
            scrollTrigger: {
              trigger: '[data-fx="modes"]',
              start: 'top top',
              end: '+=120%',
              pin: true,
              scrub: 0.6,
            },
          },
        );
      });

      /* §5 Outcomes — image scale 1.08→1.0 scrub */
      gsap.fromTo(
        '[data-fx="outcomes-img"]',
        { scale: 1.08 },
        {
          scale: 1,
          ease: 'none',
          scrollTrigger: {
            trigger: '[data-fx="outcomes"]',
            start: 'top bottom',
            end: 'bottom top',
            scrub: true,
          },
        },
      );
    }, root);

    return () => {
      ctx.revert();
      mm.revert();
      gsap.ticker.remove(tick);
      lenis.destroy();
    };
  }, []);

  return <div ref={root}>{children}</div>;
}
