import { useState } from 'react';
import { useNavigate } from 'react-router';
import { motion, useReducedMotion } from 'framer-motion';
import { BadgeCheck, Crown, Plus } from 'lucide-react';
import BrandMark from '@/components/BrandMark';
import GlassCard from '@/components/GlassCard';
import GlassSheet from '@/components/GlassSheet';
import TabBar from '@/components/TabBar';
import { BtnGlass, BtnPrimary } from '@/components/ui/buttons';
import { trpc } from '@/providers/trpc';
import { useAuth } from '@/hooks/useAuth';
import { LOGIN_PATH } from '@/const';

type Seat =
  | { kind: 'person'; handle: string; photo: string; verified?: boolean }
  | { kind: 'bot'; handle: string }
  | { kind: 'open' };

const TABLES: Array<{
  eyebrow: string;
  title: string;
  note: string;
  seats: Seat[];
  edge?: 'amber';
}> = [
  {
    eyebrow: 'TRICK-TAKING',
    title: 'Spades',
    note: 'You + 3 labelled bots · local table',
    seats: [
      { kind: 'open' },
      { kind: 'bot', handle: 'BOT · Riley' },
      { kind: 'bot', handle: 'BOT · Maya' },
      { kind: 'bot', handle: 'BOT · Sam' },
    ],
  },
  {
    eyebrow: 'TWO PLAYERS',
    title: 'Concentration',
    note: 'Ships first · open seat',
    seats: [
      { kind: 'person', handle: 'morning fog', photo: '/avatar-08.jpg', verified: true },
      { kind: 'open' },
    ],
  },
];

function SeatTile({ seat, onOpen }: { seat: Seat; onOpen: () => void }) {
  if (seat.kind === 'open') {
    return (
      <button
        type="button"
        onClick={onOpen}
        className="flex min-h-[64px] w-[54px] flex-col items-center justify-end gap-1"
        aria-label="Take open seat"
      >
        <span
          className="flex h-9 w-9 items-center justify-center rounded-full"
          style={{ background: 'var(--field)', color: 'var(--text-secondary)' }}
        >
          <Plus size={16} aria-hidden="true" />
        </span>
        <span className="t-micro" style={{ color: 'var(--text-secondary)' }}>
          open seat
        </span>
      </button>
    );
  }

  if (seat.kind === 'bot') {
    return (
      <span className="flex w-[54px] flex-col items-center gap-1">
        <span
          className="t-caption flex h-9 w-9 items-center justify-center rounded-full font-bold"
          style={{ background: 'var(--field)', color: 'var(--text-secondary)' }}
        >
          B
        </span>
        <span className="t-micro text-center" style={{ color: 'var(--text-secondary)' }}>
          {seat.handle}
        </span>
      </span>
    );
  }

  return (
    <span className="relative flex w-[54px] flex-col items-center gap-1">
      <span className="relative">
        <img
          src={seat.photo}
          alt=""
          loading="lazy"
          className="h-9 w-9 rounded-full object-cover"
          style={{ boxShadow: '0 0 0 1.5px var(--ring-stroke)' }}
        />
        {seat.verified && (
          <BadgeCheck
            size={14}
            className="absolute -bottom-0.5 -right-0.5 rounded-full"
            style={{ color: 'var(--ok)', background: 'var(--stage-base)' }}
            aria-label="Verified"
          />
        )}
      </span>
      <span className="t-micro text-center" style={{ color: 'var(--text)' }}>
        {seat.handle}
      </span>
    </span>
  );
}

