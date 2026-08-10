import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { ArrowLeft, BadgeCheck, Bot, Dices, Minus, Plus, RotateCcw } from 'lucide-react';
import GlassCard from '@/components/GlassCard';
import { BtnGlass, BtnPrimary } from '@/components/ui/buttons';
import { trpc } from '@/providers/trpc';
import { useAuth } from '@/hooks/useAuth';
import { LOGIN_PATH } from '@/const';
import { useTranslation } from 'react-i18next';
import WinFireworks from '@/components/games/WinFireworks';
import OwnAvatar from '@/components/games/OwnAvatar';
import {
  BID_FACES,
  bidDecision,
  countMatchingDice,
  isLegalBid,
  nextLiveIndex,
  nextTurnIndex,
  rollDice,
} from '@/lib/liarsDice/engine';
import type { Bid, BidFace } from '@/lib/liarsDice/engine';

/* ------------------------------------------------------------------ */
/* Table constants                                                     */
/* ------------------------------------------------------------------ */

const SEATS = [
  { key: 'seats.you', isBot: false },
  { key: 'seats.botRiley', isBot: true },
  { key: 'seats.botMaya', isBot: true },
  { key: 'seats.botSam', isBot: true },
] as const;

const STARTING_DICE = 5;
const MAX_QUANTITY = SEATS.length * STARTING_DICE;
const DIE_GLYPHS = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'] as const;

function glyph(value: number): string {
  return DIE_GLYPHS[value - 1] ?? '⚀';
}

type Phase = 'play' | 'reveal' | 'over';

interface RevealState {
  bid: Bid;
  bidderIdx: number;
  challengerIdx: number;
  count: number;
  loserIdx: number;
  /** Dice on the table at the moment of the challenge (pre-loss). */
  tableDice: number[][];
}

function DieFace({
  value,
  size = 44,
  highlight = false,
  dim = false,
}: {
  value: number;
  size?: number;
  highlight?: boolean;
  dim?: boolean;
}) {
  const { t } = useTranslation('games');
  return (
    <span
      className="flex items-center justify-center rounded-[10px]"
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.72),
        lineHeight: 1,
        background: 'var(--field-focus)',
        color: 'var(--text)',
        opacity: dim ? 0.3 : 1,
        boxShadow: highlight
          ? '0 0 0 2px var(--ok)'
          : '0 0 0 1px var(--ring-stroke)',
      }}
      aria-label={t('liarsDice.dieAria', { value })}
      role="img"
    >
      {glyph(value)}
    </span>
  );
}

