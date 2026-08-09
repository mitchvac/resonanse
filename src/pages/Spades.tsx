import { useCallback, useEffect, useReducer, useRef } from 'react';
import { useNavigate } from 'react-router';
import { ArrowLeft, RotateCcw } from 'lucide-react';
import GlassCard from '@/components/GlassCard';
import { BtnGlass, BtnPrimary } from '@/components/ui/buttons';
import { trpc } from '@/providers/trpc';
import { useAuth } from '@/hooks/useAuth';
import { LOGIN_PATH } from '@/const';
import { cn } from '@/lib/utils';

type CardT = { s: number; r: number };
type TrickPlay = { p: number; c: CardT };
type Side = 'us' | 'them';
type Game = {
  hands: CardT[][];
  bids: Array<number | null>;
  tricks: number[];
  trick: TrickPlay[];
  leader: number;
  turn: number;
  broken: boolean;
  phase: 'bid' | 'play' | 'over';
  bidTurn: number;
  dealer: number;
  score: Record<Side, number>;
  bags: Record<Side, number>;
  msg: string;
  gameOver: boolean;
};

const SUIT = ['♠', '♥', '♦', '♣'];
const SUIT_NAME = ['spades', 'hearts', 'diamonds', 'clubs'];
const FACE: Record<number, string> = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };
const NAMES = ['You', 'Riley', 'Maya', 'Sam'];
const ISBOT = [false, true, true, true]; // local table: every non-user seat is labelled BOT
// Bot seat portraits — every bot seat keeps an unmistakable BOT badge + "BOT · Name" label.
// These are AI-generated avatars, never photos of real members.
const BOT_HEADS: (string | null)[] = [null, '/bot-heads/riley.png', '/bot-heads/maya.png', '/bot-heads/sam.png'];
const rankOf = (c: CardT) => FACE[c.r] ?? String(c.r);
const isRed = (c: CardT) => c.s === 1 || c.s === 2;
const teamOf = (p: number): Side => (p % 2 === 0 ? 'us' : 'them');

function freshGame(): Game {
  return {
    hands: [[], [], [], []],
    bids: [null, null, null, null],
    tricks: [0, 0, 0, 0],
    trick: [],
    leader: 1,
    turn: 1,
    broken: false,
    phase: 'bid',
    bidTurn: 1,
    dealer: 0,
    score: { us: 0, them: 0 },
    bags: { us: 0, them: 0 },
    msg: 'Dealing…',
    gameOver: false,
  };
}

