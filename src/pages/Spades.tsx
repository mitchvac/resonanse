import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { ArrowLeft, Clapperboard, RotateCcw, Send, Ticket } from 'lucide-react';
import AdWatchModal from '@/components/AdWatchModal';
import WinFireworks from '@/components/games/WinFireworks';
import VoiceDock from '@/components/games/voice/VoiceDock';
import GlassCard from '@/components/GlassCard';
import { BtnGlass, BtnPrimary } from '@/components/ui/buttons';
import { trpc } from '@/providers/trpc';
import { useAuth } from '@/hooks/useAuth';
import { LOGIN_PATH } from '@/const';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';

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

// ---- Table chat (local table: you + labelled bots) ----
type ChatMsg = { id: number; p: number; text: string };
const SEAT_KEYS = ['seats.you', 'seats.botRiley', 'seats.botMaya', 'seats.botSam'] as const;
const CANNED_KEYS = [
  'spades.chat.canned.goodJob',
  'spades.chat.canned.perfectHand',
  'spades.chat.canned.youreTheBest',
  'spades.chat.canned.goodLuck',
  'spades.chat.canned.wellPlayed',
  'spades.chat.canned.thanks',
  'spades.chat.canned.goodGame',
] as const;
const BOT_GREET_KEYS = ['spades.chat.greet1', 'spades.chat.greet2', 'spades.chat.greet3'] as const;
const BOT_PRAISE_KEYS = [
  'spades.chat.canned.goodJob',
  'spades.chat.canned.perfectHand',
  'spades.chat.canned.youreTheBest',
  'spades.chat.praiseNiceOne',
  'spades.chat.canned.wellPlayed',
] as const;
const BOT_REPLY_KEYS = [
  'spades.chat.replyThanks',
  'spades.chat.replyYouToo',
  'spades.chat.replyAppreciate',
  'spades.chat.replyRightBack',
  'spades.chat.replyThanksGl',
] as const;
const BOT_GG_KEYS = ['spades.chat.gg1', 'spades.chat.gg2', 'spades.chat.gg3'] as const;
const pick = <T,>(arr: readonly T[]) => arr[Math.floor(Math.random() * arr.length)];
const randomBot = () => 1 + Math.floor(Math.random() * 3);
const rankOf = (c: CardT) => FACE[c.r] ?? String(c.r);
const isRed = (c: CardT) => c.s === 1 || c.s === 2;
const teamOf = (p: number): Side => (p % 2 === 0 ? 'us' : 'them');

function freshGame(dealingMsg: string): Game {
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
    msg: dealingMsg,
    gameOver: false,
  };
}

// Suit colors: ♠(0) & ♣(3) black, ♥(1) & ♦(2) red.
const SUIT_RED = [false, true, true, false];
const CANON_SUITS = [1, 3, 2, 0]; // ♥ ♣ ♦ ♠ — canonical tie-break order

// Order the non-empty suit blocks so colors strictly alternate left→right
// (♥ ♣ ♦ ♠ at a full deal). As you play out a block mid-hand, the rest
// re-balance: leftover blacks slide in between the reds, and leftover reds
// slide in between the blacks, so two same-colored suits never sit side by
// side unless it can't be helped. Tie-breaks: red on the left, spades (trump)
// on the right.
function arrangeSuits(present: number[]): number[] {
  let best: number[] | null = null;
  let bestScore = Infinity;
  const permute = (arr: number[], l: number): void => {
    if (l >= arr.length - 1) {
      let adj = 0;
      for (let i = 1; i < arr.length; i++) if (SUIT_RED[arr[i]] === SUIT_RED[arr[i - 1]]) adj++;
      const score = adj * 100 + (SUIT_RED[arr[0]] ? 0 : 10) + (arr[arr.length - 1] === 0 ? 0 : 1);
      if (score < bestScore) {
        bestScore = score;
        best = arr.slice();
      }
      return;
    }
    for (let i = l; i < arr.length; i++) {
      [arr[l], arr[i]] = [arr[i], arr[l]];
      permute(arr, l + 1);
      [arr[l], arr[i]] = [arr[i], arr[l]];
    }
  };
  permute(present.slice(), 0);
  return best ?? present;
}

