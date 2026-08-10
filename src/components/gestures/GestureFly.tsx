import { useCallback, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Heart } from 'lucide-react';
import { LipsIcon, WaveHandIcon } from './icons';

/**
 * GestureFly — the "it actually sent" moment. Tapping a gesture button spawns
 * its mark at the tap point; it rises, blooms slightly and fades. Roses fly
 * the realistic rose photo. Fires IMMEDIATELY on tap (optimistic) so a button
 * never feels dead, while the toast/match moment confirms the server result.
 */
export type FlyKind = 'wave' | 'rose' | 'dozen' | 'kiss' | 'like';

type Burst = { id: number; kind: FlyKind; x: number; y: number };

function FlyMark({ kind }: { kind: FlyKind }) {
  if (kind === 'rose' || kind === 'dozen') {
    return (
      <img
        src={kind === 'dozen' ? '/gestures/roses-dozen.png' : '/gestures/rose-single.png'}
        alt=""
        className={kind === 'dozen' ? 'h-16 w-11 object-contain' : 'h-14 w-9 object-contain'}
        draggable={false}
      />
    );
  }
  if (kind === 'kiss') return <LipsIcon size={30} />;
  if (kind === 'wave') return <WaveHandIcon size={30} />;
  return <Heart size={28} fill="var(--violet)" strokeWidth={0} />;
}

export function useGestureFly() {
  const [bursts, setBursts] = useState<Burst[]>([]);
  const idRef = useRef(0);

  const fly = useCallback((kind: FlyKind, e?: { clientX: number; clientY: number }) => {
    const x = e?.clientX ?? window.innerWidth / 2;
    const y = e?.clientY ?? window.innerHeight * 0.7;
    const id = ++idRef.current;
    setBursts((b) => [...b, { id, kind, x, y }]);
    window.setTimeout(() => setBursts((b) => b.filter((x2) => x2.id !== id)), 1100);
  }, []);

  const layer = (
    <>
      {bursts.map((b) => (
        <motion.div
          key={b.id}
          className="pointer-events-none fixed z-[80]"
          style={{ left: b.x, top: b.y, x: '-50%', y: '-50%' }}
          initial={{ opacity: 0, scale: 0.5, translateY: 0, rotate: -6 }}
          animate={{ opacity: [0, 1, 1, 0], scale: [0.5, 1.15, 1.05, 0.95], translateY: -130, rotate: 6 }}
          transition={{ duration: 1.05, ease: 'easeOut' }}
          aria-hidden="true"
        >
          <FlyMark kind={b.kind} />
        </motion.div>
      ))}
    </>
  );

  return { fly, layer };
}
