/**
 * NeonScript — landing hero artwork: "Be Real, / Be Yourself"
 * Layered SVG neon-sign rendering (per user's reference artwork):
 *   1. blurred magenta halo
 *   2. deep-purple 3D extrusion (down-right)
 *   3. gradient tube body (violet → magenta → pink → rose)
 *   4. white neon core line
 *   plus the pink swoosh underline and speed lines.
 * textLength pins each line's width so layout never depends on font metrics.
 */
const LINES: Array<{ text: string; x: number; y: number; len: number }> = [
  { text: 'Be Real,', x: 14, y: 92, len: 305 },
  { text: 'Be Yourself', x: 14, y: 198, len: 468 },
];

const FONT = {
  fontFamily: "'Yellowtail', 'Plus Jakarta Sans', cursive",
  fontSize: 96,
} as const;

function LineText({
  line,
  dx = 0,
  dy = 0,
  fill,
  stroke,
  strokeWidth,
  extra = {},
}: {
  line: (typeof LINES)[number];
  dx?: number;
  dy?: number;
  fill: string;
  stroke?: string;
  strokeWidth?: number;
  extra?: Record<string, unknown>;
}) {
  return (
    <text
      x={line.x + dx}
      y={line.y + dy}
      textLength={line.len}
      lengthAdjust="spacingAndGlyphs"
      fill={fill}
      stroke={stroke}
      strokeWidth={strokeWidth}
      strokeLinejoin="round"
      strokeLinecap="round"
      style={FONT}
      {...extra}
    >
      {line.text}
    </text>
  );
}

export default function NeonScript() {
  return (
    <svg
      viewBox="0 0 580 262"
      className="neon-svg block h-auto w-[min(88vw,540px)]"
      role="img"
      aria-label="Be Real, Be Yourself"
    >
      <defs>
        <linearGradient id="neonTube" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#7c3aed" />
          <stop offset="0.42" stopColor="#c026d3" />
          <stop offset="0.75" stopColor="#ec4899" />
          <stop offset="1" stopColor="#f43f5e" />
        </linearGradient>
        <linearGradient id="neonAccent" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#a855f7" />
          <stop offset="1" stopColor="#ec4899" />
        </linearGradient>
        <filter id="neonHalo" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="11" />
        </filter>
      </defs>

      {LINES.map((line) => (
        <g key={line.text}>
          {/* 1 · glow halo */}
          <LineText
            line={line}
            fill="none"
            stroke="#d946ef"
            strokeWidth={20}
            extra={{ filter: 'url(#neonHalo)', opacity: 0.5 }}
          />
          {/* 2 · 3D extrusion — deep purple steps down-right */}
          <LineText line={line} dx={8} dy={8} fill="#2e0555" stroke="#2e0555" strokeWidth={15} />
          <LineText line={line} dx={5.5} dy={5.5} fill="#4c1d95" stroke="#4c1d95" strokeWidth={15} />
          <LineText line={line} dx={3} dy={3} fill="#6d28d9" stroke="#6d28d9" strokeWidth={15} />
          {/* 3 · tube body */}
          <LineText
            line={line}
            fill="url(#neonTube)"
            stroke="url(#neonTube)"
            strokeWidth={13}
            extra={{ paintOrder: 'stroke' }}
          />
          {/* 4 · white neon core */}
          <LineText line={line} fill="none" stroke="#ffffff" strokeWidth={3} extra={{ opacity: 0.95 }} />
        </g>
      ))}

      {/* swoosh underline */}
      <path
        d="M34 236 Q 270 262 500 218"
        fill="none"
        stroke="url(#neonAccent)"
        strokeWidth="7"
        strokeLinecap="round"
      />
      <path
        d="M58 248 Q 280 270 462 240"
        fill="none"
        stroke="url(#neonAccent)"
        strokeWidth="3.5"
        strokeLinecap="round"
        opacity="0.65"
      />

      {/* speed lines — right of "Real," and beside "Yourself" */}
      <g stroke="url(#neonAccent)" strokeLinecap="round">
        <path d="M352 40 H418" strokeWidth="6" />
        <path d="M366 56 H452" strokeWidth="6" opacity="0.8" />
        <path d="M520 150 H572" strokeWidth="6" />
        <path d="M508 168 H566" strokeWidth="6" opacity="0.8" />
      </g>
    </svg>
  );
}