function sortHand(hand: CardT[]): CardT[] {
  const present = CANON_SUITS.filter((s) => hand.some((c) => c.s === s));
  const pos = new Map(arrangeSuits(present).map((s, i) => [s, i]));
  return hand.slice().sort((a, b) => (pos.get(a.s) ?? 0) - (pos.get(b.s) ?? 0) || b.r - a.r);
}

function dealInto(g: Game, biddingMsg: string) {
  const deck: CardT[] = [];
  for (let s = 0; s < 4; s++) for (let r = 2; r <= 14; r++) deck.push({ s, r });
  for (let i = deck.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  // Hand layout: suit colors strictly ALTERNATE left→right (♥ red · ♣ black ·
  // ♦ red · ♠ black) so hearts and diamonds never sit side by side — at card
  // size they're easy to confuse. Spades (trump) anchor the right end.
  g.hands = [0, 1, 2, 3].map((p) => sortHand(deck.slice(p * 13, p * 13 + 13)));
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
  g.msg = biddingMsg;
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
  if (!a.length) return null; // empty hand at hand-end — never throw
  return a.reduce((x, y) =>
    (x.s === 0) !== (y.s === 0) ? (x.s === 0 ? y : x) : x.r < y.r ? x : y,
  );
}

function botCard(g: Game, p: number) {
  const L = legal(g, p);
  if (!L.length) return null; // hand over — a scheduled bot tick must not crash
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
      <span className={cn('absolute left-1 top-1 font-bold leading-none', mini ? 'text-[12px]' : 'text-[15px]')}>
        {rankOf(card)}
      </span>
      <span className={cn('absolute left-1 leading-none', mini ? 'top-4 text-[9px]' : 'top-[21px] text-[12px]')}>
        {SUIT[card.s]}
      </span>
      <span className={cn('absolute bottom-0.5 right-1 leading-none opacity-55', mini ? 'text-[17px]' : 'text-[25px]')}>
        {SUIT[card.s]}
      </span>
    </span>
  );
}

