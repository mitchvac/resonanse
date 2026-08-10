import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { ArrowLeft, BadgeCheck, Bot, RotateCcw } from 'lucide-react';
import GlassCard from '@/components/GlassCard';
import { BtnGlass, BtnPrimary } from '@/components/ui/buttons';
import { trpc } from '@/providers/trpc';
import { useAuth } from '@/hooks/useAuth';
import { LOGIN_PATH } from '@/const';
import { cn } from '@/lib/utils';
import OwnAvatar from '@/components/games/OwnAvatar';
import {
  apply,
  bestMove,
  colorOf,
  fresh,
  isW,
  kingSq,
  legal,
  status,
} from '@/lib/chess/engine';
import type { GameState, Move, PieceType, PromoPiece } from '@/lib/chess/engine';

/* ------------------------------------------------------------------ */
/* Piece art — ported exactly from chess.html                          */
/* ------------------------------------------------------------------ */

const CLASSIC: Record<PieceType, string> = {
  K: '♔',
  Q: '♕',
  R: '♖',
  B: '♗',
  N: '♘',
  P: '♙',
};

const PIECE: Record<PieceType, string> = {
  /* PAWN — smallest, squat, no arms, round head */
  P:
    '<svg viewBox="0 0 40 47">' +
    '<rect class="bd" x="12" y="38.6" width="16" height="6.2" rx="3"/>' +
    '<path class="bd" d="M14.6 38.6 L16.2 30 H23.8 L25.4 38.6 Z"/>' +
    '<rect class="bd" x="14.4" y="20.8" width="11.2" height="10.4" rx="5.2"/>' +
    '<circle class="bd" cx="20" cy="18.6" r="1.7"/>' +
    '<rect class="lens" x="16.5" y="24.2" width="7" height="3" rx="1.5"/>' +
    '</svg>',
  /* ROOK — widest, blocky tower, crenellated, no neck */
  R:
    '<svg viewBox="0 0 40 47">' +
    '<rect class="bd" x="6.6" y="38.6" width="26.8" height="6.2" rx="3"/>' +
    '<rect class="bd" x="9.6" y="16.8" width="20.8" height="22" rx="2"/>' +
    '<rect class="bd" x="9.6" y="10.6" width="5.4" height="6.6" rx="1"/>' +
    '<rect class="bd" x="17.3" y="10.6" width="5.4" height="6.6" rx="1"/>' +
    '<rect class="bd" x="25" y="10.6" width="5.4" height="6.6" rx="1"/>' +
    '<rect class="lens" x="12.6" y="21.4" width="14.8" height="4.2" rx="1.5"/>' +
    '<circle class="trim" cx="14" cy="32.6" r="1.5"/>' +
    '<circle class="trim" cx="20" cy="32.6" r="1.5"/>' +
    '<circle class="trim" cx="26" cy="32.6" r="1.5"/>' +
    '</svg>',
  /* BISHOP — narrowest, tall triangular mitre, single slit */
  B:
    '<svg viewBox="0 0 40 47">' +
    '<rect class="bd" x="13" y="38.6" width="14" height="6.2" rx="3"/>' +
    '<path class="bd" d="M15.6 38.6 L16.8 28.4 H23.2 L24.4 38.6 Z"/>' +
    '<path class="bd" d="M16 28.4 L20 10.4 L24 28.4 Z"/>' +
    '<circle class="bd" cx="20" cy="8.2" r="2.1"/>' +
    '<rect class="lens" x="19.1" y="18.4" width="1.8" height="7.4" rx=".9"/>' +
    '</svg>',
  /* KNIGHT — side profile, snout forward, ear fin */
  N:
    '<svg viewBox="0 0 40 47">' +
    '<rect class="bd" x="10" y="38.6" width="20" height="6.2" rx="3"/>' +
    '<path class="bd" d="M13.2 38.6 L14.6 27.4 H25.4 L26.8 38.6 Z"/>' +
    '<path class="bd" d="M15 12.6 L16.6 6.4 L19.2 12.8 Z"/>' +
    '<path class="bd" d="M12.8 26.6 V16.4 L20.6 12.4 L25 14.8 V18.6 L32 21.4 V25.4 L25 26.8 Z"/>' +
    '<circle class="lens" cx="18.2" cy="19.6" r="2.2"/>' +
    '<rect class="trim" x="27.2" y="22.2" width="4" height="1.9" rx=".95"/>' +
    '</svg>',
  /* QUEEN — slim, tall, five-orb crown spanning the width */
  Q:
    '<svg viewBox="0 0 40 47">' +
    '<rect class="bd" x="11" y="38.6" width="18" height="6.2" rx="3"/>' +
    '<rect class="bd" x="11.4" y="28.4" width="3" height="8.4" rx="1.5"/>' +
    '<rect class="bd" x="25.6" y="28.4" width="3" height="8.4" rx="1.5"/>' +
    '<path class="bd" d="M14 38.6 L15.6 26.8 H24.4 L26 38.6 Z"/>' +
    '<rect class="bd" x="15" y="15.6" width="10" height="11.4" rx="4.6"/>' +
    '<rect class="trim" x="12.9" y="11.8" width="14.2" height="3.4" rx="1.1"/>' +
    '<circle class="bd" cx="13.6" cy="9" r="1.8"/>' +
    '<circle class="bd" cx="16.8" cy="7.4" r="1.8"/>' +
    '<circle class="bd" cx="20" cy="6.6" r="2"/>' +
    '<circle class="bd" cx="23.2" cy="7.4" r="1.8"/>' +
    '<circle class="bd" cx="26.4" cy="9" r="1.8"/>' +
    '<circle class="lens" cx="17.7" cy="20.6" r="1.7"/>' +
    '<circle class="lens" cx="22.3" cy="20.6" r="1.7"/>' +
    '</svg>',
  /* KING — tallest and broadest, shoulder pads, cross finial */
  K:
    '<svg viewBox="0 0 40 47">' +
    '<rect class="bd" x="8.6" y="38.6" width="22.8" height="6.2" rx="3"/>' +
    '<circle class="bd" cx="11.8" cy="27.6" r="3.4"/>' +
    '<circle class="bd" cx="28.2" cy="27.6" r="3.4"/>' +
    '<rect class="bd" x="11.4" y="24.6" width="17.2" height="14.2" rx="3"/>' +
    '<rect class="trim" x="15.6" y="28.4" width="8.8" height="6.6" rx="1.4"/>' +
    '<rect class="bd" x="13.2" y="12.4" width="13.6" height="11.8" rx="3.6"/>' +
    '<rect class="trim" x="12.6" y="8.2" width="14.8" height="4.2" rx="1.2"/>' +
    '<rect class="ln" x="19.2" y="1.2" width="1.7" height="7.4" rx=".85"/>' +
    '<rect class="ln" x="16.6" y="3.6" width="6.9" height="1.7" rx=".85"/>' +
    '<circle class="lens" cx="16.9" cy="17.2" r="1.9"/>' +
    '<circle class="lens" cx="23.1" cy="17.2" r="1.9"/>' +
    '</svg>',
};

