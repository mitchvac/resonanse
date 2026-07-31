import { useId, useMemo } from 'react';
import type { CSSProperties } from 'react';
import { motion, useReducedMotion } from 'framer-motion';

/**
 * LightTrail — design.md §3.3 / §7.2
 * 2px gradient connector line + 6px glowing node dots between related cards.
 * Warm Glass: white→amber trail with white glowing nodes; Night HUD:
 * blue-violet beam with icy nodes (theme supplies the tokens).
 *
 * SVG variant: line draws via stroke-dashoffset 600ms ease-out on first
 * viewport entry; node dots pop scale 0→1 spring 240ms, staggered 120ms.
 * Reduced motion: renders fully drawn, dots static.
 * `variant="dots"` is the HTML-dot fallback (.trail-dot, box-shadow glow)
 * for contexts where SVG filters are undesirable.
 *
 * Position absolutely between related cards (z above the stage, below
 * cards); purely decorative — always pair with labels.
 */

export type TrailNode = { x: number; y: number };

export default function LightTrail({
  width,
  height,
  d,
  nodes,
  variant = 'svg',
  animate = true,
  className,
  style,
}: {
  /** SVG viewBox size (px) */
  width: number;
  height: number;
  /** Path data; defaults to a straight line across the middle */
  d?: string;
  /** Node positions; pass a number to distribute evenly along the path width */
  nodes?: TrailNode[] | number;
  variant?: 'svg' | 'dots';
  /** Draw on first viewport entry (default true) */
  animate?: boolean;
  className?: string;
  style?: CSSProperties;
}) {
  const gradientId = useId();
  const reduced = useReducedMotion();
  const path = d ?? `M 0 ${height / 2} L ${width} ${height / 2}`;
  const nodeList = useMemo<TrailNode[]>(() => {
    if (Array.isArray(nodes)) return nodes;
    const count = nodes ?? 2;
    return Array.from({ length: count }, (_, i) => ({
      x: count === 1 ? width / 2 : (i / (count - 1)) * width,
      y: height / 2,
    }));
  }, [nodes, width, height]);

  if (variant === 'dots') {
    /* HTML-dot fallback: glowing dots only (§3.3 fallback form) */
    return (
      <div
        className={className}
        style={{ position: 'absolute', pointerEvents: 'none', width, height, ...style }}
        aria-hidden="true"
      >
        {nodeList.map((n, i) => (
          <span
            key={i}
            className="trail-dot"
            style={{
              left: n.x,
              top: n.y,
              transform: 'translate(-50%, -50%)',
            }}
          />
        ))}
      </div>
    );
  }

  return (
    <svg
      className={className}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      fill="none"
      aria-hidden="true"
      style={{ position: 'absolute', pointerEvents: 'none', overflow: 'visible', ...style }}
    >
      <defs>
        <linearGradient
          id={gradientId}
          x1="0"
          y1="0"
          x2={width}
          y2="0"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor="var(--trail-from)" />
          <stop offset="1" stopColor="var(--trail-to)" />
        </linearGradient>
      </defs>
      <g className="light-trail" style={{ position: 'static' }}>
        {animate && !reduced ? (
          <motion.path
            d={path}
            stroke={`url(#${gradientId})`}
            initial={{ pathLength: 0 }}
            whileInView={{ pathLength: 1 }}
            viewport={{ amount: 0.4, once: true }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          />
        ) : (
          <path d={path} stroke={`url(#${gradientId})`} />
        )}
        {nodeList.map((n, i) =>
          animate && !reduced ? (
            <motion.circle
              key={i}
              cx={n.x}
              cy={n.y}
              r={3}
              style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
              initial={{ scale: 0 }}
              whileInView={{ scale: 1 }}
              viewport={{ amount: 0.4, once: true }}
              transition={{
                duration: 0.24,
                delay: 0.12 * i,
                ease: [0.34, 1.56, 0.64, 1],
              }}
            />
          ) : (
            <circle key={i} cx={n.x} cy={n.y} r={3} />
          ),
        )}
      </g>
    </svg>
  );
}