export default function Spades() {
  const { t } = useTranslation('games');
  const navigate = useNavigate();
  const seatName = (p: number) => t(SEAT_KEYS[p] ?? 'seats.you');
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [, bump] = useReducer((x: number) => x + 1, 0);

  const entitlementsQuery = trpc.premium.entitlements.useQuery(undefined, {
    enabled: isAuthenticated,
  });
  const entitlement = entitlementsQuery.data?.entitlement ?? null;
  const trial = entitlementsQuery.data?.trial ?? null;
  // Entitled members (trial / Resonance+ / X) play without ads.
  const entitled =
    isAuthenticated && (trial?.active || (entitlement?.tier ?? 'free') !== 'free');

  // Free members play on game passes earned by watching ads (V78).
  const passesQuery = trpc.ads.passes.useQuery(undefined, {
    enabled: isAuthenticated && !entitled,
  });
  const passes = passesQuery.data?.passes ?? 0;
  const maxBanked = passesQuery.data?.maxBanked ?? 5;
  // matchUnlocked keeps an in-progress match playable after its pass is spent
  // (passes drop to 0 at first bid, but the match runs to completion).
  const [matchUnlocked, setMatchUnlocked] = useState(false);
  const canPlay = entitled || passes > 0 || matchUnlocked;

  const accessLoading =
    authLoading ||
    (isAuthenticated && entitlementsQuery.isLoading) ||
    (isAuthenticated && !entitled && passesQuery.isLoading);

  const [adOpen, setAdOpen] = useState(false);
  // A pass is consumed once per match (first bid). "Next hand" stays free;
  // "New game" / "Restart" starts a new match and needs a fresh pass.
  const passConsumed = useRef(false);
  const consumeMut = trpc.ads.consumePass.useMutation();

  const game = useRef<Game>(freshGame(t('spades.msg.dealing')));
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

  // ---- Table chat state ----
  const [chat, setChat] = useState<ChatMsg[]>([]);
  const [draft, setDraft] = useState('');
  const chatId = useRef(0);
  const chatListRef = useRef<HTMLDivElement | null>(null);

  const say = useCallback((p: number, text: string) => {
    setChat((c) => [...c.slice(-29), { id: ++chatId.current, p, text }]);
  }, []);

  const botSayLater = useCallback(
    (p: number, text: string, ms: number) => later(() => say(p, text), ms),
    [later, say],
  );

  const sendChat = useCallback(
    (text: string) => {
      const trimmed = text.trim().slice(0, 120);
      if (!trimmed) return;
      say(0, trimmed);
      setDraft('');
      // Local table: a random labelled bot replies. Stage 2 backend will carry
      // real player-to-player messages.
      botSayLater(randomBot(), t(pick(BOT_REPLY_KEYS)), 900 + Math.random() * 900);
    },
    [say, botSayLater],
  );

  useEffect(() => {
    const el = chatListRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chat]);

  const endHand = useCallback(() => {
    const g = game.current;
    for (const side of ['us', 'them'] as const) {
      const ps = side === 'us' ? [0, 2] : [1, 3];
      const nils = ps.filter((p) => g.bids[p] === 0);
      const contract = ps
        .filter((p) => (g.bids[p] ?? 0) > 0)
        .reduce((sum, p) => sum + (g.bids[p] ?? 0), 0); // initial 0: double-nil side must not throw
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
    if (g.bids[0] === 0 && g.tricks[0] === 0) botSayLater(2, t('spades.chat.nilMade'), 900);
    if (g.gameOver) botSayLater(randomBot(), t(pick(BOT_GG_KEYS)), 1700);
    g.msg = g.gameOver
      ? g.score.us > g.score.them
        ? t('spades.msg.youTakeGame')
        : t('spades.msg.botsTakeGame')
      : t('spades.msg.handOver');
    renderNow();
  }, [renderNow, botSayLater]);

  const step = useCallback(() => {
    const g = game.current;
    if (g.phase === 'bid') {
      if (g.bids.every((b) => b !== null)) {
        g.phase = 'play';
        g.turn = g.leader;
        g.msg = g.turn === 0 ? t('spades.msg.yourLead') : t('spades.msg.leads', { name: NAMES[g.turn] });
        renderNow();
        later(step, 0);
        return;
      }
      if (g.bidTurn !== 0) {
        g.bids[g.bidTurn] = botBid(g.hands[g.bidTurn]);
        g.bidTurn = (g.bidTurn + 1) % 4;
        g.msg = t('spades.msg.bidding');
        renderNow();
        later(step, 430);
        return;
      }
      g.msg = t('spades.msg.yourBid');
      renderNow();
      return;
    }
    if (g.phase === 'play' && g.turn !== 0) {
      const p = g.turn;
      later(() => {
        const c = botCard(g, p);
        if (c) play(p, c); // null = hand already over; skip silently
      }, 560);
    }
    renderNow();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [later, renderNow]);

  const play = useCallback(
    (p: number, c: CardT) => {
      const g = game.current;
      if (g.phase !== 'play') return;
      // Stale/duplicate bot timers must be no-ops: a fast human click can leave
      // a second step() timer pending, which would otherwise let a bot play
      // twice in one trick and corrupt the whole hand (this was the root cause
      // of the end-of-game hang — no win banner, no fireworks).
      if (p !== g.turn) return;
      if (g.trick.length === 4) return; // trick is resolving — never push a 5th card
      g.hands[p] = g.hands[p].filter((x) => x !== c);
      if (c.s === 0) g.broken = true;
      g.trick.push({ p, c });
      renderNow();

      if (g.trick.length === 4) {
        const w = winnerOf(g.trick);
        g.msg = w === 0 ? t('spades.msg.youTakeIt') : t('spades.msg.takesIt', { name: NAMES[w] });
        renderNow();
        later(() => {
          g.tricks[w]++;
          if (w === 0 && Math.random() < 0.35) botSayLater(2, t(pick(BOT_PRAISE_KEYS)), 500);
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
    [endHand, later, renderNow, step, botSayLater],
  );

  const newTable = useCallback((resetScores: boolean) => {
    clearTimers();
    const g = game.current;
    if (resetScores) {
      g.score = { us: 0, them: 0 };
      g.bags = { us: 0, them: 0 };
      passConsumed.current = false; // new match → first bid consumes a fresh pass
      setMatchUnlocked(false);
    }
    dealInto(g, t('spades.msg.bidding'));
    if (resetScores) botSayLater(randomBot(), t(pick(BOT_GREET_KEYS)), 1000);
    renderNow();
    later(step, 0);
  }, [clearTimers, later, renderNow, step, botSayLater]);

  // First bid of a match spends one game pass for free members.
  const placeBid = useCallback(
    (i: number) => {
      const g = game.current;
      const commit = () => {
        g.bids[0] = i;
        g.bidTurn = 1;
        step();
      };
      if (entitled || passConsumed.current) {
        commit();
        return;
      }
      consumeMut.mutate(undefined, {
        onSuccess: () => {
          passConsumed.current = true;
          setMatchUnlocked(true);
          void passesQuery.refetch();
          commit();
        },
        onError: () => {
          // Passes ran out elsewhere — refetch drops the table back to the gate.
          void passesQuery.refetch();
        },
      });
    },
    [entitled, consumeMut, passesQuery, step],
  );

  useEffect(() => {
    newTable(true);
    return () => clearTimers();
  }, [newTable, clearTimers]);

  const g = game.current;
  const legalHand = g.phase === 'play' && g.turn === 0 ? legal(g, 0) : [];
  const teamInfo = (side: Side) => {
    const ps = side === 'us' ? [0, 2] : [1, 3];
    const bid = ps.every((p) => g.bids[p] !== null)
      ? ps.map((p) => (g.bids[p] === 0 ? t('spades.nil') : g.bids[p])).join('+')
      : '—';
    return t('spades.teamInfo', {
      bid,
      tricks: ps.reduce((sum, p) => sum + g.tricks[p], 0),
      bags: g.bags[side],
    });
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
              aria-label={t('shared.backToCommunity')}
              onClick={() => navigate('/community')}
              className="glass-content flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full"
              style={{ color: 'var(--text)' }}
            >
              <ArrowLeft size={20} aria-hidden="true" />
            </button>
            <span
              className="t-value flex-1 text-center font-bold"
              style={{ color: 'var(--text)', position: 'relative', zIndex: 1 }}
            >
              {t('spades.title')}
            </span>
            {/* V88 — LiveKit voice. Bot table → disabled state; a human table
                passes its matchId and the mic pill goes live (consent = tap). */}
            <VoiceDock matchId={null} game="spades" />
          </div>
        </div>

        <header className="mt-6 px-5">
          <p className="t-eyebrow">{t('shared.localTable')}</p>
          <h1 className="t-heading mt-2" style={{ color: 'var(--text-ink)' }}>
            {t('spades.header')}
          </h1>
          <p className="t-body mt-2" style={{ color: 'var(--text-secondary)' }}>
            {t('spades.intro')}
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
              <h2 className="t-title-sm">{t('shared.signInToSeat')}</h2>
              <BtnPrimary to={LOGIN_PATH} className="mt-4 w-full">
                {t('shared.signIn')}
              </BtnPrimary>
            </GlassCard>
          </section>
        )}

        {!accessLoading && isAuthenticated && !canPlay && (
          <section className="mt-6 px-5">
            <GlassCard edge="amber" className="p-5">
              <p className="t-eyebrow">{t('spades.outOfGames')}</p>
              <h2 className="t-title-sm mt-1">{t('spades.watchAdSeat')}</h2>
              <p className="t-caption mt-1.5" style={{ color: 'var(--text-secondary)' }}>
                {t('spades.watchAdBody')}
              </p>
              <BtnPrimary className="mt-4 w-full" onClick={() => setAdOpen(true)}>
                <Clapperboard size={16} aria-hidden="true" />
                {t('spades.watchAdGetGame')}
              </BtnPrimary>
              <BtnGlass to="/premium" className="mt-2.5 w-full">
                {t('spades.goAdFree')}
              </BtnGlass>
            </GlassCard>
          </section>
        )}

        {!accessLoading && isAuthenticated && canPlay && (
          <section className="mt-6 px-3" aria-label={t('spades.gameAria')}>
            {!entitled && (
              <div
                className="mb-3 flex items-center justify-between gap-3 rounded-[16px] px-4 py-3"
                style={{ background: 'var(--field)', boxShadow: 'inset 0 0 0 1px var(--border)' }}
              >
                <p className="t-caption flex items-center gap-2" style={{ color: 'var(--text-secondary)' }}>
                  <Ticket size={15} style={{ color: '#FFD88F' }} aria-hidden="true" />
                  {t('spades.passesLeft', { count: passes })} · {t('spades.oneAdOneGame')}
                </p>
                {passes < maxBanked && (
                  <button
                    type="button"
                    onClick={() => setAdOpen(true)}
                    className="t-caption min-h-[36px] shrink-0 rounded-full px-3 font-semibold"
                    style={{ background: 'rgba(255,206,138,.14)', color: '#FFD88F' }}
                  >
                    {t('spades.watchAd')}
                  </button>
                )}
              </div>
            )}
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
                              <span className="t-caption font-bold text-white">{t('shared.youBadge')}</span>
                            </span>
                          )}
                        </span>
                      </div>
                      <div className="mt-2">
                        <b className="t-caption block text-white">
                          {seatName(p)}
                        </b>
                        <span className="t-micro block text-white/60">
                          {g.bids[p] !== null ? (g.bids[p] === 0 ? t('spades.nil') : t('spades.bidN', { n: g.bids[p] })) : '—'} · {t('spades.wonCount', { count: g.tricks[p] })}
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
                    {g.score.us > g.score.them ? t('spades.youWinBanner') : t('spades.botsWinBanner')}
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
                <p className="t-micro">{t('spades.youAndBotMaya')}</p>
                <p className="t-title mt-1" style={{ color: 'var(--text)' }}>{g.score.us}</p>
                <p className="t-micro mt-1" style={{ color: 'var(--text-secondary)' }}>{teamInfo('us')}</p>
              </GlassCard>
              <GlassCard
                className={cn('flex-1 p-3', teamOf(g.turn) === 'them' && g.phase === 'play' && 'glass-edge')}
              >
                <p className="t-micro">{t('spades.botRileyAndBotSam')}</p>
                <p className="t-title mt-1" style={{ color: 'var(--text)' }}>{g.score.them}</p>
                <p className="t-micro mt-1" style={{ color: 'var(--text-secondary)' }}>{teamInfo('them')}</p>
              </GlassCard>
            </div>

            {/* status + bidding + hand sit directly under the scoreboard, so
                the felt, the bid buttons and the cards are all on screen
                together — no scrolling up and down mid-hand */}
            <p className="t-body mt-4 min-h-[44px] text-center" style={{ color: 'var(--text)' }} aria-live="polite">
              {g.msg}
            </p>

            {g.phase === 'bid' && g.bidTurn === 0 && (
              <div className="mt-1 flex flex-wrap justify-center gap-1.5" aria-label={t('spades.yourBidAria')}>
                {Array.from({ length: 14 }, (_, i) => (
                  <button
                    key={i}
                    type="button"
                    className="t-caption min-h-[40px] min-w-[42px] rounded-[10px] px-3"
                    style={{ background: 'var(--field)', color: 'var(--text)' }}
                    onClick={() => placeBid(i)}
                    disabled={consumeMut.isPending}
                  >
                    {i === 0 ? t('spades.nilBid') : i}
                  </button>
                ))}
              </div>
            )}

            <div className="mt-4 flex justify-center overflow-visible pt-3" aria-label={t('spades.yourHandAria')}>
              {/* re-sorted every render: as blocks empty out mid-hand, the
                  remaining suits re-balance so colors keep alternating */}
              {sortHand(g.hands[0]).map((card, i) => {
                const enabled = legalHand.includes(card);
                return (
                  <button
                    key={`${card.s}-${card.r}-${i}`}
                    type="button"
                    disabled={!enabled}
                    onClick={() => play(0, card)}
                    aria-label={t('spades.cardAria', { rank: rankOf(card), suit: t(`spades.suit.${SUIT_NAME[card.s]}`) })}
                    className={cn(
                      // Fixed size (no sm: bump): the app renders in a ~400px phone shell even on
                      // desktop viewports, and sm: breakpoints key off viewport width — responsive
                      // sizes overflowed the shell. 56px cards with a 26px step fit all 13 in ~368px.
                      'relative h-[80px] w-[56px] shrink-0 rounded-[7px] shadow-xl transition-transform duration-fast',
                      i > 0 && '-ml-[30px]',
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

            <GlassCard className="mt-4 p-4">
              <div className="flex items-baseline justify-between gap-2">
                <p className="t-micro">{t('spades.chat.title')}</p>
                <p className="t-micro text-right" style={{ color: 'var(--text-secondary)' }}>
                  {t('spades.chat.note')}
                </p>
              </div>
              <div
                ref={chatListRef}
                className="mt-3 flex max-h-44 flex-col gap-2.5 overflow-y-auto pr-1"
                aria-live="polite"
              >
                {chat.length === 0 && (
                  <p className="t-caption" style={{ color: 'var(--text-secondary)' }}>
                    {t('spades.chat.empty')}
                  </p>
                )}
                {chat.map((m) => (
                  <div key={m.id} className="flex items-start gap-2">
                    {m.p === 0 ? (
                      <span
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[9px] font-bold text-white"
                        style={{ background: 'radial-gradient(120% 120% at 30% 20%, #7C93DE, #2C3970)' }}
                      >
                        {t('shared.youBadge')}
                      </span>
                    ) : (
                      <span className="relative h-7 w-7 shrink-0">
                        <img src={BOT_HEADS[m.p] ?? ''} alt="" className="h-full w-full rounded-full object-cover" />
                        <span
                          className="absolute -bottom-1 left-1/2 -translate-x-1/2 rounded-full px-1 text-[6px] font-extrabold tracking-wide"
                          style={{ background: '#16161C', color: '#FFD88F', boxShadow: '0 0 0 1px rgba(255,206,138,.8)' }}
                        >
                          BOT
                        </span>
                      </span>
                    )}
                    <div className="min-w-0">
                      <p className="t-micro" style={{ color: m.p === 0 ? 'var(--text-secondary)' : '#B07A2A' }}>
                        {seatName(m.p)}
                      </p>
                      <p
                        className="t-caption mt-0.5 inline-block whitespace-pre-wrap break-words rounded-[10px] px-2.5 py-1.5"
                        style={{ background: 'var(--field)', color: 'var(--text)' }}
                      >
                        {m.text}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5" aria-label={t('spades.chat.quickAria')}>
                {CANNED_KEYS.map((k) => (
                  <button
                    key={k}
                    type="button"
                    className="t-caption min-h-[36px] rounded-full px-3"
                    style={{ background: 'var(--field)', color: 'var(--text)' }}
                    onClick={() => sendChat(t(k))}
                  >
                    {t(k)}
                  </button>
                ))}
              </div>
              <form
                className="mt-2.5 flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  sendChat(draft);
                }}
              >
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  maxLength={120}
                  placeholder={t('spades.chat.placeholder')}
                  aria-label={t('spades.chat.inputAria')}
                  className="t-caption h-11 min-w-0 flex-1 rounded-[12px] px-3 outline-none"
                  style={{ background: 'var(--field)', color: 'var(--text)' }}
                />
                <BtnPrimary type="submit" className="h-11 min-h-[44px] min-w-[44px] px-3.5" ariaLabel={t('spades.chat.sendAria')}>
                  <Send size={16} aria-hidden="true" />
                </BtnPrimary>
              </form>
            </GlassCard>

            {g.phase === 'over' && (
              <div className="mt-5 flex justify-center">
                <BtnPrimary className="h-11 px-6" onClick={() => newTable(g.gameOver)}>
                  <RotateCcw size={16} aria-hidden="true" />
                  {g.gameOver ? t('shared.newGame') : t('spades.nextHand')}
                </BtnPrimary>
              </div>
            )}
            {g.phase !== 'over' && (
              <div className="mt-5 flex justify-center">
                <BtnGlass className="h-11 px-5" onClick={() => newTable(true)} ariaLabel={t('spades.restartAria')}>
                  <RotateCcw size={16} aria-hidden="true" />
                  {t('spades.restart')}
                </BtnGlass>
              </div>
            )}
          </section>
        )}

        {isAuthenticated && (
          <AdWatchModal
            open={adOpen}
            onClose={() => setAdOpen(false)}
            onGranted={() => void passesQuery.refetch()}
          />
        )}

        {/* V83 — full-table fireworks when the human couple takes the match */}
        <WinFireworks fire={g.phase === 'over' && g.gameOver && g.score.us > g.score.them} />
      </div>
    </div>
  );
}
