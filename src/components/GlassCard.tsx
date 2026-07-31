import type { CSSProperties, ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type GlassSheen = 'none' | 'right' | 'band' | 'orb' | 'strip';

/**
 * GlassCard — design.md §8.2
 * `.glass` utility (§3.3) + optional sheen slot (≤1 per surface) + ring-crop
 * offset prop (`ringX`) + grain. All card text is solid var(--text) white.
 */
export default function GlassCard({
  children,
  sheen = 'none',
  ringX = 0,
  className,
  style,
  onClick,
}: {
  children: ReactNode;
  sheen?: GlassSheen;
  /** Horizontal offset (px) of the ring texture crop, per instance */
  ringX?: number;
  className?: string;
  style?: CSSProperties;
  onClick?: () => void;
}) {
  return (
    <div className={cn('glass', className)} style={style} onClick={onClick}>
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
      {sheen !== 'none' && <div className={`sheen-${sheen}`} aria-hidden="true" />}
      <div className="grain" aria-hidden="true" />
      <div className="glass-content h-full">{children}</div>
    </div>
  );
}
