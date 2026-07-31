/**
 * BrandMark — design.md §3.4
 * Two 31.74px circles, #FFFFFF at 0.4 opacity, overlapping 15.87px.
 * Never recolor; never add a third circle.
 */
export default function BrandMark({
  size = 48,
  className = '',
}: {
  size?: number;
  className?: string;
}) {
  const height = (size * 32) / 48;
  return (
    <svg
      width={size}
      height={height}
      viewBox="0 0 48 32"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <circle cx="15.87" cy="16" r="15.87" fill="#FFFFFF" fillOpacity="0.4" />
      <circle cx="32.13" cy="16" r="15.87" fill="#FFFFFF" fillOpacity="0.4" />
    </svg>
  );
}
