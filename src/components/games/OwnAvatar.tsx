import { cn } from '@/lib/utils';

/**
 * OwnAvatar — the signed-in player's avatar at a game table.
 * Real first profile photo when they have one; a violet initial disc when
 * they don't. NEVER a stock face — a stranger's photo labelled "you" reads
 * as a fake profile (V83 match-moment bug, V84 extended to game tables).
 */
export default function OwnAvatar({
  photo,
  name,
  className = 'h-9 w-9',
}: {
  photo: string | null;
  name: string;
  className?: string;
}) {
  if (photo) {
    return (
      <img
        src={photo}
        alt=""
        className={cn(className, 'rounded-full object-cover')}
        style={{ boxShadow: '0 0 0 1.5px var(--ring-stroke)' }}
      />
    );
  }
  return (
    <span
      role="img"
      aria-label="You"
      className={cn(
        className,
        'flex items-center justify-center rounded-full font-bold text-white',
      )}
      style={{
        background: 'var(--violet)',
        boxShadow: '0 0 0 1.5px var(--ring-stroke)',
      }}
    >
      <span aria-hidden="true">{(name.trim()[0] ?? '♥').toUpperCase()}</span>
    </span>
  );
}