export default function Community() {
  const navigate = useNavigate();
  const reduced = useReducedMotion();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [previewOpen, setPreviewOpen] = useState(false);

  const entitlementsQuery = trpc.premium.entitlements.useQuery(undefined, {
    enabled: isAuthenticated,
  });
  const entitlement = entitlementsQuery.data?.entitlement ?? null;
  const trial = entitlementsQuery.data?.trial ?? null;

  const status = !isAuthenticated
    ? 'Sign in to take a seat'
    : trial?.active
      ? `Free trial · ${trial.daysLeft} day${trial.daysLeft === 1 ? '' : 's'} left`
      : entitlement && entitlement.tier !== 'free'
        ? 'Community access on'
        : 'Lobby visible · seating locked';

  return (
    <div className="relative h-full overflow-hidden">
      <div className="h-full overflow-y-auto pb-44">
        <header className="px-5 pt-3">
          <div className="glass flex h-[52px] items-center rounded-full px-4">
            <span className="glass-content flex w-full items-center justify-between gap-3">
              <span className="flex items-center gap-2">
                <BrandMark size={24} />
                <span className="t-value font-bold" style={{ color: 'var(--text)' }}>
                  Community
                </span>
              </span>
              <span
                className="t-micro rounded-full px-2.5 py-1"
                style={{ background: 'var(--field)', color: 'var(--text-secondary)' }}
              >
                {authLoading ? 'Loading…' : status}
              </span>
            </span>
          </div>

          <motion.div
            className="mt-7"
            initial={reduced ? { opacity: 0 } : { opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.34, ease: [0.22, 1, 0.36, 1] }}
          >
            <p className="t-eyebrow">PICTURES ONLY</p>
            <h1 className="t-heading mt-2" style={{ color: 'var(--text-ink)' }}>
              Tables open now.
            </h1>
            <p className="t-body mt-2" style={{ color: 'var(--text-secondary)' }}>
              No names, no profiles — a favourite picture, a four-digit number, and a
              clearly labelled bot when a seat needs filling.
            </p>
          </motion.div>
        </header>

        <section className="mt-6 flex flex-col gap-4 px-5" aria-label="Game tables">
          {TABLES.map((table, i) => (
            <motion.div
              key={table.title}
              initial={reduced ? { opacity: 0 } : { opacity: 0, y: 22 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: 0.38,
                delay: reduced ? 0 : 0.08 + i * 0.06,
                ease: [0.22, 1, 0.36, 1],
              }}
              onClick={table.title === 'Spades' ? () => navigate('/community/spades') : undefined}
              className={table.title === 'Spades' ? 'cursor-pointer' : undefined}
            >
              <GlassCard className="min-h-[188px] p-5" ringX={i * 18}>
                <div className="flex h-full flex-col justify-between gap-5">
                  <div>
                    <p className="t-eyebrow">{table.eyebrow}</p>
                    <div className="mt-1 flex items-baseline justify-between gap-3">
                      <h2 className="t-title" style={{ color: 'var(--text)' }}>
                        {table.title}
                      </h2>
                      <span className="t-micro" style={{ color: 'var(--text-secondary)' }}>
                        {table.note}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-end gap-2.5">
                    {table.seats.map((seat, seatIndex) => (
                      <SeatTile
                        key={`${table.title}-${seatIndex}`}
                        seat={seat}
                        onOpen={() =>
                          table.title === 'Concentration'
                            ? navigate('/community/concentration')
                            : table.title === 'Spades'
                              ? navigate('/community/spades')
                              : setPreviewOpen(true)
                        }
                      />
                    ))}
                  </div>
                </div>
              </GlassCard>
            </motion.div>
          ))}

          <motion.div
            initial={reduced ? { opacity: 0 } : { opacity: 0, y: 22 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.38, delay: reduced ? 0 : 0.24, ease: [0.22, 1, 0.36, 1] }}
          >
            <GlassCard edge="amber" className="min-h-[188px] p-5" ringX={46}>
              <div className="flex h-full flex-col justify-between gap-5">
                <div>
                  <p className="t-eyebrow">SUBSCRIBERS</p>
                  <h2 className="t-title mt-1" style={{ color: 'var(--text)' }}>
                    Start a table
                  </h2>
                  <p className="t-caption mt-1.5" style={{ color: 'var(--text-secondary)' }}>
                    Anyone verified can take an open seat. Hosting is what the
                    subscription buys, so the room stays full while the community grows.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <BtnPrimary className="h-11 px-5" onClick={() => setPreviewOpen(true)}>
                    <Crown size={16} aria-hidden="true" />
                    Open a game
                  </BtnPrimary>
                  {!isAuthenticated && (
                    <BtnGlass to={LOGIN_PATH} className="h-11 px-5">
                      Sign in
                    </BtnGlass>
                  )}
                </div>
              </div>
            </GlassCard>
          </motion.div>
        </section>

        <section className="mt-6 px-5">
          <GlassCard className="p-5">
            <h2 className="t-title-sm">Free stays in the dating core.</h2>
            <p className="t-caption mt-1.5" style={{ color: 'var(--text-secondary)' }}>
              Daily queue, matches, conversations and the match share board stay free.
              Community seating follows the same rule as the trial: full access during
              the 7-day trial, subscription after, in-progress games always finish.
            </p>
          </GlassCard>
        </section>
      </div>

      <TabBar />

      <GlassSheet
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        labelledBy="community-preview-title"
      >
        <div className="px-5 pb-8">
          <h2 id="community-preview-title" className="t-title-sm mt-2">
            Lobby is placed — seating comes with Stage 2.
          </h2>
          <p className="t-caption mt-2" style={{ color: 'var(--text-secondary)' }}>
            This page is now part of Resonance. The next build wires the real tables:
            permanent picture identity, server-side block checks at seating, labelled
            bots, and trial expiry that locks new seats without interrupting a game.
          </p>
          <div className="mt-5 flex gap-2">
            <BtnGlass className="flex-1" onClick={() => setPreviewOpen(false)}>
              Got it
            </BtnGlass>
            <BtnPrimary to="/premium" className="flex-1">
              See access
            </BtnPrimary>
          </div>
        </div>
      </GlassSheet>

    </div>
  );
}
