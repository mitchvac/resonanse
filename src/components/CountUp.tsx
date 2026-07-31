import { useEffect, useRef, useState } from 'react';
import { useInView, useReducedMotion } from 'framer-motion';

/**
 * CountUp — design.md §7.2 "Number count-ups"
 * 600ms ease-out on first viewport entry. Reduced motion: renders final value.
 */
export default function CountUp({
  value,
  duration = 0.6,
  className,
  style,
}: {
  value: number;
  duration?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.6 });
  const reduced = useReducedMotion();
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    if (!inView) return;
    if (reduced) {
      setDisplay(value);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / (duration * 1000));
      // ease-out cubic
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(eased * value));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, value, duration, reduced]);

  return (
    <span ref={ref} className={className} style={style}>
      {display}
    </span>
  );
}