function dealInto(g: Game) {
  const deck: CardT[] = [];
  for (let s = 0; s < 4; s++) for (let r = 2; r <= 14; r++) deck.push({ s, r });
  for (let i = deck.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  g.hands = [0, 1, 2, 3].map((p) =>
    deck.slice(p * 13, p * 13 + 13).sort((a, b) => a.s - b.s || b.r - a.r),
  );
  g.bids = [null, null, null, null];
  g.tricks = [0, 0, 0, 0];
  g.trick = [];
  g.broken = false;
  g.dealer = (g.dealer + 1) % 4;
  g.leader = (g.dealer + 1) % 4;
  g.bidTurn = g.leader;
  g.turn = g.leader;
  g.phase = 'bid';
  g.gameOver = false;
  g.msg = 'Bidding…';
}

function botBid(h: CardT[]) {
  const sp = h.filter((c) => c.s === 0);
  let b = sp.filter((c) => c.r >= 12).length + Math.max(0, sp.length - 3) * 0.5;
  for (const c of h) {
    if (c.s !== 0) {
      if (c.r === 14) b += 1;
      else if (c.r === 13) b += 0.5;
    }
  }
  if (sp.length <= 2 && !sp.some((c) => c.r >= 12) && !h.some((c) => c.r === 14)) return 0;
  return Math.max(1, Math.round(b));
}

function legal(g: Game, p: number) {
  const h = g.hands[p];
  if (g.trick.length === 0) {
    const non = h.filter((c) => c.s !== 0);
    return !g.broken && non.length ? non : h;
  }
  const led = g.trick[0].c.s;
  const follow = h.filter((c) => c.s === led);
  return follow.length ? follow : h;
}

function winnerOf(t: TrickPlay[]) {
  let best = t[0];
  for (const x of t.slice(1)) {
    if (x.c.s === best.c.s) {
      if (x.c.r > best.c.r) best = x;
    } else if (x.c.s === 0) {
      best = x;
    }
  }
  return best.p;
}

function lowest(a: CardT[]) {
  return a.reduce((x, y) =>
    (x.s === 0) !== (y.s === 0) ? (x.s === 0 ? y : x) : x.r < y.r ? x : y,
  );
}

function botCard(g: Game, p: number) {
  const L = legal(g, p);
  if (!g.trick.length) {
    const ace = L.find((c) => c.r === 14 && c.s !== 0);
    return ace || lowest(L);
  }
  if (teamOf(winnerOf(g.trick)) === teamOf(p) && g.trick.length >= 2) return lowest(L);
  const wins = L.filter((c) => winnerOf([...g.trick, { p, c }]) === p);
  if (wins.length) {
    return wins.reduce((x, y) =>
      (x.s === 0 ? 100 + x.r : x.r) < (y.s === 0 ? 100 + y.r : y.r) ? x : y,
    );
  }
  return lowest(L);
}

function CardFace({ card, mini = false }: { card: CardT; mini?: boolean }) {
  return (
    <span className={cn('relative block h-full w-full rounded-[inherit] bg-white text-[#16161C] ring-1 ring-black/10', isRed(card) && 'text-[#B32626]')}>
      <span className={cn('absolute left-1 top-1 font-bold leading-none', mini ? 'text-[12px]' : 'text-[13px]')}>
        {rankOf(card)}
      </span>
      <span className={cn('absolute left-1 leading-none', mini ? 'top-4 text-[9px]' : 'top-[18px] text-[10px]')}>
        {SUIT[card.s]}
      </span>
      <span className={cn('absolute bottom-0.5 right-1 leading-none opacity-55', mini ? 'text-[17px]' : 'text-[20px]')}>
        {SUIT[card.s]}
      </span>
    </span>
  );
}

export default function Spades() {
  const navigate = useNavigate();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [, bump] = useReducer((x: number) => x + 1, 0);

  const entitlementsQuery = trpc.premium.entitlements.useQuery(undefined, {
    enabled: isAuthenticated,
  });
  const entitlement = entitlementsQuery.data?.entitlement ?? null;
  const trial = entitlementsQuery.data?.trial ?? null;
  const accessLoading = authLoading || (isAuthenticated && entitlementsQuery.isLoading);
  const allowed =
    isAuthenticated && (trial?.active || (entitlement?.tier ?? 'free') !== 'free');

  const game = useRef<Game>(freshGame());
  const timers = useRef<number[]>([]);

  const clearTimers = useCallback(() => {
    timers.current.forEach((id) => window.clearTimeout(id));
    timers.current = [];
  }, []);

  const later = useCallback((fn: () => void, ms: number) => {
    const id = window.setTimeout(fn, ms);
    timers.current.push(id);
  }, []);

  const renderNow = useCallback(() => bump(), []);

  const endHand = useCallback(() => {
    const g = game.current;
    for (const side of ['us', 'them'] as const) {
      const ps = side === 'us' ? [0, 2] : [1, 3];
      const nils = ps.filter((p) => g.bids[p] === 0);
      const contract = ps
        .filter((p) => (g.bids[p] ?? 0) > 0)
        .reduce((sum, p) => sum + (g.bids[p] ?? 0), 0);
      const won = ps.reduce((sum, p) => sum + g.tricks[p], 0);
      for (const p of nils) g.score[side] += g.tricks[p] === 0 ? 100 : -100;
      const fc = won - nils.reduce((sum, p) => sum + g.tricks[p], 0);
      if (contract > 0) {
        if (fc >= contract) {
          const over = fc - contract;
          g.score[side] += contract * 10 + over;
          g.bags[side] += over;
        } else {
          g.score[side] -= contract * 10;
        }
      }
      if (g.bags[side] >= 10) {
        g.score[side] -= 100;
        g.bags[side] -= 10;
      }
    }
    g.phase = 'over';
    g.gameOver = g.score.us >= 250 || g.score.them >= 250;
    g.msg = g.gameOver
      ? g.score.us > g.score.them
        ? 'You and BOT Maya take the game.'
        : 'BOT Riley and BOT Sam take the game.'
      : 'Hand over.';
    renderNow();
  }, [renderNow]);

  const step = useCallback(() => {
    const g = game.current;
    if (g.phase === 'bid') {
      if (g.bids.every((b) => b !== null)) {
        g.phase = 'play';
        g.turn = g.leader;
        g.msg = g.turn === 0 ? 'Your lead. Spades not broken.' : `${NAMES[g.turn]} leads…`;
        renderNow();
        later(step, 0);
        return;
      }
      if (g.bidTurn !== 0) {
        g.bids[g.bidTurn] = botBid(g.hands[g.bidTurn]);
        g.bidTurn = (g.bidTurn + 1) % 4;
        g.msg = 'Bidding…';
        renderNow();
        later(step, 430);
        return;
      }
      g.msg = 'Your bid. Nil scores +100 if you take no tricks, −100 if you take any.';
      renderNow();
      return;
    }
    if (g.phase === 'play' && g.turn !== 0) {
      const p = g.turn;
      later(() => play(p, botCard(g, p)), 560);
    }
    renderNow();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [later, renderNow]);

  const play = useCallback(
    (p: number, c: CardT) => {
      const g = game.current;
      if (g.phase !== 'play') return;
      g.hands[p] = g.hands[p].filter((x) => x !== c);
      if (c.s === 0) g.broken = true;
      g.trick.push({ p, c });
      renderNow();

      if (g.trick.length === 4) {
        const w = winnerOf(g.trick);
        g.msg = w === 0 ? 'You take it.' : `${NAMES[w]} takes it.`;
        renderNow();
        later(() => {
          g.tricks[w]++;
          g.leader = w;
          g.turn = w;
          g.trick = [];
          if (g.hands.every((h) => h.length === 0)) {
            endHand();
            return;
          }
          renderNow();
          step();
        }, 1050);
      } else {
        g.turn = (p + 1) % 4;
        later(step, 500);
      }
    },
    [endHand, later, renderNow, step],
  );

  const newTable = useCallback((resetScores: boolean) => {
    clearTimers();
    const g = game.current;
    if (resetScores) {
      g.score = { us: 0, them: 0 };
      g.bags = { us: 0, them: 0 };
    }
    dealInto(g);
    renderNow();
    later(step, 0);
  }, [clearTimers, later, renderNow, step]);

  useEffect(() => {
    newTable(true);
    return () => clearTimers();
  }, [newTable, clearTimers]);

  const g = game.current;
  const legalHand = g.phase === 'play' && g.turn === 0 ? legal(g, 0) : [];
  const teamInfo = (side: Side) => {
    const ps = side === 'us' ? [0, 2] : [1, 3];
    const bid = ps.every((p) => g.bids[p] !== null)
      ? ps.map((p) => (g.bids[p] === 0 ? 'nil' : g.bids[p])).join('+')
      : '—';
    return `bid ${bid} · ${ps.reduce((sum, p) => sum + g.tricks[p], 0)} tricks · ${g.bags[side]} bags`;
  };

  const SPOT: Record<number, { left: string; top: string; scale: string }> = {
    2: { left: '50%', top: '9%', scale: 'scale-90' },
    1: { left: '11%', top: '48%', scale: '' },
    3: { left: '89%', top: '48%', scale: '' },
    0: { left: '50%', top: '90%', scale: 'scale-105' },
  };
  const SLOT: Record<number, { left: string; top: string; rotate: string }> = {
    2: { left: '50%', top: '35%', rotate: '-rotate-6' },
    1: { left: '34%', top: '48%', rotate: 'rotate-6' },
    3: { left: '66%', top: '48%', rotate: '-rotate-6' },
    0: { left: '50%', top: '62%', rotate: 'rotate-3' },
  };

  return (
    <div className="relative h-full overflow-hidden">
      <div className="h-full overflow-y-auto pb-10">
        <div className="px-4 pt-2">
          <div className="glass flex h-[52px] items-center rounded-full pl-1 pr-4">
            <button
              type="button"
              aria-label="Back to Community"
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
              Spades
            </span>
          </div>
        </div>

        <header className="mt-6 px-5">
          <p className="t-eyebrow">LOCAL TABLE</p>
          <h1 className="t-heading mt-2" style={{ color: 'var(--text-ink)' }}>
            You + BOT Maya vs BOT Riley + BOT Sam.
          </h1>
          <p className="t-body mt-2" style={{ color: 'var(--text-secondary)' }}>
            Playable now on this device. Every non-you seat is labelled BOT. Live
            multiplayer Spades arrives with the Stage 2 community backend.
          </p>
        </header>

        {accessLoading && (
          <div className="mt-6 px-5">
            <div className="glass skeleton-shimmer h-[560px] rounded-[24px]" />
          </div>
        )}

        {!accessLoading && !isAuthenticated && (
          <section className="mt-6 px-5">
            <GlassCard className="p-5">
              <h2 className="t-title-sm">Sign in to take a seat.</h2>
              <BtnPrimary to={LOGIN_PATH} className="mt-4 w-full">
                Sign in
              </BtnPrimary>
            </GlassCard>
          </section>
        )}

        {!accessLoading && isAuthenticated && !allowed && (
          <section className="mt-6 px-5">
            <GlassCard edge="amber" className="p-5">
              <p className="t-eyebrow">SEATING LOCKED</p>
              <h2 className="t-title-sm mt-1">Your free trial has ended.</h2>
              <p className="t-caption mt-1.5" style={{ color: 'var(--text-secondary)' }}>
                Taking a seat needs Resonance+ or X. Dating core stays free.
              </p>
              <BtnPrimary to="/premium" className="mt-4 w-full">
                See plans
              </BtnPrimary>
            </GlassCard>
          </section>
        )}

        {!accessLoading && isAuthenticated && allowed && (
          <section className="mt-6 px-3" aria-label="Spades game">
            <GlassCard className="relative h-[400px] overflow-hidden p-0" ringX={30}>
              <div
                className="absolute inset-0"
                style={{
                  background:
                    'radial-gradient(120% 70% at 50% -6%, rgba(255,206,138,.20), transparent 72%), linear-gradient(#1A1210 0%, #120C0A 46%, #0B0706 100%)',
                }}
                aria-hidden="true"
              />
              <div
                className="absolute left-[8%] top-[21%] h-[54%] w-[84%] rounded-full p-[13px]"
                style={{ background: 'linear-gradient(160deg, #8A6034 0%, #5C3C20 38%, #3B2614 100%)' }}
                aria-hidden="true"
              >
                <div
                  className="h-full w-full rounded-full"
                  style={{ background: 'radial-gradient(70% 80% at 42% 26%, #2F8158 0%, #1E6141 46%, #123F2B 100%)' }}
                />
              </div>

              {[0, 1, 2, 3].map((p) => {
                const spot = SPOT[p];
                const active = (g.phase === 'bid' ? g.bidTurn : g.turn) === p && g.phase !== 'over';
                const played = g.trick.find((t) => t.p === p);
                const slot = SLOT[p];
                return (
                  <div key={p}>
                    <div
                      className={cn('absolute w-[104px] -translate-x-1/2 -translate-y-1/2 text-center', spot.scale)}
                      style={{ left: spot.left, top: spot.top }}
                    >
                      <div
                        className="relative mx-auto h-[46px] w-[60px] rounded-[12px]"
                        style={{
                          background: 'linear-gradient(165deg, #4A2E22, #2A1913)',
                          boxShadow: active ? '0 0 0 2px rgba(255,206,138,.75), 0 0 18px rgba(255,190,110,.45)' : undefined,
                        }}
                      >
                        <span className="absolute left-1/2 top-1/2 block h-11 w-11 -translate-x-1/2 -translate-y-[60%]">
                          {ISBOT[p] ? (
                            <>
                              <img
                                src={BOT_HEADS[p] ?? ''}
                                alt=""
                                className="h-full w-full rounded-full object-cover"
                                style={{ boxShadow: '0 0 0 2px rgba(255,255,255,.28), 0 2px 8px rgba(0,0,0,.45)' }}
                              />
                              <span
                                className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 rounded-full px-1.5 py-px text-[8px] font-extrabold tracking-[0.08em]"
                                style={{
                                  background: '#16161C',
                                  color: '#FFD88F',
                                  boxShadow: '0 0 0 1.5px rgba(255,206,138,.8)',
                                }}
                              >
                                BOT
                              </span>
                            </>
                          ) : (
                            <span
                              className="flex h-full w-full items-center justify-center rounded-full"
                              style={{
                                background: 'radial-gradient(120% 120% at 30% 20%, #7C93DE, #2C3970)',
                              }}
                            >
                              <span className="t-caption font-bold text-white">YOU</span>
                            </span>
                          )}
                        </span>
                      </div>
                      <div className="mt-2">
                        <b className="t-caption block text-white">
                          {ISBOT[p] ? `BOT · ${NAMES[p]}` : NAMES[p]}
                        </b>
                        <span className="t-micro block text-white/60">
                          {g.bids[p] !== null ? (g.bids[p] === 0 ? 'nil' : `bid ${g.bids[p]}`) : '—'} · {g.tricks[p]} won
                        </span>
                      </div>
                    </div>
                    {played && (
                      <div
                        className={cn('absolute h-[62px] w-[44px] -translate-x-1/2 -translate-y-1/2 rounded-[5px] shadow-2xl', slot.rotate)}
                        style={{ left: slot.left, top: slot.top }}
                      >
                        <CardFace card={played.c} mini />
                      </div>
                    )}
                  </div>
                );
              })}

              {g.phase === 'over' && g.gameOver && (
                <div className="absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 text-center">
                  <div
                    className="t-heading"
                    style={{ color: '#FFE9C2', textShadow: '0 3px 22px rgba(255,170,60,.65)' }}
                  >
                    {g.score.us > g.score.them ? 'You + BOT Maya win' : 'BOT Riley + BOT Sam win'}
                  </div>
                  <div className="t-caption mt-1 uppercase tracking-[0.14em] text-white/80">
                    {g.score.us} – {g.score.them}
                  </div>
                </div>
              )}
            </GlassCard>

            <div className="mt-4 flex gap-3">
              <GlassCard
                className={cn('flex-1 p-3', teamOf(g.turn) === 'us' && g.phase === 'play' && 'glass-edge')}
              >
                <p className="t-micro">YOU & BOT MAYA</p>
                <p className="t-title mt-1" style={{ color: 'var(--text)' }}>{g.score.us}</p>
                <p className="t-micro mt-1" style={{ color: 'var(--text-secondary)' }}>{teamInfo('us')}</p>
              </GlassCard>
              <GlassCard
                className={cn('flex-1 p-3', teamOf(g.turn) === 'them' && g.phase === 'play' && 'glass-edge')}
              >
                <p className="t-micro">BOT RILEY & BOT SAM</p>
                <p className="t-title mt-1" style={{ color: 'var(--text)' }}>{g.score.them}</p>
                <p className="t-micro mt-1" style={{ color: 'var(--text-secondary)' }}>{teamInfo('them')}</p>
              </GlassCard>
            </div>

            <p className="t-body mt-4 min-h-[44px] text-center" style={{ color: 'var(--text)' }} aria-live="polite">
              {g.msg}
            </p>

            {g.phase === 'bid' && g.bidTurn === 0 && (
              <div className="mt-1 flex flex-wrap justify-center gap-1.5" aria-label="Your bid">
                {Array.from({ length: 14 }, (_, i) => (
                  <button
                    key={i}
                    type="button"
                    className="t-caption min-h-[40px] min-w-[42px] rounded-[10px] px-3"
                    style={{ background: 'var(--field)', color: 'var(--text)' }}
                    onClick={() => {
                      g.bids[0] = i;
                      g.bidTurn = 1;
                      step();
                    }}
                  >
                    {i === 0 ? 'Nil' : i}
                  </button>
                ))}
              </div>
            )}

            <div className="mt-4 flex justify-center overflow-visible pt-3" aria-label="Your hand">
              {g.hands[0].map((card, i) => {
                const enabled = legalHand.includes(card);
                return (
                  <button
                    key={`${card.s}-${card.r}-${i}`}
                    type="button"
                    disabled={!enabled}
                    onClick={() => play(0, card)}
                    aria-label={`${rankOf(card)} of ${SUIT_NAME[card.s]}`}
                    className={cn(
                      'relative h-[66px] w-[47px] shrink-0 rounded-[6px] shadow-xl transition-transform duration-fast',
                      i > 0 && '-ml-[18px]',
                      enabled && 'hover:-translate-y-3 focus-visible:-translate-y-3',
                      !enabled && g.phase === 'play' && 'brightness-[0.7] saturate-[0.6]',
                    )}
                    style={{ zIndex: i }}
                  >
                    <CardFace card={card} />
                  </button>
                );
              })}
            </div>

            {g.phase === 'over' && (
              <div className="mt-5 flex justify-center">
                <BtnPrimary className="h-11 px-6" onClick={() => newTable(g.gameOver)}>
                  <RotateCcw size={16} aria-hidden="true" />
                  {g.gameOver ? 'New game' : 'Next hand'}
                </BtnPrimary>
              </div>
            )}
            {g.phase !== 'over' && (
              <div className="mt-5 flex justify-center">
                <BtnGlass className="h-11 px-5" onClick={() => newTable(true)} ariaLabel="Restart table">
                  <RotateCcw size={16} aria-hidden="true" />
                  Restart
                </BtnGlass>
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
