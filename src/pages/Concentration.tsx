import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { ArrowLeft, BadgeCheck, RotateCcw } from 'lucide-react';
import GlassCard from '@/components/GlassCard';
import { BtnGlass, BtnPrimary } from '@/components/ui/buttons';
import { trpc } from '@/providers/trpc';
import { useAuth } from '@/hooks/useAuth';
import { LOGIN_PATH } from '@/const';
import { cn } from '@/lib/utils';
import WinFireworks from '@/components/games/WinFireworks';
import OwnAvatar from '@/components/games/OwnAvatar';

const GLYPHS = ['✦', '❍', '△', '☾', '✕', '❑', '∿', '♁'];
type Turn = 0 | 1;

function shuffle<T>(items: T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default function Concentration() {
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

  const [deck, setDeck] = useState<string[]>([]);
  const [up, setUp] = useState<number[]>([]);
  const [matched, setMatched] = useState<number[]>([]);
  const [turn, setTurn] = useState<Turn>(0);
  const [scores, setScores] = useState<[number, number]>([0, 0]);
  const [busy, setBusy] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [msg, setMsg] = useState('Your turn.');

  const botMemory = useRef(new Map<number, string>());
  const timers = useRef<number[]>([]);

  const clearTimers = useCallback(() => {
    timers.current.forEach((id) => window.clearTimeout(id));
    timers.current = [];
  }, []);

  const later = useCallback((fn: () => void, ms: number) => {
    const id = window.setTimeout(fn, ms);
    timers.current.push(id);
  }, []);

  const newGame = useCallback(() => {
    clearTimers();
    botMemory.current = new Map();
    setDeck(shuffle([...GLYPHS, ...GLYPHS]));
    setUp([]);
    setMatched([]);
    setTurn(0);
    setScores([0, 0]);
    setBusy(false);
    setGameOver(false);
    setMsg('Your turn.');
  }, [clearTimers]);

  useEffect(() => {
    newGame();
    return () => clearTimers();
  }, [newGame, clearTimers]);

  const botMove = useCallback(() => {
    if (gameOver || deck.length === 0) return;
    const free = deck.map((_, i) => i).filter((i) => !matched.includes(i));
    if (free.length === 0) return;

    const seen = [...botMemory.current.entries()].filter(([i]) => !matched.includes(i));
    let first: number | null = null;
    let second: number | null = null;
    for (let x = 0; x < seen.length; x++) {
      for (let y = x + 1; y < seen.length; y++) {
        if (seen[x][1] === seen[y][1]) {
          first = seen[x][0];
          second = seen[y][0];
          break;
        }
      }
      if (first !== null) break;
    }

    if (first === null) {
      const unseen = free.filter((i) => !botMemory.current.has(i));
      const pool = unseen.length ? unseen : free;
      first = pool[Math.floor(Math.random() * pool.length)];
    }

    botMemory.current.set(first, deck[first]);
    setUp([first]);

    later(() => {
      if (second === null || matched.includes(second) || second === first) {
        const rest = free.filter((i) => i !== first);
        const known = rest.find((i) => botMemory.current.get(i) === deck[first]);
        const unseen = rest.filter((i) => !botMemory.current.has(i));
        second =
          known ??
          (unseen.length
            ? unseen[Math.floor(Math.random() * unseen.length)]
            : rest[Math.floor(Math.random() * rest.length)]);
      }
      botMemory.current.set(second, deck[second]);
      setUp([first, second]);
    }, 650);
  }, [deck, matched, gameOver, later]);

  const resolvePair = useCallback(
    (pair: number[]) => {
      const [a, b] = pair;
      if (a === undefined || b === undefined || deck.length === 0) return;
      setBusy(true);
      const hit = deck[a] === deck[b];
      later(() => {
        const nextMatched = hit ? Array.from(new Set([...matched, a, b])) : matched;
        const nextScores: [number, number] = hit
          ? turn === 0
            ? [scores[0] + 1, scores[1]]
            : [scores[0], scores[1] + 1]
          : scores;
        const nextTurn: Turn = hit ? turn : ((1 - turn) as Turn);

        if (hit) {
          botMemory.current.delete(a);
          botMemory.current.delete(b);
        }

        setMatched(nextMatched);
        setScores(nextScores);
        setTurn(nextTurn);
        setUp([]);
        setBusy(false);

        if (nextMatched.length === deck.length) {
          setGameOver(true);
          setMsg(
            nextScores[0] > nextScores[1]
              ? 'You win.'
              : nextScores[0] < nextScores[1]
                ? 'Riley wins.'
                : 'Tied.',
          );
          return;
        }

        setMsg(
          hit
            ? turn === 0
              ? 'Match — go again.'
              : 'Riley matched. Riley goes again.'
            : nextTurn === 0
              ? 'Your turn.'
              : "Riley's turn.",
        );
        if (nextTurn === 1) later(botMove, 700);
      }, hit ? 450 : 900);
    },
    [botMove, deck, later, matched, scores, turn],
  );

  useEffect(() => {
    if (up.length === 2) resolvePair(up);
    // resolvePair intentionally read from the render that produced `up`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [up]);

  const flip = useCallback(
    (i: number) => {
      if (busy || gameOver || turn !== 0) return;
      if (matched.includes(i) || up.includes(i)) return;
      botMemory.current.set(i, deck[i]);
      setUp((current) => [...current, i]);
    },
    [busy, deck, gameOver, matched, turn, up],
  );

  const playerPhoto = profileQuery.data?.profile.photos?.[0] ?? null;
  const playerName = profileQuery.data?.profile.displayName ?? '';

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
              Concentration
            </span>
          </div>
        </div>

        <header className="mt-6 px-5">
          <p className="t-eyebrow">LOCAL TABLE</p>
          <h1 className="t-heading mt-2" style={{ color: 'var(--text-ink)' }}>
            You vs BOT · Riley.
          </h1>
          <p className="t-body mt-2" style={{ color: 'var(--text-secondary)' }}>
            Playable now on this device. Riley is always labelled as a bot. Live
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
          <section className="mt-6 px-5" aria-label="Concentration game">
            <GlassCard className="p-4" ringX={24}>
              <div className="flex items-center gap-6">
                <div className={cn('flex items-center gap-2.5', turn !== 0 && 'opacity-55')}>
                  <span className="relative">
                    <OwnAvatar photo={playerPhoto} name={playerName} />
                    <BadgeCheck
                      size={14}
                      className="absolute -bottom-0.5 -right-0.5 rounded-full"
                      style={{ color: 'var(--ok)', background: 'var(--stage-base)' }}
                      aria-label="Verified"
                    />
                  </span>
                  <span>
                    <span className="t-micro block" style={{ color: 'var(--text-secondary)' }}>
                      YOU
                    </span>
                    <span className="t-title block" style={{ color: 'var(--text)' }}>
                      {scores[0]}
                    </span>
                  </span>
                </div>

                <div className={cn('flex items-center gap-2.5', turn !== 1 && 'opacity-55')}>
                  <span
                    className="t-caption flex h-9 w-9 items-center justify-center rounded-full font-bold"
                    style={{ background: 'var(--field)', color: 'var(--text-secondary)' }}
                  >
                    B
                  </span>
                  <span>
                    <span className="t-micro block" style={{ color: 'var(--text-secondary)' }}>
                      BOT · RILEY
                    </span>
                    <span className="t-title block" style={{ color: 'var(--text)' }}>
                      {scores[1]}
                    </span>
                  </span>
                </div>
              </div>

              <div className="mt-5 grid grid-cols-4 gap-2.5">
                {deck.map((glyph, i) => {
                  const isUp = up.includes(i);
                  const isDone = matched.includes(i);
                  return (
                    <button
                      key={`${i}-${glyph}`}
                      type="button"
                      disabled={isDone || isUp || busy || turn !== 0 || gameOver}
                      onClick={() => flip(i)}
                      aria-label={isUp || isDone ? `Card ${glyph}` : `Face-down card ${i + 1}`}
                      className="relative flex aspect-[3/4] items-center justify-center rounded-[14px] text-[26px] transition-transform duration-fast disabled:cursor-default"
                      style={{
                        background: isUp || isDone ? 'var(--field-focus)' : 'var(--field)',
                        color: 'var(--text)',
                        opacity: isDone ? 0.28 : 1,
                        boxShadow: isUp ? '0 0 0 1.5px var(--violet)' : undefined,
                      }}
                    >
                      <span style={{ opacity: isUp || isDone ? 1 : 0 }}>{glyph}</span>
                    </button>
                  );
                })}
              </div>

              <div className="mt-4 flex min-h-[52px] items-center gap-3">
                <p className="t-value flex-1" style={{ color: 'var(--text)' }} aria-live="polite">
                  {msg}
                </p>
                {gameOver ? (
                  <BtnPrimary className="h-11 px-5" onClick={newGame}>
                    <RotateCcw size={16} aria-hidden="true" />
                    New game
                  </BtnPrimary>
                ) : (
                  <BtnGlass className="h-11 px-4" onClick={newGame} ariaLabel="Restart game">
                    <RotateCcw size={16} aria-hidden="true" />
                  </BtnGlass>
                )}
              </div>
            </GlassCard>
          </section>
        )}

        {/* V83 — fireworks on a human win (never on Riley's) */}
        <WinFireworks fire={gameOver && scores[0] > scores[1]} />
      </div>
    </div>
  );
}
