/**
 * Gesture icons — hand-drawn SVG marks so every gesture reads at a glance:
 * a REAL rose (not an abstract flower), a waving hand (not a handshake),
 * and kiss lips. Used on the action dock, profile sheet footer, and the
 * quick-response rows on the Likes You cards.
 */
type IconProps = {
  size?: number;
  className?: string;
  style?: React.CSSProperties;
};

/** A single long-stem rose: layered bloom + spiral heart + stem + leaves. */
export function RoseIcon({ size = 20, className, style }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={className}
      style={style}
      fill="none"
      aria-hidden="true"
    >
      {/* outer bloom */}
      <path
        d="M12 2.4c-3 0-5.2 2.2-5.2 5 0 3 2.3 5.1 5.2 5.1s5.2-2.1 5.2-5.1c0-2.8-2.2-5-5.2-5Z"
        fill="#e35d7c"
      />
      {/* shaded inner petals */}
      <path
        d="M12 4c-1.9.5-3.2 1.9-3.2 3.4 0 1.8 1.4 3 3.2 3 1.6 0 2.8-1.1 3-2.6.2-1.6-1-3.2-3-3.8Z"
        fill="#c2446a"
      />
      {/* spiral heart of the rose */}
      <path
        d="M12 5.5c-1.3 0-2.2 1-2.2 2 0 1.2 1 2.1 2.2 2.1 1 0 1.8-.7 1.8-1.7 0-.8-.6-1.4-1.4-1.4-.6 0-1 .4-1 .9"
        stroke="#ffd9e2"
        strokeWidth="1.05"
        strokeLinecap="round"
      />
      {/* stem */}
      <path
        d="M12 12.5c.25 2.7-.35 5.5 0 9"
        stroke="#4a7c59"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      {/* leaves */}
      <path
        d="M11.8 15.7c-2.1-1-4.1-.8-5.3.9 1.7 1.4 3.8 1.2 5.3-.2"
        fill="#4a7c59"
      />
      <path
        d="M12.2 18.5c2.1-1 4.1-.8 5.3.9-1.7 1.4-3.8 1.2-5.3-.2"
        fill="#5c8f6b"
      />
    </svg>
  );
}

/** A raised hand mid-wave, with motion arcs — reads as "hi", not "deal". */
export function WaveHandIcon({ size = 20, className, style }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={className}
      style={style}
      fill="none"
      aria-hidden="true"
    >
      {/* waving hand */}
      <path
        d="M9.4 5.2c.55 0 1 .45 1 1v3.9h.95V4.6c0-.55.45-1 1-1s1 .45 1 1V10h.95V5.9c0-.55.45-1 1-1s1 .45 1 1V11h.95V7.7c0-.55.45-1 1-1s1 .45 1 1v6.1c0 4-2.8 6.8-6.6 6.8-2.9 0-4.9-1.5-6-3.9l-2.1-4.3c-.28-.55-.05-1.25.5-1.53.55-.27 1.2-.08 1.55.42l1.85 2.85V6.2c0-.55.45-1 1-1Z"
        fill="var(--violet)"
      />
      {/* motion arcs — the wave */}
      <path
        d="M19.9 3.4c1.5.8 2.5 2.2 2.8 3.9"
        stroke="var(--violet)"
        strokeWidth="1.4"
        strokeLinecap="round"
        opacity="0.75"
      />
      <path
        d="M17.2 2.2c.85.15 1.65.5 2.35 1"
        stroke="var(--violet)"
        strokeWidth="1.4"
        strokeLinecap="round"
        opacity="0.45"
      />
    </svg>
  );
}

/** Kiss lips — cupid's bow on top, fuller lower lip, gentle parting. */
export function LipsIcon({ size = 20, className, style }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={className}
      style={style}
      fill="none"
      aria-hidden="true"
    >
      {/* upper lip */}
      <path
        d="M3.8 10.2c1.6-2.1 3.2-2.8 4.7-1.9.9.5 1.5 1.5 2.3 1.5h2.4c.8 0 1.4-1 2.3-1.5 1.5-.9 3.1-.2 4.7 1.9-1.1.5-2.7 1-4.2 1.2-1.7.2-2.7-.4-4-.4s-2.3.6-4 .4c-1.5-.2-3.1-.7-4.2-1.2Z"
        fill="#d64070"
      />
      {/* lower lip */}
      <path
        d="M5.4 11.8c1.9.7 3.9 1.1 6.6 1.1s4.7-.4 6.6-1.1c-.9 3.1-3.4 5.2-6.6 5.2s-5.7-2.1-6.6-5.2Z"
        fill="#e35d7c"
      />
      {/* parting line */}
      <path
        d="M4.6 10.6c2.5.8 5 1.2 7.4 1.2s4.9-.4 7.4-1.2"
        stroke="#a82c54"
        strokeWidth="0.9"
        strokeLinecap="round"
      />
    </svg>
  );
}
