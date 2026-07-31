import { memo } from 'react';

/**
 * StageBackdrop — design.md §8.1 / §2.1
 * Fixed layer: --stage-bloom + --stage-bloom-2 over --stage-base, z-index −1.
 * Warm Glass: warm cream stage + amber bloom; Night HUD: navy + blue bloom.
 * Desktop adds the decorative ring-field SVG (2px var(--ring-stroke) — warm
 * ink strokes in light, icy strokes in dark — group rotate(15°)) drifting
 * 40px on a 26s loop (transform only). Theme change = 320ms re-bloom.
 * `inPhone` variant scales blooms to the 430px phone width.
 */
function RingField() {
  const rings = [
    { cx: 120, cy: 180, r: 90 },
    { cx: 260, cy: 340, r: 140 },
    { cx: 90, cy: 520, r: 60 },
    { cx: 1740, cy: 220, r: 110 },
    { cx: 1600, cy: 480, r: 70 },
    { cx: 1830, cy: 640, r: 150 },
  ];
  return (
    <svg
      className="stage-ringfield hidden md:block"
      width="100%"
      height="100%"
      viewBox="0 0 1920 800"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      <g fill="none" stroke="var(--ring-stroke)" strokeWidth="2">
        {rings.map((ring, i) => (
          <circle key={i} cx={ring.cx} cy={ring.cy} r={ring.r} />
        ))}
      </g>
    </svg>
  );
}

function StageBackdrop({ inPhone = false }: { inPhone?: boolean }) {
  if (inPhone) {
    return (
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background: 'var(--stage-bloom), var(--stage-bloom-2)',
          backgroundSize: '430px auto, 430px auto',
          backgroundColor: 'var(--stage-base)',
        }}
      />
    );
  }
  return (
    <div className="stage-backdrop" aria-hidden="true">
      <RingField />
    </div>
  );
}

export default memo(StageBackdrop);