const PROMO_ORDER: PromoPiece[] = ['Q', 'R', 'B', 'N'];
const HUES = [42, 18, 340, 275, 190, 130];

/* Board-scene CSS — the game's own art, scoped under .chess-* (from chess.html). */
const SCENE_CSS = `
.chess-scene { position: relative; padding: 26px 0 22px; border-radius: 18px; overflow: hidden;
  background:
    radial-gradient(120% 70% at 50% -8%, rgba(255,206,138,.24), rgba(255,180,90,.06) 42%, transparent 72%),
    linear-gradient(#1A1210 0%, #120C0A 46%, #0B0706 100%); }
.chess-wall { position: absolute; inset: 0 0 52% 0;
  background: repeating-linear-gradient(90deg, rgba(255,255,255,.022) 0 1px, transparent 1px 74px); }
.chess-floor { position: absolute; inset: 56% 0 0 0;
  background: radial-gradient(90% 70% at 50% 0%, rgba(255,190,120,.10), transparent 70%),
    repeating-linear-gradient(74deg, rgba(120,40,40,.13) 0 22px, rgba(60,20,24,.13) 22px 44px), #0C0807; }
.chess-tabletop { position: relative; z-index: 2; width: min(100%, 356px); margin: 0 auto; padding: 13px; border-radius: 12px;
  background: linear-gradient(160deg, #8A6034 0%, #5C3C20 40%, #3B2614 100%);
  box-shadow: 0 20px 44px rgba(0,0,0,.6); }
.chess-board { display: grid; grid-template-columns: repeat(8, 1fr); border-radius: 4px; overflow: hidden; }
.chess-sq { position: relative; aspect-ratio: 1; display: flex; align-items: center; justify-content: center;
  cursor: default; user-select: none; border: 0; padding: 0; margin: 0; border-radius: 0; font: inherit; }
.chess-sq.l { background: #E4D2AF; } .chess-sq.d { background: #8A6144; }
.chess-sq.pick { box-shadow: inset 0 0 0 3px #FFD79A; }
.chess-sq.last { background-image: linear-gradient(rgba(255,214,150,.30), rgba(255,214,150,.30)); }
.chess-sq.chk { background-image: linear-gradient(rgba(220,60,50,.45), rgba(220,60,50,.45)); }
.chess-sq.can { cursor: pointer; }
.chess-dot { position: absolute; width: 26%; height: 26%; border-radius: 50%; background: rgba(20,14,10,.34); pointer-events: none; }
.chess-ring { position: absolute; inset: 6%; border-radius: 50%; border: 3px solid rgba(20,14,10,.34); pointer-events: none; }
.chess-pieceh { width: 88%; height: 88%; display: flex; align-items: center; justify-content: center; pointer-events: none; }
.chess-pieceh svg { width: 100%; height: 100%; overflow: visible;
  filter: drop-shadow(0 2px 2.5px rgba(0,0,0,.5)); }
.chess-pieceh .bd { fill: var(--body); stroke: var(--line); stroke-width: 1.1; stroke-linejoin: round; }
.chess-pieceh .ln { fill: var(--line); }
.chess-pieceh .trim { fill: var(--trim); stroke: var(--line); stroke-width: .9; }
.chess-pieceh .lens { fill: var(--lens); stroke: var(--line); stroke-width: .8; }
.chess-w { --body: #F5EEE0; --line: #4C3925; --trim: #D8C6A4; --lens: #2C5C87; }
.chess-b { --body: #2C2722; --line: #0B0908; --trim: #4E463B; --lens: #6FAFD6; }
.chess-pieceh .uni { font-size: 34px; line-height: 1; }
.chess-w .uni { color: #FCF8EF; text-shadow: 0 0 1px #3A2A1E, 0 1px 0 #6B5240, 0 2px 3px rgba(0,0,0,.45); }
.chess-b .uni { color: #16120F; text-shadow: 0 1px 0 rgba(255,255,255,.18); }
.chess-promo { min-width: 48px; min-height: 48px; padding: 4px 8px; border: none; border-radius: 8px; cursor: pointer;
  background: #8A6034; color: #FFF6E6; box-shadow: inset 0 1px 0 rgba(255,214,160,.14); }
.chess-promo:hover { background: #9A6E3C; }
.chess-promo .chess-pieceh { width: 30px; height: 34px; }
.chess-fw { position: absolute; inset: 0; pointer-events: none; z-index: 5; opacity: 0; transition: opacity 320ms ease; }
.chess-fw.on { opacity: 1; }
.chess-banner { position: absolute; left: 50%; top: 50%; transform: translate(-50%,-50%) scale(.92); z-index: 6;
  pointer-events: none; opacity: 0; text-align: center;
  transition: opacity 420ms ease, transform 420ms cubic-bezier(.2,.9,.3,1.2); }
.chess-banner.on { opacity: 1; transform: translate(-50%,-50%) scale(1); }
.chess-banner .big { font-size: 27px; font-weight: 700; color: #FFE9C2; text-shadow: 0 3px 22px rgba(255,170,60,.65); }
.chess-banner .small { font-size: 12px; margin-top: 5px; opacity: .8; letter-spacing: .08em; text-transform: uppercase; color: #F3EDE4; }
`;

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

