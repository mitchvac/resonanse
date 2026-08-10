import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { motion, useReducedMotion } from 'framer-motion';
import {
  BadgeCheck,
  Bot,
  Brain,
  ChessKnight,
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
  const { t } = useTranslation('connect');
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
            aria-label={t('community.verified')}
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
        aria-label={t('community.labelledBot')}
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
        aria-label={t('community.seatStage2')}
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
      aria-label={t('community.openSeatAria')}
    >
      <Plus size={16} aria-hidden="true" />
    </span>
  );
}

function seatLabel(seat: Seat, t: (key: string) => string) {
  if (seat.kind === 'person') return seat.handle;
  if (seat.kind === 'bot') return seat.handle; // always prefixed BOT ·
  if (seat.kind === 'locked') return t('community.stage2');
  return t('community.openSeat');
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
  const { t } = useTranslation('connect');
  return (
    <button
      type="button"
      onClick={onSeat}
      className="block w-full text-left"
      aria-label={t('community.roomAria', { title, status })}
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
                  {seatLabel(seat, t)}
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
  const { t } = useTranslation('connect');
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
    ? t('community.statusSignIn')
    : trial?.active
      ? t('community.statusTrial', { count: trial.daysLeft })
      : entitlement && entitlement.tier !== 'free'
        ? t('community.statusAccessOn')
        : t('community.statusLocked');

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
                  {t('community.title')}
                </span>
              </span>
              <span
                className="t-micro rounded-full px-2.5 py-1"
                style={{ background: 'var(--field)', color: 'var(--text-secondary)' }}
              >
                {authLoading ? t('community.loading') : status}
              </span>
            </span>
          </div>

          <motion.div className="mt-7" {...rise(0.05)}>
            <p className="t-eyebrow">{t('community.gameRoomEyebrow')}</p>
            <h1 className="t-heading mt-2" style={{ color: 'var(--text-ink)' }}>
              {t('community.headline')}
            </h1>
            <p className="t-body mt-2" style={{ color: 'var(--text-secondary)' }}>
              {t('community.intro')}
            </p>
          </motion.div>
        </header>

        {/* ---- Playable now ---------------------------------------- */}
        <section className="mt-7 flex flex-col gap-4 px-5" aria-label={t('community.playableNow')}>
          <motion.div {...rise(0.1)}>
            <GlassCard className="p-5" ringX={0}>
              <div className="flex flex-col gap-4">
                <div className="flex items-baseline justify-between gap-3">
                  <div>
                    <p className="t-eyebrow">{t('community.eyebrowSpades')}</p>
                    <h2 className="t-title mt-1" style={{ color: 'var(--text)' }}>
                      {t('community.gameSpades')}
                    </h2>
                  </div>
                  <span className="t-micro" style={{ color: 'var(--text-secondary)' }}>
                    {t('community.youAndBots')}
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
                          {s === 'you' ? t('community.yourSeat') : s}
                        </span>
                      </span>
                    ))}
                  </div>
                  <BtnPrimary className="h-11 px-5" onClick={() => navigate('/community/spades')}>
                    <Spade size={16} aria-hidden="true" />
                    {t('community.play')}
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
                    <p className="t-eyebrow">{t('community.eyebrowConcentration')}</p>
                    <h2 className="t-title mt-1" style={{ color: 'var(--text)' }}>
                      {t('community.gameConcentration')}
                    </h2>
                  </div>
                  <span className="t-micro" style={{ color: 'var(--text-secondary)' }}>
                    {t('community.openSeatCap')}
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
                        {t('community.openSeat')}
                      </span>
                    </span>
                  </div>
                  <BtnPrimary className="h-11 px-5" onClick={() => navigate('/community/concentration')}>
                    <Brain size={16} aria-hidden="true" />
                    {t('community.play')}
                  </BtnPrimary>
                </div>
              </div>
            </GlassCard>
          </motion.div>

          <motion.div {...rise(0.2)}>
            <GlassCard className="p-5" ringX={34}>
              <div className="flex flex-col gap-4">
                <div className="flex items-baseline justify-between gap-3">
                  <div>
                    <p className="t-eyebrow">{t('community.eyebrowChess')}</p>
                    <h2 className="t-title mt-1" style={{ color: 'var(--text)' }}>
                      {t('community.gameChess')}
                    </h2>
                  </div>
                  <span className="t-micro" style={{ color: 'var(--text-secondary)' }}>
                    {t('community.youVsBot', { bot: 'BOT · Riley' })}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-end gap-2.5">
                    <span className="flex w-[54px] flex-col items-center gap-1">
                      <SeatAvatar seat={{ kind: 'open' }} />
                      <span className="t-micro text-center" style={{ color: 'var(--text-secondary)' }}>
                        {t('community.yourSeat')}
                      </span>
                    </span>
                    <span className="flex w-[54px] flex-col items-center gap-1">
                      <SeatAvatar seat={{ kind: 'bot', handle: 'BOT · Riley' }} />
                      <span className="t-micro text-center" style={{ color: 'var(--text-secondary)' }}>
                        BOT · Riley
                      </span>
                    </span>
                  </div>
                  <BtnPrimary className="h-11 px-5" onClick={() => navigate('/community/chess')}>
                    <ChessKnight size={16} aria-hidden="true" />
                    {t('community.play')}
                  </BtnPrimary>
                </div>
              </div>
            </GlassCard>
          </motion.div>

          <motion.div {...rise(0.24)}>
            <GlassCard className="p-5" ringX={48}>
              <div className="flex flex-col gap-4">
                <div className="flex items-baseline justify-between gap-3">
                  <div>
                    <p className="t-eyebrow">{t('community.eyebrowDice')}</p>
                    <h2 className="t-title mt-1" style={{ color: 'var(--text)' }}>
                      {t('community.gameLiarsDice')}
                    </h2>
                  </div>
                  <span className="t-micro" style={{ color: 'var(--text-secondary)' }}>
                    {t('community.youAndBots')}
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
                          {s === 'you' ? t('community.yourSeat') : s}
                        </span>
                      </span>
                    ))}
                  </div>
                  <BtnPrimary className="h-11 px-5" onClick={() => navigate('/community/liars-dice')}>
                    <Dices size={16} aria-hidden="true" />
                    {t('community.play')}
                  </BtnPrimary>
                </div>
              </div>
            </GlassCard>
          </motion.div>
        </section>

        {/* ---- The game room (Stage 2 preview) ----------------------- */}
        <section className="mt-9 px-5" aria-label={t('community.theRoomAria')}>
          <motion.div {...rise(0.2)}>
            <p className="t-eyebrow">{t('community.theRoomEyebrow')}</p>
            <h2 className="t-title mt-1.5" style={{ color: 'var(--text-ink)' }}>
              {t('community.roomTitle')}
            </h2>
            <p className="t-caption mt-1.5" style={{ color: 'var(--text-secondary)' }}>
              {t('community.roomCaption')}
            </p>
          </motion.div>

          <div className="mt-5 flex flex-col gap-5">
            <motion.div {...rise(0.26)}>
              <GlassCard className="p-5" ringX={34}>
                <div className="flex items-baseline justify-between gap-3">
                  <p className="t-eyebrow">{t('community.tableEyebrow', { number: 1, game: t('community.gameSpades') })}</p>
                  <span className="t-micro" style={{ color: 'var(--text-secondary)' }}>
                    {t('community.inProgress')}
                  </span>
                </div>
                <div className="mt-4">
                  <TableRoom
                    icon={<Spade size={18} aria-hidden="true" />}
                    title={t('community.gameSpades')}
                    status={t('community.statusPlayableNow')}
                    live
                    seats={[
                      { kind: 'person', handle: 'ember line', photo: '/avatar-03.jpg', verified: true },
                      { kind: 'person', handle: 'low tide', photo: '/avatar-06.jpg', verified: true },
                      { kind: 'bot', handle: 'BOT · Sam' },
                      { kind: 'person', handle: 'paper crane', photo: '/avatar-09.jpg' },
                    ]}
                    onSeat={() => navigate('/community/spades')}
                  />
                </div>
              </GlassCard>
            </motion.div>

            <motion.div {...rise(0.32)}>
              <GlassCard className="p-5" ringX={48}>
                <div className="flex items-baseline justify-between gap-3">
                  <p className="t-eyebrow">{t('community.tableEyebrow', { number: 2, game: t('community.gameConcentration') })}</p>
                  <span className="t-micro" style={{ color: 'var(--text-secondary)' }}>
                    {t('community.seatingOpen')}
                  </span>
                </div>
                <div className="mt-4">
                  <TableRoom
                    icon={<Brain size={18} aria-hidden="true" />}
                    title={t('community.gameConcentration')}
                    status={t('community.statusTakeSeat')}
                    live
                    seats={[
                      { kind: 'person', handle: 'morning fog', photo: '/avatar-08.jpg', verified: true },
                      { kind: 'open' },
                    ]}
                    onSeat={() => navigate('/community/concentration')}
                  />
                </div>
              </GlassCard>
            </motion.div>

            <motion.div {...rise(0.38)}>
              <GlassCard className="p-5" ringX={62}>
                <div className="flex items-baseline justify-between gap-3">
                  <p className="t-eyebrow">{t('community.tableEyebrow', { number: 3, game: t('community.gameLiarsDice') })}</p>
                  <span className="t-micro" style={{ color: 'var(--text-secondary)' }}>
                    {t('community.seatingYours')}
                  </span>
                </div>
                <div className="mt-4">
                  <TableRoom
                    icon={<Dices size={18} aria-hidden="true" />}
                    title={t('community.gameLiarsDice')}
                    status={t('community.statusTakeSeat')}
                    live
                    seats={[
                      { kind: 'open' },
                      { kind: 'bot', handle: 'BOT · Riley' },
                      { kind: 'bot', handle: 'BOT · Maya' },
                      { kind: 'bot', handle: 'BOT · Sam' },
                    ]}
                    onSeat={() => navigate('/community/liars-dice')}
                  />
                </div>
              </GlassCard>
            </motion.div>

            <motion.div {...rise(0.44)}>
              <GlassCard className="p-5" ringX={76}>
                <div className="flex items-baseline justify-between gap-3">
                  <p className="t-eyebrow">{t('community.tableEyebrow', { number: 4, game: t('community.gameChess') })}</p>
                  <span className="t-micro" style={{ color: 'var(--text-secondary)' }}>
                    {t('community.seatingYours')}
                  </span>
                </div>
                <div className="mt-4">
                  <TableRoom
                    icon={<ChessKnight size={18} aria-hidden="true" />}
                    title={t('community.gameChess')}
                    status={t('community.statusTakeSeat')}
                    live
                    seats={[{ kind: 'open' }, { kind: 'bot', handle: 'BOT · Riley' }]}
                    onSeat={() => navigate('/community/chess')}
                  />
                </div>
              </GlassCard>
            </motion.div>
          </div>
        </section>

        {/* ---- How seating works ------------------------------------- */}
        <section className="mt-9 px-5" aria-label={t('community.seatingAria')}>
          <motion.div {...rise(0.42)}>
            <p className="t-eyebrow">{t('community.houseRules')}</p>
            <h2 className="t-title mt-1.5" style={{ color: 'var(--text-ink)' }}>
              {t('community.seatingTitle')}
            </h2>
          </motion.div>
          <motion.div className="mt-4" {...rise(0.46)}>
            <GlassCard className="flex flex-col gap-4 p-5" ringX={12}>
              {[
                {
                  icon: <ImageIcon size={16} aria-hidden="true" />,
                  title: t('community.rule1Title'),
                  body: t('community.rule1Body'),
                },
                {
                  icon: <Bot size={16} aria-hidden="true" />,
                  title: t('community.rule2Title'),
                  body: t('community.rule2Body'),
                },
                {
                  icon: <ShieldCheck size={16} aria-hidden="true" />,
                  title: t('community.rule3Title'),
                  body: t('community.rule3Body'),
                },
                {
                  icon: <Timer size={16} aria-hidden="true" />,
                  title: t('community.rule4Title'),
                  body: t('community.rule4Body'),
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
        <section className="mt-9 px-5" aria-label={t('community.startTableAria')}>
          <motion.div {...rise(0.5)}>
            <GlassCard edge="amber" className="min-h-[188px] p-5" ringX={46}>
              <div className="flex h-full flex-col justify-between gap-5">
                <div>
                  <p className="t-eyebrow">{t('community.subscribers')}</p>
                  <h2 className="t-title mt-1" style={{ color: 'var(--text)' }}>
                    {t('community.startTable')}
                  </h2>
                  <p className="t-caption mt-1.5" style={{ color: 'var(--text-secondary)' }}>
                    {t('community.startTableBody')}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <BtnPrimary className="h-11 px-5" onClick={() => setPreviewOpen(true)}>
                    <Crown size={16} aria-hidden="true" />
                    {t('community.openGame')}
                  </BtnPrimary>
                  {!isAuthenticated && (
                    <BtnGlass to={LOGIN_PATH} className="h-11 px-5">
                      {t('community.signIn')}
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
              <h2 className="t-title-sm">{t('community.freeTitle')}</h2>
              <p className="t-caption mt-1.5" style={{ color: 'var(--text-secondary)' }}>
                {t('community.freeBody')}
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
            {t('community.previewTitle')}
          </h2>
          <p className="t-caption mt-2" style={{ color: 'var(--text-secondary)' }}>
            {t('community.previewBody')}
          </p>
          <div className="mt-5 flex gap-2">
            <BtnGlass className="flex-1" onClick={() => setPreviewOpen(false)}>
              {t('community.gotIt')}
            </BtnGlass>
            <BtnPrimary to="/premium" className="flex-1">
              {t('community.seeAccess')}
            </BtnPrimary>
          </div>
        </div>
      </GlassSheet>
    </div>
  );
}
