import { useState } from 'react';
import { useNavigate } from 'react-router';
import { motion, useReducedMotion } from 'framer-motion';
import {
  BadgeCheck,
  Bot,
  Brain,
  Crown,
  Dices,
  ImageIcon,
  Lock,
  Plus,
  ShieldCheck,
  Spade,
  Timer,
} from 'lucide-react';
import BrandMark from '@/components/BrandMark';
import GlassCard from '@/components/GlassCard';
import GlassSheet from '@/components/GlassSheet';
import TabBar from '@/components/TabBar';
import { BtnGlass, BtnPrimary } from '@/components/ui/buttons';
import { trpc } from '@/providers/trpc';
import { useAuth } from '@/hooks/useAuth';
import { LOGIN_PATH } from '@/const';

/* ------------------------------------------------------------------ */
/* Seats                                                               */
/* ------------------------------------------------------------------ */

type Seat =
  | { kind: 'person'; handle: string; photo: string; verified?: boolean }
  | { kind: 'bot'; handle: string }
  | { kind: 'open' }
  | { kind: 'locked' };

function SeatAvatar({ seat, size = 40 }: { seat: Seat; size?: number }) {
  if (seat.kind === 'person') {
    return (
      <span className="relative">
        <img
          src={seat.photo}
          alt=""
          loading="lazy"
          className="rounded-full object-cover"
          style={{ width: size, height: size, boxShadow: '0 0 0 1.5px var(--ring-stroke)' }}
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
    );
  }
  if (seat.kind === 'bot') {
    return (
      <span
        className="t-caption flex items-center justify-center rounded-full font-bold"
        style={{
          width: size,
          height: size,
          background: 'var(--field)',
          color: 'var(--text-secondary)',
          boxShadow: '0 0 0 1.5px var(--ring-stroke)',
        }}
        aria-label="Labelled bot"
      >
        B
      </span>
    );
  }
  if (seat.kind === 'locked') {
    return (
      <span
        className="flex items-center justify-center rounded-full"
        style={{
          width: size,
          height: size,
          background: 'var(--field)',
          color: 'var(--text-secondary)',
        }}
        aria-label="Seat opens with Stage 2"
      >
        <Lock size={14} aria-hidden="true" />
      </span>
    );
  }
  return (
    <span
      className="flex items-center justify-center rounded-full"
      style={{
        width: size,
        height: size,
        background: 'var(--field)',
        color: 'var(--text-secondary)',
      }}
      aria-label="Open seat"
    >
      <Plus size={16} aria-hidden="true" />
    </span>
  );
}

function seatLabel(seat: Seat) {
  if (seat.kind === 'person') return seat.handle;
  if (seat.kind === 'bot') return seat.handle; // always prefixed BOT ·
  if (seat.kind === 'locked') return 'Stage 2';
  return 'open seat';
}

/* ------------------------------------------------------------------ */
/* Table room — seats arranged around an oval "felt" rail              */
/* ------------------------------------------------------------------ */