interface Rocket {
  x: number;
  y: number;
  vy: number;
  target: number;
  hue: number;
}
interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  decay: number;
  hue: number;
}

export default function Chess() {
  const navigate = useNavigate();
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

  /* ---------------- game state (engine GameState lives in React state) ---------------- */
  const [S, setS] = useState<GameState>(fresh);
  const [sel, setSel] = useState<number | null>(null);
  const [targets, setTargets] = useState<Move[]>([]);
  const [last, setLast] = useState<Move | null>(null);
  const [over, setOver] = useState(false);
  const [pending, setPending] = useState<{ from: number; to: number } | null>(null);
  const [robots, setRobots] = useState(true);
  const [msg, setMsg] = useState('Your move.');
  const [fwOn, setFwOn] = useState(false);
  const [banner, setBanner] = useState<{ title: string; sub: string } | null>(null);

  const sceneRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const timers = useRef<number[]>([]);

  const clearTimers = useCallback(() => {
    timers.current.forEach((id) => window.clearTimeout(id));
    timers.current = [];
  }, []);

  const later = useCallback((fn: () => void, ms: number) => {
    const id = window.setTimeout(fn, ms);
    timers.current.push(id);
  }, []);

  useEffect(() => {
    return () => {
      timers.current.forEach((id) => window.clearTimeout(id));
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  /* ---------------- fireworks (ported from chess.html) ---------------- */
  const startFireworks = useCallback(
    (title: string, sub: string) => {
      const scene = sceneRef.current;
      const cv = canvasRef.current;
      if (!scene || !cv) return;
      const ctx = cv.getContext('2d');
      if (!ctx) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const W = scene.clientWidth;
      const H = scene.clientHeight;
      cv.width = W * dpr;
      cv.height = H * dpr;
      cv.style.width = `${W}px`;
      cv.style.height = `${H}px`;
      ctx.scale(dpr, dpr);
      setFwOn(true);
      later(() => setBanner({ title, sub }), 260);
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

      let rockets: Rocket[] = [];
      let sparks: Spark[] = [];
      let t = 0;
      const launch = () =>
        rockets.push({
          x: W * (0.18 + Math.random() * 0.64),
          y: H,
          vy: -(H / 62) * (0.85 + Math.random() * 0.4),
          target: H * (0.16 + Math.random() * 0.3),
          hue: HUES[(Math.random() * HUES.length) | 0] as number,
        });
      const burst = (r: Rocket) => {
        const n = 46 + ((Math.random() * 22) | 0);
        for (let i = 0; i < n; i++) {
          const a = (Math.PI * 2 * i) / n + Math.random() * 0.12;
          const sp = 1.1 + Math.random() * 2.9;
          sparks.push({
            x: r.x,
            y: r.y,
            vx: Math.cos(a) * sp,
            vy: Math.sin(a) * sp,
            life: 1,
            decay: 0.009 + Math.random() * 0.012,
            hue: r.hue + (Math.random() * 26 - 13),
          });
        }
      };
      const frame = () => {
        t++;
        ctx.globalCompositeOperation = 'destination-out';
        ctx.fillStyle = 'rgba(0,0,0,.20)';
        ctx.fillRect(0, 0, W, H);
        ctx.globalCompositeOperation = 'lighter';
        if (t % 26 === 0 && t < 300) launch();
        rockets = rockets.filter((r) => {
          r.y += r.vy;
          r.vy += 0.035;
          ctx.fillStyle = `hsl(${r.hue},95%,72%)`;
          ctx.fillRect(r.x - 1, r.y - 4, 2.2, 8);
          if (r.y <= r.target || r.vy >= 0) {
            burst(r);
            return false;
          }
          return true;
        });
        sparks = sparks.filter((s2) => {
          s2.x += s2.vx;
          s2.y += s2.vy;
          s2.vy += 0.035;
          s2.vx *= 0.988;
          s2.vy *= 0.988;
          s2.life -= s2.decay;
          if (s2.life <= 0) return false;
          ctx.beginPath();
          ctx.fillStyle = `hsla(${s2.hue},95%,${52 + s2.life * 28}%,${s2.life})`;
          ctx.arc(s2.x, s2.y, 1.9 * s2.life + 0.5, 0, 6.284);
          ctx.fill();
          return true;
        });
        if (t < 430 || sparks.length) {
          rafRef.current = requestAnimationFrame(frame);
        } else {
          ctx.clearRect(0, 0, W, H);
          if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
          rafRef.current = null;
        }
      };
      launch();
      frame();
    },
    [later],
  );

  const clearCelebration = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    const cv = canvasRef.current;
    const ctx = cv?.getContext('2d');
    if (cv && ctx) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, cv.width, cv.height);
    }
    setFwOn(false);
    setBanner(null);
  }, []);

  /* ---------------- game flow ---------------- */
  const evaluateStatus = (st: GameState): boolean => {
    const s = status(st);
    const endGame = (title: string, sub: string) => {
      setOver(true);
      setMsg(`${title} — ${sub}.`);
      if (title === 'You win') startFireworks(title, sub);
    };
    if (s === 'white-mate') {
      endGame('You win', 'checkmate');
      return true;
    }
    if (s === 'black-mate') {
      endGame('BOT · Riley wins', 'checkmate');
      return true;
    }
    if (s === 'stalemate') {
      endGame('Draw', 'stalemate');
      return true;
    }
    if (s === 'draw50') {
      endGame('Draw', 'fifty-move rule');
      return true;
    }
    setMsg(
      s === 'check'
        ? st.t === 'w'
          ? 'You are in check.'
          : 'Riley is in check.'
        : st.t === 'w'
          ? 'Your move.'
          : 'Riley is thinking…',
    );
    return false;
  };

  const botTurn = (st: GameState) => {
    const m = bestMove(st, 3);
    if (!m) {
      evaluateStatus(st);
      return;
    }
    const next = apply(st, m);
    setS(next);
    setLast(m);
    evaluateStatus(next);
  };

  const finish = (m: Move) => {
    const full = legal(S, m.from).find((x) => x.to === m.to && (!m.promo || x.promo === m.promo)) ?? m;
    const next = apply(S, full);
    setS(next);
    setLast(full);
    setSel(null);
    setTargets([]);
    setPending(null);
    const ended = evaluateStatus(next);
    if (!ended) later(() => botTurn(next), 260);
  };

  const click = (i: number) => {
    if (over || S.t !== 'w' || pending) return;
    const t = targets.find((m) => m.to === i);
    if (t) {
      const opts = targets.filter((m) => m.to === i);
      if (opts.length > 1 && opts[0]?.promo) {
        setPending({ from: sel ?? t.from, to: i });
        setSel(null);
        setTargets([]);
        return;
      }
      finish(t);
      return;
    }
    const p = S.b[i] as string;
    if (p !== '.' && colorOf(p) === 'w') {
      setSel(i);
      setTargets(legal(S, i));
    } else {
      setSel(null);
      setTargets([]);
    }
  };

  const newGame = () => {
    clearTimers();
    clearCelebration();
    setS(fresh());
    setSel(null);
    setTargets([]);
    setLast(null);
    setOver(false);
    setPending(null);
    setMsg('Your move.');
  };

  /* ---------------- derived render data ---------------- */
  const st = status(S);
  const chk = ['check', 'black-mate', 'white-mate'].includes(st) ? kingSq(S, S.t) : -1;
  const wActive = S.t === 'w' && !over;
  const bActive = S.t === 'b' && !over;
  const swText = S.t === 'w' ? (st === 'check' ? 'in check' : 'to move') : '';
  const sbText = S.t === 'b' ? (st === 'check' ? 'in check' : 'thinking…') : '';
  const glyphFor = (p: string): string => {
    const U = p.toUpperCase() as PieceType;
    return robots ? PIECE[U] : `<span class="uni">${CLASSIC[U]}</span>`;
  };

  const playerPhoto = profileQuery.data?.profile.photos?.[0] ?? null;
  const playerName = profileQuery.data?.profile.displayName ?? '';

  return (
    <div className="relative h-full overflow-hidden">
      <style>{SCENE_CSS}</style>
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
              Chess
            </span>
          </div>
        </div>

        <header className="mt-6 px-5">
          <p className="t-eyebrow">LOCAL TABLE</p>
          <h1 className="t-heading mt-2" style={{ color: 'var(--text-ink)' }}>
            You vs BOT · Riley.
          </h1>
          <p className="t-body mt-2" style={{ color: 'var(--text-secondary)' }}>
            The classic, on a warm tabletop. Riley is always labelled as a bot. Live
            multiplayer seats arrive with the Stage 2 community backend.
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
              <h2 className="t-title-sm">Sign in to take a seat.</h2>
              <p className="t-caption mt-1.5" style={{ color: 'var(--text-secondary)' }}>
                Community games are part of your Resonance access.
              </p>
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
                The lobby stays visible, but taking a seat needs Resonance+ or X.
                Dating core stays free: queue, matches, conversations and share board.
              </p>
              <BtnPrimary to="/premium" className="mt-4 w-full">
                See plans
              </BtnPrimary>
            </GlassCard>
          </section>
        )}

        {!accessLoading && isAuthenticated && allowed && (
          <section className="mt-6 px-5" aria-label="Chess game">
            <GlassCard className="p-4" ringX={24}>
              {/* Player HUD */}
              <div className="flex items-stretch gap-3">
                <div
                  className={cn(
                    'flex flex-1 items-center gap-2.5 rounded-[14px] px-3 py-2 transition-opacity',
                    !wActive && 'opacity-55',
                  )}
                  style={{
                    background: wActive ? 'var(--field-focus)' : 'var(--field)',
                    boxShadow: wActive ? '0 0 0 1.5px var(--violet)' : undefined,
                  }}
                >
                  <span className="relative shrink-0">
                    <OwnAvatar photo={playerPhoto} name={playerName} />
                    <BadgeCheck
                      size={14}
                      className="absolute -bottom-0.5 -right-0.5 rounded-full"
                      style={{ color: 'var(--ok)', background: 'var(--stage-base)' }}
                      aria-label="Verified"
                    />
                  </span>
                  <span className="min-w-0">
                    <span className="t-micro block" style={{ color: 'var(--text-secondary)' }}>
                      YOU — WHITE
                    </span>
                    <span className="t-caption block" style={{ color: 'var(--text)' }}>
                      {swText || ' '}
                    </span>
                  </span>
                </div>

                <div
                  className={cn(
                    'flex flex-1 items-center gap-2.5 rounded-[14px] px-3 py-2 transition-opacity',
                    !bActive && 'opacity-55',
                  )}
                  style={{
                    background: bActive ? 'var(--field-focus)' : 'var(--field)',
                    boxShadow: bActive ? '0 0 0 1.5px var(--violet)' : undefined,
                  }}
                >
                  <span
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
                    style={{
                      background: 'var(--field)',
                      color: 'var(--text-secondary)',
                      boxShadow: '0 0 0 1.5px var(--ring-stroke)',
                    }}
                    aria-label="Labelled bot"
                  >
                    <Bot size={18} aria-hidden="true" />
                  </span>
                  <span className="min-w-0">
                    <span className="t-micro block" style={{ color: 'var(--text-secondary)' }}>
                      BOT · RILEY — BLACK
                    </span>
                    <span className="t-caption block" style={{ color: 'var(--text)' }}>
                      {sbText || ' '}
                    </span>
                  </span>
                </div>
              </div>

              {/* Board scene */}
              <div className="chess-scene mt-4" ref={sceneRef}>
                <div className="chess-wall" />
                <div className="chess-floor" />
                <div className="chess-tabletop">
                  <div className="chess-board" role="grid" aria-label="Chess board">
                    {S.b.map((p, i) => {
                      const r = i >> 3;
                      const f = i & 7;
                      const t = targets.find((m) => m.to === i);
                      return (
                        <button
                          key={i}
                          type="button"
                          onClick={() => click(i)}
                          aria-label={`${'abcdefgh'[f]}${8 - r}`}
                          className={cn(
                            'chess-sq',
                            (r + f) % 2 ? 'd' : 'l',
                            i === sel && 'pick',
                            t && 'can',
                            last && (i === last.from || i === last.to) && 'last',
                            i === chk && 'chk',
                          )}
                        >
                          {p !== '.' && (
                            <span
                              className={cn('chess-pieceh', isW(p) ? 'chess-w' : 'chess-b')}
                              dangerouslySetInnerHTML={{ __html: glyphFor(p) }}
                            />
                          )}
                          {t && <div className={t.cap ? 'chess-ring' : 'chess-dot'} />}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <canvas ref={canvasRef} className={cn('chess-fw', fwOn && 'on')} aria-hidden="true" />
                <div className={cn('chess-banner', banner && 'on')} aria-hidden="true">
                  {banner && (
                    <>
                      <div className="big">{banner.title}</div>
                      <div className="small">{banner.sub}</div>
                    </>
                  )}
                </div>
              </div>

              {/* Status line */}
              <p
                className="t-caption mt-3 min-h-[20px] text-center"
                style={{ color: over ? 'var(--text)' : 'var(--text-secondary)' }}
                aria-live="polite"
              >
                {msg}
              </p>

              {/* Controls */}
              <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
                {pending ? (
                  PROMO_ORDER.map((x) => (
                    <button
                      key={x}
                      type="button"
                      className="chess-promo chess-w"
                      onClick={() => finish({ from: pending.from, to: pending.to, promo: x })}
                      aria-label={`Promote to ${x}`}
                    >
                      <span
                        className="chess-pieceh"
                        dangerouslySetInnerHTML={{ __html: PIECE[x] }}
                      />
                    </button>
                  ))
                ) : (
                  <>
                    <BtnGlass className="h-11 px-5" onClick={newGame} ariaLabel="New game">
                      <RotateCcw size={16} aria-hidden="true" />
                      New game
                    </BtnGlass>
                    <BtnGlass
                      className="h-11 px-5"
                      onClick={() => setRobots((v) => !v)}
                      ariaLabel={robots ? 'Switch to classic pieces' : 'Switch to robot pieces'}
                    >
                      {robots ? 'Classic pieces' : 'Robot pieces'}
                    </BtnGlass>
                  </>
                )}
              </div>
            </GlassCard>
          </section>
        )}
      </div>
    </div>
  );
}
