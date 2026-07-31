import type { CSSProperties, ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type GlassEdge = 'none' | 'amber' | 'hud';
/** @deprecated Replaced by `edge` — kept for backwards compatibility, maps to 'none'. */
export type GlassSheen = 'none' | 'right' | 'band' | 'orb' | 'strip';

/**
 * GlassCard — design.md §8.2
 * `.glass` utility (§3.3) + optional ring-crop offset prop (`ringX`) + grain.
 * All card text is solid var(--text) — warm ink in Warm Glass, white in Night HUD.
 *
 * `edge`: 'none' = quiet border (default); 'amber' / 'hud' = `.glass-edge`
 * hero glow. Both resolve to the same class — the active theme supplies the
 * gradient; the prop names express intent per theme. One edge ≠ 'none' card
 * per view region max (§3.3 budget).
 */
export default function GlassCard({
  children,
  edge = 'none',
  sheen,
  ringX = 0,
  className,
  style,
  onClick,
}: {
  children: ReactNode;
  edge?: GlassEdge;
  /** @deprecated use `edge` — any value maps to edge 'none' */
  sheen?: GlassSheen;
  /** Horizontal offset (px) of the ring texture crop, per instance */
  ringX?: number;
  className?: string;
  style?: CSSProperties;
  onClick?: () => void;
}) {
  void sheen; // deprecated: sheen variants replaced by the edge-glow system
  return (
    <div
      className={cn('glass', edge !== 'none' && 'glass-edge', className)}
      style={style}
      onClick={onClick}
    >
      <svg
        className="rings"
        width="100%"
        height="100%"
        aria-hidden="true"
        style={{ transform: `translateX(${ringX}px)` }}
      >
        <g
          fill="none"
          stroke="var(--ring-stroke)"
          strokeWidth="2"
          transform="rotate(15 200 200)"
        >
          <circle cx="70%" cy="-10%" r="120" />
          <circle cx="85%" cy="30%" r="200" />
          <circle cx="10%" cy="90%" r="90" />
        </g>
      </svg>
      <div className="grain" aria-hidden="true" />
      <div className="glass-content h-full">{children}</div>
    </div>
  );
}