export default function LiarsDice() {
  const { t } = useTranslation('games');
  const navigate = useNavigate();
  const seatName = (i: number) => t(SEATS[i]?.key ?? 'seats.you');
  const { isAuthenticated, isLoading: authLoading } = useAuth();

  const entitlementsQuery = trpc.premium.entitlements.useQuery(undefined, {
    enabled: isAuthenticated,
  });
  const profileQuery = trpc.profile.me.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  const entitlement = entitlementsQuery.data?.entitlement ?? null;
  const trial = entitlementsQuery.data?.trial ?? null;
  const accessLoading = authLoading || (isAuthenticated && entitlementsQuery.isLoading);
  const allowed =
    isAuthenticated && (trial?.active || (entitlement?.tier ?? 'free') !== 'free');

  /* ------------------------------ state --------------------------- */
  const [dice, setDice] = useState<number[][]>(() => SEATS.map(() => []));
  const [bid, setBid] = useState<Bid | null>(null);
  const [bidder, setBidder] = useState(-1);
  const [turn, setTurn] = useState(0);
  const [phase, setPhase] = useState<Phase>('play');
  const [reveal, setReveal] = useState<RevealState | null>(null);
  const [winner, setWinner] = useState<number | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [qty, setQty] = useState(1);
  const [face, setFace] = useState<BidFace>(2);

  const timers = useRef<number[]>([]);

  const clearTimers = useCallback(() => {
    timers.current.forEach((id) => window.clearTimeout(id));
    timers.current = [];
  }, []);

  const later = useCallback((fn: () => void, ms: number) => {
    const id = window.setTimeout(fn, ms);
    timers.current.push(id);
  }, []);

  const pushLog = useCallback((line: string) => {
    setLog((current) => [line, ...current].slice(0, 6));
  }, []);

  /* --------------------------- game flow -------------------------- */

  const newGame = useCallback(() => {
    clearTimers();
    setDice(SEATS.map(() => rollDice(STARTING_DICE, Math.random)));
    setBid(null);
    setBidder(-1);
    setTurn(0);
    setPhase('play');
    setReveal(null);
    setWinner(null);
    setQty(1);
    setFace(2);
    setLog([t('liarsDice.log.freshTable')]);
  }, [clearTimers]);

  useEffect(() => {
    newGame();
    return () => clearTimers();
  }, [newGame, clearTimers]);

  function scheduleIfBot(t: number, diceState: number[][], b: Bid | null, bIdx: number) {
    if (!SEATS[t].isBot || diceState[t].length === 0) return;
    const fastForward = diceState[0].length === 0;
    const delay = fastForward ? 420 : 600 + Math.floor(Math.random() * 300);
    later(() => botAct(t, diceState, b, bIdx), delay);
  }

  function botAct(seat: number, diceState: number[][], b: Bid | null, bIdx: number) {
    const own = diceState[seat];
    const unknown = diceState.reduce((n, d, i) => n + (i === seat ? 0 : d.length), 0);
    const decision = bidDecision(own, b, unknown, Math.random);
    if (decision.kind === 'bid') {
      pushLog(t('liarsDice.log.bids', { name: seatName(seat), quantity: decision.bid.quantity, face: glyph(decision.bid.face) }));
      setBid(decision.bid);
      setBidder(seat);
      const alive = diceState.map((d) => d.length > 0);
      const nt = nextTurnIndex(alive, seat);
      setTurn(nt);
      scheduleIfBot(nt, diceState, decision.bid, seat);
    } else if (b && bIdx >= 0) {
      pushLog(t('liarsDice.log.callsLiar', { name: seatName(seat) }));
      resolveChallenge(seat, diceState, b, bIdx);
    }
  }

  function resolveChallenge(challengerIdx: number, diceState: number[][], b: Bid, bIdx: number) {
    const count = countMatchingDice(
      diceState.filter((d) => d.length > 0),
      b.face,
    );
    const stood = count >= b.quantity;
    const loserIdx = stood ? challengerIdx : bIdx;
    const after = diceState.map((d, i) => (i === loserIdx ? d.slice(0, d.length - 1) : d));

    setDice(after);
    setReveal({
      bid: b,
      bidderIdx: bIdx,
      challengerIdx,
      count,
      loserIdx,
      tableDice: diceState.map((d) => [...d]),
    });
    setPhase('reveal');

    pushLog(t('liarsDice.log.reveal', { count, face: glyph(b.face), verdict: t(stood ? 'liarsDice.verdict.stands' : 'liarsDice.verdict.bluff') }));
    pushLog(loserIdx === 0 ? t('liarsDice.log.youLoseDie') : t('liarsDice.log.losesDie', { name: seatName(loserIdx) }));
    if (after[loserIdx].length === 0) {
      pushLog(loserIdx === 0 ? t('liarsDice.log.youreOut') : t('liarsDice.log.isOut', { name: seatName(loserIdx) }));
    }

    const alive = after.map((d) => d.length > 0);
    const aliveCount = alive.filter(Boolean).length;
    const beat = after[0].length === 0 ? 900 : 2800;

    if (aliveCount === 1) {
      const winnerIdx = alive.indexOf(true);
      later(() => {
        setPhase('over');
        setWinner(winnerIdx);
        pushLog(
          winnerIdx === 0 ? t('liarsDice.youWinTable') : t('liarsDice.winsTable', { name: seatName(winnerIdx) }),
        );
      }, beat);
      return;
    }

    const starter = after[loserIdx].length > 0 ? loserIdx : nextLiveIndex(alive, loserIdx);
    later(() => beginRound(after, starter), beat);
  }

  function beginRound(prev: number[][], starter: number) {
    const rolled = prev.map((d) => (d.length > 0 ? rollDice(d.length, Math.random) : d));
    setDice(rolled);
    setBid(null);
    setBidder(-1);
    setReveal(null);
    setTurn(starter);
    setPhase('play');
    pushLog(starter === 0 ? t('liarsDice.log.newRoundYou') : t('liarsDice.log.newRoundOther', { name: seatName(starter) }));
    scheduleIfBot(starter, rolled, null, -1);
  }

  const youOut = dice[0].length === 0;
  const isPlayerTurn = phase === 'play' && turn === 0 && !youOut;
  const proposed: Bid = { quantity: qty, face };
  const proposedLegal = isLegalBid(bid, proposed);

  function placeBid() {
    if (!isPlayerTurn || !proposedLegal) return;
    pushLog(t('liarsDice.log.youBid', { quantity: proposed.quantity, face: glyph(proposed.face) }));
    setBid(proposed);
    setBidder(0);
    const alive = dice.map((d) => d.length > 0);
    const nt = nextTurnIndex(alive, 0);
    setTurn(nt);
    scheduleIfBot(nt, dice, proposed, 0);
  }

  function callLiar() {
    if (!isPlayerTurn || !bid || bidder < 0) return;
    pushLog(t('liarsDice.log.youCalledLiar'));
    resolveChallenge(0, dice, bid, bidder);
  }

  /* Keep the stepper on a minimal legal raise whenever your turn opens. */
  useEffect(() => {
    if (phase !== 'play' || turn !== 0) return;
    if (!bid) {
      setQty(1);
      setFace(2);
    } else if (bid.face < 6) {
      setQty(bid.quantity);
      setFace((bid.face + 1) as BidFace);
    } else {
      setQty(bid.quantity + 1);
      setFace(2);
    }
  }, [phase, turn, bid]);

  const playerPhoto = profileQuery.data?.profile.photos?.[0] ?? null;
  const playerName = profileQuery.data?.profile.displayName ?? '';

  return (
    <div className="relative h-full overflow-hidden">
      <div className="h-full overflow-y-auto pb-10">
        <div className="px-4 pt-2">
          <div className="glass flex h-[52px] items-center rounded-full pl-1 pr-4">
            <button
              type="button"
              aria-label={t('shared.backToCommunity')}
              onClick={() => navigate('/community')}
              className="glass-content flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full"
              style={{ color: 'var(--text)' }}
            >
              <ArrowLeft size={20} aria-hidden="true" />
            </button>
            <span
              className="t-value flex-1 pr-11 text-center font-bold"
              style={{ color: 'var(--text)', position: 'relative', zIndex: 1 }}
            >
              {t('liarsDice.title')}
            </span>
          </div>
        </div>

        <header className="mt-6 px-5">
          <p className="t-eyebrow">{t('shared.localTable')}</p>
          <h1 className="t-heading mt-2" style={{ color: 'var(--text-ink)' }}>
            {t('liarsDice.header')}
          </h1>
          <p className="t-body mt-2" style={{ color: 'var(--text-secondary)' }}>
            {t('liarsDice.intro')}
          </p>
        </header>

        {accessLoading && (
          <div className="mt-6 px-5">
            <div className="glass skeleton-shimmer h-[420px] rounded-[24px]" />
          </div>
        )}

        {!accessLoading && !isAuthenticated && (
          <section className="mt-6 px-5">
            <GlassCard className="p-5">
              <h2 className="t-title-sm">{t('shared.signInToSeat')}</h2>
              <p className="t-caption mt-1.5" style={{ color: 'var(--text-secondary)' }}>
                {t('shared.signInBody')}
              </p>
              <BtnPrimary to={LOGIN_PATH} className="mt-4 w-full">
                {t('shared.signIn')}
              </BtnPrimary>
            </GlassCard>
          </section>
        )}

        {!accessLoading && isAuthenticated && !allowed && (
          <section className="mt-6 px-5">
            <GlassCard edge="amber" className="p-5">
              <p className="t-eyebrow">{t('shared.seatingLocked')}</p>
              <h2 className="t-title-sm mt-1">{t('shared.trialEnded')}</h2>
              <p className="t-caption mt-1.5" style={{ color: 'var(--text-secondary)' }}>
                {t('shared.trialEndedBody')}
              </p>
              <BtnPrimary to="/premium" className="mt-4 w-full">
                {t('shared.seePlans')}
              </BtnPrimary>
            </GlassCard>
          </section>
        )}

        {!accessLoading && isAuthenticated && allowed && (
          <section className="mt-6 px-5" aria-label={t('liarsDice.gameAria')}>
            <GlassCard className="p-4" ringX={24}>
              <div className="flex items-center justify-between">
                <p className="t-eyebrow">{t('liarsDice.theTable')}</p>
                <BtnGlass
                  className="h-9 min-h-[36px] px-3"
                  onClick={newGame}
                  ariaLabel={t('shared.restartGame')}
                >
                  <RotateCcw size={15} aria-hidden="true" />
                </BtnGlass>
              </div>

              {/* Bot seats */}
              <div className="mt-3 grid grid-cols-3 gap-2">
                {SEATS.map((seat, idx) => {
                  if (!seat.isBot) return null;
                  const count = dice[idx].length;
                  const out = count === 0;
                  const active = phase === 'play' && turn === idx && !out;
                  const shownDice =
                    phase === 'reveal' && reveal ? reveal.tableDice[idx] : null;
                  return (
                    <div
                      key={seat.key}
                      className="flex flex-col items-center gap-1.5 rounded-[16px] px-1.5 py-3"
                      style={{
                        background: 'var(--field)',
                        boxShadow: active
                          ? '0 0 0 1.5px var(--violet)'
                          : '0 0 0 1px var(--ring-stroke)',
                        opacity: out ? 0.5 : 1,
                      }}
                    >
                      <span
                        className="flex h-10 w-10 items-center justify-center rounded-full"
                        style={{
                          background: 'var(--field-focus)',
                          color: 'var(--text-secondary)',
                          boxShadow: '0 0 0 1.5px var(--ring-stroke)',
                        }}
                        aria-label={t('shared.labelledBot')}
                        role="img"
                      >
                        <Bot size={18} aria-hidden="true" />
                      </span>
                      <span
                        className="t-micro font-bold uppercase"
                        style={{ color: 'var(--text)' }}
                      >
                        {seatName(idx)}
                      </span>
                      {out ? (
                        <span
                          className="t-micro"
                          style={{ color: 'var(--text-secondary)' }}
                        >
                          {t('liarsDice.out')}
                        </span>
                      ) : shownDice ? (
                        <span className="flex flex-wrap justify-center gap-0.5">
                          {shownDice.map((d, i) => (
                            <DieFace
                              key={i}
                              value={d}
                              size={22}
                              highlight={d === reveal?.bid.face || d === 1}
                              dim={d !== reveal?.bid.face && d !== 1}
                            />
                          ))}
                        </span>
                      ) : (
                        <span
                          className="flex items-center gap-1"
                          aria-label={t('liarsDice.diceLeft', { count })}
                        >
                          <Dices
                            size={12}
                            style={{ color: 'var(--text-secondary)' }}
                            aria-hidden="true"
                          />
                          {Array.from({ length: STARTING_DICE }, (_, i) => (
                            <span
                              key={i}
                              className="h-1.5 w-1.5 rounded-full"
                              style={{
                                background:
                                  i < count ? 'var(--violet)' : 'var(--ring-stroke)',
                              }}
                            />
                          ))}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Current bid */}
              <div className="mt-4 flex justify-center">
                {bid ? (
                  <p
                    className="t-value rounded-full px-5 py-2 text-center"
                    style={{
                      background: 'var(--field)',
                      color: 'var(--text)',
                      boxShadow: '0 0 0 1px var(--ring-stroke)',
                    }}
                    aria-live="polite"
                  >
                    {bidder === 0 ? t('liarsDice.youBid') : t('liarsDice.nameBids', { name: seatName(bidder) })}{' '}
                    {bid.quantity} × {glyph(bid.face)}
                  </p>
                ) : (
                  <p
                    className="t-caption rounded-full px-5 py-2"
                    style={{
                      background: 'var(--field)',
                      color: 'var(--text-secondary)',
                    }}
                  >
                    {t('liarsDice.noBid')}
                  </p>
                )}
              </div>
              <p
                className="t-caption mt-2 text-center"
                style={{ color: 'var(--text-secondary)' }}
                aria-live="polite"
              >
                {phase === 'play'
                  ? isPlayerTurn
                    ? t('liarsDice.yourTurn')
                    : t('liarsDice.thinking', { name: seatName(turn) })
                  : phase === 'reveal'
                    ? t('liarsDice.cupsUp')
                    : ''}
              </p>

              {/* Reveal verdict */}
              {phase === 'reveal' && reveal && (
                <div
                  className="mt-3 rounded-[16px] p-3 text-center"
                  style={{
                    background: 'var(--field)',
                    boxShadow: '0 0 0 1px var(--ring-stroke)',
                  }}
                >
                  <p className="t-body" style={{ color: 'var(--text)' }} aria-live="polite">
                    {t('liarsDice.revealLine', {
                      count: reveal.count,
                      face: glyph(reveal.bid.face),
                      verdict: t(reveal.count >= reveal.bid.quantity ? 'liarsDice.reveal.stands' : 'liarsDice.reveal.bluff'),
                    })}{' '}
                    {reveal.loserIdx === 0
                      ? t('liarsDice.reveal.youLose')
                      : t('liarsDice.reveal.loses', { name: seatName(reveal.loserIdx) })}
                  </p>
                  <p
                    className="t-micro mt-1"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    {youOut ? t('liarsDice.fastForward') : t('liarsDice.nextRound')}
                  </p>
                </div>
              )}

              {/* Your tray */}
              <div
                className="mt-4 rounded-[18px] p-3"
                style={{
                  background: 'var(--field)',
                  boxShadow:
                    phase === 'play' && turn === 0 && !youOut
                      ? '0 0 0 1.5px var(--violet)'
                      : '0 0 0 1px var(--ring-stroke)',
                }}
              >
                <div className="flex items-center gap-2.5">
                  <span className="relative">
                    <OwnAvatar photo={playerPhoto} name={playerName} />
                    <BadgeCheck
                      size={14}
                      className="absolute -bottom-0.5 -right-0.5 rounded-full"
                      style={{ color: 'var(--ok)', background: 'var(--stage-base)' }}
                      aria-label={t('shared.verified')}
                    />
                  </span>
                  <span
                    className="t-micro font-bold"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    {t('liarsDice.youDice', { count: dice[0].length })}
                  </span>
                </div>
                {youOut ? (
                  <p
                    className="t-caption mt-3 text-center"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    {t('liarsDice.youreOutRiding')}
                  </p>
                ) : (
                  <div className="mt-3 flex justify-center gap-2">
                    {(phase === 'reveal' && reveal ? reveal.tableDice[0] : dice[0]).map(
                      (d, i) => (
                        <DieFace
                          key={i}
                          value={d}
                          highlight={
                            phase === 'reveal' &&
                            (d === reveal?.bid.face || d === 1)
                          }
                        />
                      ),
                    )}
                  </div>
                )}
              </div>

              {/* Controls */}
              {!youOut && phase !== 'over' && (
                <div className="mt-4">
                  <div className="flex items-center justify-center gap-3">
                    <button
                      type="button"
                      aria-label={t('liarsDice.decreaseQty')}
                      disabled={!isPlayerTurn || qty <= 1}
                      onClick={() => setQty((q) => Math.max(1, q - 1))}
                      className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full disabled:opacity-40"
                      style={{
                        background: 'var(--field)',
                        color: 'var(--text)',
                        boxShadow: '0 0 0 1px var(--ring-stroke)',
                      }}
                    >
                      <Minus size={18} aria-hidden="true" />
                    </button>
                    <span
                      className="t-value w-12 text-center"
                      style={{ color: 'var(--text)' }}
                      aria-live="polite"
                    >
                      {qty} ×
                    </span>
                    <button
                      type="button"
                      aria-label={t('liarsDice.increaseQty')}
                      disabled={!isPlayerTurn || qty >= MAX_QUANTITY}
                      onClick={() => setQty((q) => Math.min(MAX_QUANTITY, q + 1))}
                      className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full disabled:opacity-40"
                      style={{
                        background: 'var(--field)',
                        color: 'var(--text)',
                        boxShadow: '0 0 0 1px var(--ring-stroke)',
                      }}
                    >
                      <Plus size={18} aria-hidden="true" />
                    </button>
                  </div>

                  <div className="mt-3 flex justify-center gap-2">
                    {BID_FACES.map((f) => (
                      <button
                        key={f}
                        type="button"
                        disabled={!isPlayerTurn}
                        onClick={() => setFace(f)}
                        aria-label={t('liarsDice.bidFace', { face: f })}
                        aria-pressed={face === f}
                        className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-[12px] text-[26px] leading-none disabled:opacity-50"
                        style={{
                          background: face === f ? 'var(--violet)' : 'var(--field)',
                          color: face === f ? '#ffffff' : 'var(--text)',
                          boxShadow:
                            face === f ? undefined : '0 0 0 1px var(--ring-stroke)',
                        }}
                      >
                        {glyph(f)}
                      </button>
                    ))}
                  </div>

                  <div className="mt-4 flex gap-2.5">
                    <BtnPrimary
                      className="h-12 flex-1"
                      disabled={!isPlayerTurn || !proposedLegal}
                      onClick={placeBid}
                    >
                      {t('liarsDice.bid')}
                    </BtnPrimary>
                    <BtnGlass
                      className="h-12 flex-1"
                      disabled={!isPlayerTurn || !bid}
                      onClick={callLiar}
                    >
                      {t('liarsDice.liar')}
                    </BtnGlass>
                  </div>

                  {isPlayerTurn && bid && !proposedLegal && (
                    <p
                      className="t-micro mt-2 text-center"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      {t('liarsDice.raiseHint')}
                    </p>
                  )}
                </div>
              )}

              {/* Game over */}
              {phase === 'over' && winner !== null && (
                <div
                  className="mt-4 flex flex-col items-center gap-3 rounded-[18px] p-5 text-center"
                  style={{
                    background: 'var(--field)',
                    boxShadow: '0 0 0 1.5px var(--violet)',
                  }}
                >
                  <Dices size={22} style={{ color: 'var(--violet)' }} aria-hidden="true" />
                  <p className="t-title" style={{ color: 'var(--text)' }} aria-live="polite">
                    {winner === 0 ? t('liarsDice.youWinTable') : t('liarsDice.winsTable', { name: seatName(winner) })}
                  </p>
                  <BtnPrimary className="h-12 w-full" onClick={newGame}>
                    <RotateCcw size={16} aria-hidden="true" />
                    {t('liarsDice.playAgain')}
                  </BtnPrimary>
                </div>
              )}

              {/* Round log */}
              {log.length > 0 && (
                <div className="mt-4">
                  <p className="t-eyebrow">{t('liarsDice.tableLog')}</p>
                  <ul className="mt-2 space-y-1">
                    {log.map((line, i) => (
                      <li
                        key={`${i}-${line}`}
                        className="t-micro"
                        style={{
                          color: 'var(--text-secondary)',
                          opacity: Math.max(0.45, 1 - i * 0.11),
                        }}
                      >
                        {line}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </GlassCard>
          </section>
        )}

        {/* V83 — fireworks when the human takes the table */}
        <WinFireworks fire={phase === 'over' && winner === 0} />
      </div>
    </div>
  );
}