function TableRoom({
  icon,
  title,
  status,
  seats,
  live,
  onSeat,
}: {
  icon: React.ReactNode;
  title: string;
  status: string;
  seats: Seat[];
  /** live rooms navigate into the playable build; others open the Stage-2 sheet */
  live?: boolean;
  onSeat: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSeat}
      className="block w-full text-left"
      aria-label={`${title} — ${status}`}
    >
      <div
        className="relative mx-auto w-full max-w-[320px] rounded-[40px] px-4 pb-3 pt-5"
        style={{
          background: 'var(--field)',
          boxShadow: live
            ? 'inset 0 0 0 1.5px var(--ring-stroke), 0 8px 24px -12px rgba(58,44,24,0.25)'
            : 'inset 0 0 0 1.5px var(--ring-stroke)',
        }}
      >
        {/* center medallion */}
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1">
          <span
            className="flex h-11 w-11 items-center justify-center rounded-full"
            style={{ background: 'var(--stage-base)', color: 'var(--text)', boxShadow: '0 0 0 1.5px var(--ring-stroke)' }}
          >
            {icon}
          </span>
          <span className="t-caption font-bold" style={{ color: 'var(--text)' }}>
            {title}
          </span>
          <span
            className="t-micro rounded-full px-2 py-0.5"
            style={{
              background: live ? 'var(--ok)' : 'var(--stage-base)',
              color: live ? '#fff' : 'var(--text-secondary)',
            }}
          >
            {status}
          </span>
        </div>

        {/* seats on the rail */}
        <div className="relative mx-auto aspect-[8/5] w-full">
          {seats.map((seat, i) => {
            const angle = -90 + i * (360 / seats.length);
            const rad = (angle * Math.PI) / 180;
            const x = 50 + 46 * Math.cos(rad);
            const y = 50 + 47 * Math.sin(rad);
            return (
              <span
                key={i}
                className="absolute flex w-[64px] -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1"
                style={{ left: `${x}%`, top: `${y}%` }}
              >
                <SeatAvatar seat={seat} />
                <span
                  className="t-micro text-center leading-tight"
                  style={{ color: seat.kind === 'person' ? 'var(--text)' : 'var(--text-secondary)' }}
                >
                  {seatLabel(seat)}
                </span>
              </span>
            );
          })}
        </div>
      </div>
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

const EASE = [0.22, 1, 0.36, 1] as const;

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

  const rise = (delay = 0) =>
    ({
      initial: reduced ? { opacity: 0 } : { opacity: 0, y: 18 },
      animate: { opacity: 1, y: 0 },
      transition: { duration: 0.38, delay: reduced ? 0 : delay, ease: EASE },
    }) as const;

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

          <motion.div className="mt-7" {...rise(0.05)}>
            <p className="t-eyebrow">THE GAME ROOM</p>
            <h1 className="t-heading mt-2" style={{ color: 'var(--text-ink)' }}>
              Pull up a chair.
            </h1>
            <p className="t-body mt-2" style={{ color: 'var(--text-secondary)' }}>
              No names, no profiles — a favourite picture, a four-digit number, and a
              clearly labelled bot when a seat needs filling.
            </p>
          </motion.div>
        </header>

        {/* ---- Playable now ---------------------------------------- */}
        <section className="mt-7 flex flex-col gap-4 px-5" aria-label="Playable now">
          <motion.div {...rise(0.1)}>
            <GlassCard className="p-5" ringX={0}>
              <div className="flex flex-col gap-4">
                <div className="flex items-baseline justify-between gap-3">
                  <div>
                    <p className="t-eyebrow">TRICK-TAKING · LIVE</p>
                    <h2 className="t-title mt-1" style={{ color: 'var(--text)' }}>
                      Spades
                    </h2>
                  </div>
                  <span className="t-micro" style={{ color: 'var(--text-secondary)' }}>
                    You + 3 labelled bots
                  </span>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-end gap-2">
                    {(['you', 'BOT · Riley', 'BOT · Maya', 'BOT · Sam'] as const).map((s) => (
                      <span key={s} className="flex w-[50px] flex-col items-center gap-1">
                        <SeatAvatar
                          seat={s === 'you' ? { kind: 'open' } : { kind: 'bot', handle: s }}
                        />
                        <span className="t-micro text-center" style={{ color: 'var(--text-secondary)' }}>
                          {s === 'you' ? 'your seat' : s}
                        </span>
                      </span>
                    ))}
                  </div>
                  <BtnPrimary className="h-11 px-5" onClick={() => navigate('/community/spades')}>
                    <Spade size={16} aria-hidden="true" />
                    Play
                  </BtnPrimary>
                </div>
              </div>
            </GlassCard>
          </motion.div>

          <motion.div {...rise(0.16)}>
            <GlassCard className="p-5" ringX={18}>
              <div className="flex flex-col gap-4">
                <div className="flex items-baseline justify-between gap-3">
                  <div>
                    <p className="t-eyebrow">TWO PLAYERS · LIVE</p>
                    <h2 className="t-title mt-1" style={{ color: 'var(--text)' }}>
                      Concentration
                    </h2>
                  </div>
                  <span className="t-micro" style={{ color: 'var(--text-secondary)' }}>
                    Open seat
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-end gap-2.5">
                    <span className="flex w-[54px] flex-col items-center gap-1">
                      <SeatAvatar seat={{ kind: 'person', handle: 'morning fog', photo: '/avatar-08.jpg', verified: true }} />
                      <span className="t-micro text-center" style={{ color: 'var(--text)' }}>
                        morning fog
                      </span>
                    </span>
                    <span className="flex w-[54px] flex-col items-center gap-1">
                      <SeatAvatar seat={{ kind: 'open' }} />
                      <span className="t-micro text-center" style={{ color: 'var(--text-secondary)' }}>
                        open seat
                      </span>
                    </span>
                  </div>
                  <BtnPrimary className="h-11 px-5" onClick={() => navigate('/community/concentration')}>
                    <Brain size={16} aria-hidden="true" />
                    Play
                  </BtnPrimary>
                </div>
              </div>
            </GlassCard>
          </motion.div>
        </section>

        {/* ---- The game room (Stage 2 preview) ----------------------- */}
        <section className="mt-9 px-5" aria-label="The game room">
          <motion.div {...rise(0.2)}>
            <p className="t-eyebrow">THE ROOM</p>
            <h2 className="t-title mt-1.5" style={{ color: 'var(--text-ink)' }}>
              Tables seating soon.
            </h2>
            <p className="t-caption mt-1.5" style={{ color: 'var(--text-secondary)' }}>
              This is where the real tables live. Seating, spectating and hosting wire
              up with Stage 2 — everything below is the actual room layout.
            </p>
          </motion.div>

          <div className="mt-5 flex flex-col gap-5">
            <motion.div {...rise(0.26)}>
              <GlassCard className="p-5" ringX={34}>
                <div className="flex items-baseline justify-between gap-3">
                  <p className="t-eyebrow">TABLE 1 · SPADES</p>
                  <span className="t-micro" style={{ color: 'var(--text-secondary)' }}>
                    in progress
                  </span>
                </div>
                <div className="mt-4">
                  <TableRoom
                    icon={<Spade size={18} aria-hidden="true" />}
                    title="Spades"
                    status="Spectate · Stage 2"
                    seats={[
                      { kind: 'person', handle: 'ember line', photo: '/avatar-03.jpg', verified: true },
                      { kind: 'person', handle: 'low tide', photo: '/avatar-06.jpg', verified: true },
                      { kind: 'bot', handle: 'BOT · Sam' },
                      { kind: 'person', handle: 'paper crane', photo: '/avatar-09.jpg' },
                    ]}
                    onSeat={() => setPreviewOpen(true)}
                  />
                </div>
              </GlassCard>
            </motion.div>

            <motion.div {...rise(0.32)}>
              <GlassCard className="p-5" ringX={48}>
                <div className="flex items-baseline justify-between gap-3">
                  <p className="t-eyebrow">TABLE 2 · CONCENTRATION</p>
                  <span className="t-micro" style={{ color: 'var(--text-secondary)' }}>
                    seating · 1 open
                  </span>
                </div>
                <div className="mt-4">
                  <TableRoom
                    icon={<Brain size={18} aria-hidden="true" />}
                    title="Concentration"
                    status="Take a seat · Stage 2"
                    seats={[
                      { kind: 'person', handle: 'morning fog', photo: '/avatar-08.jpg', verified: true },
                      { kind: 'open' },
                    ]}
                    onSeat={() => setPreviewOpen(true)}
                  />
                </div>
              </GlassCard>
            </motion.div>

            <motion.div {...rise(0.38)}>
              <GlassCard className="p-5" ringX={62}>
                <div className="flex items-baseline justify-between gap-3">
                  <p className="t-eyebrow">TABLE 3 · LIAR'S DICE</p>
                  <span className="t-micro" style={{ color: 'var(--text-secondary)' }}>
                    opens with Stage 2
                  </span>
                </div>
                <div className="mt-4">
                  <TableRoom
                    icon={<Dices size={18} aria-hidden="true" />}
                    title="Liar's Dice"
                    status="Locked · Stage 2"
                    seats={[
                      { kind: 'locked' },
                      { kind: 'locked' },
                      { kind: 'locked' },
                      { kind: 'locked' },
                      { kind: 'locked' },
                    ]}
                    onSeat={() => setPreviewOpen(true)}
                  />
                </div>
              </GlassCard>
            </motion.div>
          </div>
        </section>

        {/* ---- How seating works ------------------------------------- */}
        <section className="mt-9 px-5" aria-label="How seating works">
          <motion.div {...rise(0.42)}>
            <p className="t-eyebrow">HOUSE RULES</p>
            <h2 className="t-title mt-1.5" style={{ color: 'var(--text-ink)' }}>
              How seating works.
            </h2>
          </motion.div>
          <motion.div className="mt-4" {...rise(0.46)}>
            <GlassCard className="flex flex-col gap-4 p-5" ringX={12}>
              {[
                {
                  icon: <ImageIcon size={16} aria-hidden="true" />,
                  title: 'Permanent picture identity',
                  body: 'One favourite picture and a four-digit number per table — never your dating profile, never your name.',
                },
                {
                  icon: <Bot size={16} aria-hidden="true" />,
                  title: 'Bots are always labelled',
                  body: 'Every bot seat reads BOT · name in plain text. No fake people, ever — at any table, in any game.',
                },
                {
                  icon: <ShieldCheck size={16} aria-hidden="true" />,
                  title: 'Block checks at seating',
                  body: 'Stage 2 checks blocks server-side before anyone sits — people you blocked can never land at your table.',
                },
                {
                  icon: <Timer size={16} aria-hidden="true" />,
                  title: 'Games always finish',
                  body: 'Trial or subscription expiry locks new seats, but a game already in progress always plays out.',
                },
              ].map((rule) => (
                <div key={rule.title} className="flex items-start gap-3">
                  <span
                    className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
                    style={{ background: 'var(--field)', color: 'var(--text)' }}
                  >
                    {rule.icon}
                  </span>
                  <span>
                    <span className="t-caption block font-bold" style={{ color: 'var(--text)' }}>
                      {rule.title}
                    </span>
                    <span className="t-caption mt-0.5 block" style={{ color: 'var(--text-secondary)' }}>
                      {rule.body}
                    </span>
                  </span>
                </div>
              ))}
            </GlassCard>
          </motion.div>
        </section>

        {/* ---- Start a table (subscribers) ---------------------------- */}
        <section className="mt-9 px-5" aria-label="Start a table">
          <motion.div {...rise(0.5)}>
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

        {/* ---- Free note ---------------------------------------------- */}
        <section className="mt-6 px-5">
          <motion.div {...rise(0.54)}>
            <GlassCard className="p-5">
              <h2 className="t-title-sm">Free stays in the dating core.</h2>
              <p className="t-caption mt-1.5" style={{ color: 'var(--text-secondary)' }}>
                Daily queue, matches, conversations and the match share board stay free.
                Community seating follows the same rule as the trial: full access during
                the 7-day trial, subscription after, in-progress games always finish.
              </p>
            </GlassCard>
          </motion.div>
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
            The game room opens with Stage 2.
          </h2>
          <p className="t-caption mt-2" style={{ color: 'var(--text-secondary)' }}>
            The room is placed and the layout is final. The next build wires the real
            tables: permanent picture identity, server-side block checks at seating,
            labelled bots, and trial expiry that locks new seats without interrupting
            a game.
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
