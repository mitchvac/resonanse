import { useEffect, useRef } from 'react';

/**
 * WinFireworks — full-screen canvas celebration when the human side wins a
 * game (Spades, LiarsDice, Concentration; Chess carries its own ported copy).
 * Physics identical to the proven Chess celebration: rockets rise from the
 * bottom third, burst into gravity-pulled spark rings, trails fade via
 * destination-out. pointer-events-none so the table stays tappable, and the
 * whole thing is skipped under prefers-reduced-motion (the game's own win
 * banner still carries the message).
 *
 * `fire` is edge-triggered: false→true starts a show, true→false (new game)
 * cancels and clears.
 */
const HUES = [42, 18, 340, 275, 190, 130];

interface Rocket {
  x: number;
  y: number;
  vy: number;
  target: number;
  hue: number;
}
interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  decay: number;
  hue: number;
}

export default function WinFireworks({ fire }: { fire: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!fire) return undefined;
    const cv = canvasRef.current;
    const ctx = cv?.getContext('2d');
    if (!cv || !ctx) return undefined;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = window.innerWidth;
    const H = window.innerHeight;
    cv.width = W * dpr;
    cv.height = H * dpr;
    cv.style.width = `${W}px`;
    cv.style.height = `${H}px`;
    ctx.scale(dpr, dpr);

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return undefined; // win text alone carries the moment
    }

    let rockets: Rocket[] = [];
    let sparks: Spark[] = [];
    let t = 0;

    const launch = () =>
      rockets.push({
        x: W * (0.18 + Math.random() * 0.64),
        y: H,
        vy: -(H / 62) * (0.85 + Math.random() * 0.4),
        target: H * (0.16 + Math.random() * 0.3),
        hue: HUES[(Math.random() * HUES.length) | 0] as number,
      });

    const burst = (r: Rocket) => {
      const n = 46 + ((Math.random() * 22) | 0);
      for (let i = 0; i < n; i++) {
        const a = (Math.PI * 2 * i) / n + Math.random() * 0.12;
        const sp = 1.1 + Math.random() * 2.9;
        sparks.push({
          x: r.x,
          y: r.y,
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp,
          life: 1,
          decay: 0.009 + Math.random() * 0.012,
          hue: r.hue + (Math.random() * 26 - 13),
        });
      }
    };

    const frame = () => {
      t++;
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = 'rgba(0,0,0,.20)';
      ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'lighter';
      if (t % 26 === 0 && t < 300) launch();
      rockets = rockets.filter((r) => {
        r.y += r.vy;
        r.vy += 0.035;
        ctx.fillStyle = `hsl(${r.hue},95%,72%)`;
        ctx.fillRect(r.x - 1, r.y - 4, 2.2, 8);
        if (r.y <= r.target || r.vy >= 0) {
          burst(r);
          return false;
        }
        return true;
      });
      sparks = sparks.filter((s) => {
        s.x += s.vx;
        s.y += s.vy;
        s.vy += 0.035;
        s.vx *= 0.988;
        s.vy *= 0.988;
        s.life -= s.decay;
        if (s.life <= 0) return false;
        ctx.beginPath();
        ctx.fillStyle = `hsla(${s.hue},95%,${52 + s.life * 28}%,${s.life})`;
        ctx.arc(s.x, s.y, 1.9 * s.life + 0.5, 0, 6.284);
        ctx.fill();
        return true;
      });
      if (t < 430 || sparks.length) {
        rafRef.current = requestAnimationFrame(frame);
      } else {
        ctx.clearRect(0, 0, W, H);
        rafRef.current = null;
      }
    };

    launch();
    frame();

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, cv.width, cv.height);
    };
  }, [fire]);

  if (!fire) return null;
  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-[70]"
    />
  );
}
