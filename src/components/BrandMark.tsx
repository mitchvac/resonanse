/**
 * BrandMark — design.md §3.4
 * Two 31.74px circles at 0.4 opacity, overlapping 15.87px (viewBox 48×32).
 * Never recolor with accents; never add a third circle.
 * Fill adapts per theme for contrast:
 *  - tone "auto" (default, on stage/glass): warm ink #2A2433 at 0.4 in
 *    Warm Glass, #FFFFFF at 0.4 in Night HUD (via --brand-mark).
 *  - tone "onAccent" (on violet CTAs / photos): #FFFFFF at 0.4 in both themes.
 */
export default function BrandMark({
  size = 48,
  className = '',
  tone = 'auto',
}: {
  size?: number;
  className?: string;
  tone?: 'auto' | 'onAccent';
}) {
  const height = (size * 32) / 48;
  const fill = tone === 'onAccent' ? 'rgba(255,255,255,0.4)' : 'var(--brand-mark)';
  return (
    <svg
      width={size}
      height={height}
      viewBox="0 0 48 32"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <circle cx="15.87" cy="16" r="15.87" fill={fill} />
      <circle cx="32.13" cy="16" r="15.87" fill={fill} />
    </svg>
  );
}
