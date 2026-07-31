import { motion, useReducedMotion } from 'framer-motion';

/**
 * CompatibilityArc — discover.md §1 / design.md §7.2
 * Thin violet arc (SVG stroke, 2px) wrapping a % micro label — draws 400ms
 * on card focus. Night HUD renders the arc in --viz-stroke (supplied by
 * token swap on --viz-stroke; we use var(--compat-stroke) fallback violet).
 * Arc = 270° gauge starting at 135°.
 */
export default function CompatibilityArc({
  value,
  size = 40,
  animateKey,
}: {
  /** 0–100 */
  value: number;
  size?: number;
  /** Changing this key retriggers the draw animation */
  animateKey?: string | number;
}) {
  const reduced = useReducedMotion();
  const r = (size - 4) / 2;
  const cx = size / 2;
  // 270° arc from 135° → 405° (start bottom-left, sweep clockwise)
  const start = (135 * Math.PI) / 180;
  const end = ((135 + 270) * Math.PI) / 180;
  const arcPath = (from: number, to: number) => {
    const x1 = cx + r * Math.cos(from);
    const y1 = cx + r * Math.sin(from);
    const x2 = cx + r * Math.cos(to);
    const y2 = cx + r * Math.sin(to);
    const large = to - from > Math.PI ? 1 : 0;
    return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
  };
  const fraction = Math.max(0, Math.min(1, value / 100));
  const trackD = arcPath(start, end);
  const valueD = arcPath(start, start + (end - start) * fraction);

  return (
    <span
      className="relative inline-flex items-center justify-center"
      style={{ width: size, height: size }}
      aria-label={`${value} compatible`}
      role="img"
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <path
          d={trackD}
          fill="none"
          stroke="var(--field-focus)"
          strokeWidth="2"
          strokeLinecap="round"
        />
        {reduced ? (
          <path
            d={valueD}
            fill="none"
            stroke="var(--viz-stroke, var(--violet))"
            strokeWidth="2"
            strokeLinecap="round"
          />
        ) : (
          <motion.path
            key={animateKey ?? value}
            d={valueD}
            fill="none"
            stroke="var(--viz-stroke, var(--violet))"
            strokeWidth="2"
            strokeLinecap="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          />
        )}
      </svg>
      <span
        className="t-micro absolute font-bold"
        style={{ color: 'var(--text)' }}
        aria-hidden="true"
      >
        {value}
      </span>
    </span>
  );
}
