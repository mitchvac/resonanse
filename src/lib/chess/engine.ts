/**
 * Chess engine — pure TypeScript port of the game logic from chess.html.
 * No DOM access: board model is a 64-cell array of piece letters
 * (uppercase = white, lowercase = black, '.' = empty), index 0 = a8.
 */

export type Color = 'w' | 'b';
export type PieceType = 'P' | 'N' | 'B' | 'R' | 'Q' | 'K';
export type PromoPiece = 'Q' | 'R' | 'B' | 'N';
export type Board = string[];

export interface CastlingRights {
  K: boolean;
  Q: boolean;
  k: boolean;
  q: boolean;
}

export interface GameState {
  b: Board;
  t: Color;
  cast: CastlingRights;
  /** en-passant target square index, or -1 */
  ep: number;
  /** half-move clock for the fifty-move rule */
  half: number;
}

export interface Move {
  from: number;
  to: number;
  cap?: boolean;
  promo?: PromoPiece;
  dbl?: boolean;
  ep?: boolean;
  castle?: 'K' | 'Q';
}

export type GameStatus = 'ok' | 'check' | 'black-mate' | 'white-mate' | 'stalemate' | 'draw50';

export const VAL: Record<PieceType, number> = { P: 100, N: 320, B: 330, R: 500, Q: 900, K: 20000 };

export const PST_P: number[] = [
  0, 0, 0, 0, 0, 0, 0, 0, 50, 50, 50, 50, 50, 50, 50, 50, 10, 10, 20, 30, 30, 20, 10, 10,
  5, 5, 10, 25, 25, 10, 5, 5, 0, 0, 0, 20, 20, 0, 0, 0, 5, -5, -10, 0, 0, -10, -5, 5,
  5, 10, 10, -20, -20, 10, 10, 5, 0, 0, 0, 0, 0, 0, 0, 0,
];

export const PST_N: number[] = [
  -50, -40, -30, -30, -30, -30, -40, -50, -40, -20, 0, 0, 0, 0, -20, -40, -30, 0, 10, 15, 15,
  10, 0, -30, -30, 5, 15, 20, 20, 15, 5, -30, -30, 0, 15, 20, 20, 15, 0, -30, -30, 5, 10, 15,
  15, 10, 5, -30, -40, -20, 0, 5, 5, 0, -20, -40, -50, -40, -30, -30, -30, -30, -40, -50,
];

const PROMOS: PromoPiece[] = ['Q', 'R', 'B', 'N'];
const KNIGHT_OFFSETS: [number, number][] = [
  [1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1],
];
const DIAG: [number, number][] = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
const ORTHO: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const ALL_DIRS: [number, number][] = [...DIAG, ...ORTHO];

export const isW = (p: string): boolean => p !== '' && p === p.toUpperCase();
export const colorOf = (p: string): Color | null => (p ? (isW(p) ? 'w' : 'b') : null);

const START: Board = 'rnbqkbnrpppppppp................................PPPPPPPPRNBQKBNR'.split('');

export function fresh(): GameState {
  return { b: [...START], t: 'w', cast: { K: true, Q: true, k: true, q: true }, ep: -1, half: 0 };
}

const onBoard = (r: number, f: number): boolean => r >= 0 && r < 8 && f >= 0 && f < 8;
export const RF = (i: number): [number, number] => [i >> 3, i & 7];
export const IX = (r: number, f: number): number => r * 8 + f;

export function pseudo(st: GameState, only?: number): Move[] {
  const out: Move[] = [];
  const b = st.b;
  const me = st.t;
  for (let i = 0; i < 64; i++) {
    const p = b[i] as string;
    if (p === '.' || colorOf(p) !== me) continue;
    if (only !== undefined && i !== only) continue;
    const [r, f] = RF(i);
    const U = p.toUpperCase();
    const push = (tr: number, tf: number, extra?: Partial<Move>): boolean => {
      if (!onBoard(tr, tf)) return false;
      const j = IX(tr, tf);
      const q = b[j] as string;
      if (q !== '.' && colorOf(q) === me) return false;
      out.push(Object.assign({ from: i, to: j, cap: q !== '.' }, extra ?? {}));
      return q === '.';
    };
    if (U === 'P') {
      const dir = me === 'w' ? -1 : 1;
      const start = me === 'w' ? 6 : 1;
      const promoR = me === 'w' ? 0 : 7;
      if (onBoard(r + dir, f) && b[IX(r + dir, f)] === '.') {
        if (r + dir === promoR) {
          for (const pr of PROMOS) out.push({ from: i, to: IX(r + dir, f), promo: pr });
        } else {
          out.push({ from: i, to: IX(r + dir, f) });
          if (r === start && b[IX(r + 2 * dir, f)] === '.') {
            out.push({ from: i, to: IX(r + 2 * dir, f), dbl: true });
          }
        }
      }
      for (const df of [-1, 1]) {
        const tr = r + dir;
        const tf = f + df;
        if (!onBoard(tr, tf)) continue;
        const j = IX(tr, tf);
        const q = b[j] as string;
        if (q !== '.' && colorOf(q) !== me) {
          if (tr === promoR) {
            for (const pr of PROMOS) out.push({ from: i, to: j, cap: true, promo: pr });
          } else {
            out.push({ from: i, to: j, cap: true });
          }
        } else if (j === st.ep) {
          out.push({ from: i, to: j, cap: true, ep: true });
        }
      }
    } else if (U === 'N') {
      for (const [dr, df] of KNIGHT_OFFSETS) push(r + dr, f + df);
    } else if (U === 'K') {
      for (const dr of [-1, 0, 1]) {
        for (const df of [-1, 0, 1]) {
          if (dr || df) push(r + dr, f + df);
        }
      }
      const rank = me === 'w' ? 7 : 0;
      const foe: Color = me === 'w' ? 'b' : 'w';
      const kOK = me === 'w' ? st.cast.K : st.cast.k;
      const qOK = me === 'w' ? st.cast.Q : st.cast.q;
      if (i === IX(rank, 4) && !attacked(st, i, foe)) {
        if (
          kOK &&
          b[IX(rank, 5)] === '.' &&
          b[IX(rank, 6)] === '.' &&
          !attacked(st, IX(rank, 5), foe) &&
          !attacked(st, IX(rank, 6), foe)
        ) {
          out.push({ from: i, to: IX(rank, 6), castle: 'K' });
        }
        if (
          qOK &&
          b[IX(rank, 3)] === '.' &&
          b[IX(rank, 2)] === '.' &&
          b[IX(rank, 1)] === '.' &&
          !attacked(st, IX(rank, 3), foe) &&
          !attacked(st, IX(rank, 2), foe)
        ) {
          out.push({ from: i, to: IX(rank, 2), castle: 'Q' });
        }
      }
    } else {
      const dirs = U === 'B' ? DIAG : U === 'R' ? ORTHO : ALL_DIRS;
      for (const [dr, df] of dirs) {
        let k = 1;
        while (push(r + dr * k, f + df * k)) k++;
      }
    }
  }
  return out;
}

export function attacked(st: GameState, sq: number, by: Color): boolean {
  const b = st.b;
  const [r, f] = RF(sq);
  const at = (tr: number, tf: number): string | null => (onBoard(tr, tf) ? (b[IX(tr, tf)] as string) : null);
  const pd = by === 'w' ? 1 : -1; // pawn sits "below" if white attacks upward
  for (const df of [-1, 1]) {
    const q = at(r + pd, f + df);
    if (q && colorOf(q) === by && q.toUpperCase() === 'P') return true;
  }
  for (const [dr, df] of KNIGHT_OFFSETS) {
    const q = at(r + dr, f + df);
    if (q && colorOf(q) === by && q.toUpperCase() === 'N') return true;
  }
  for (const dr of [-1, 0, 1]) {
    for (const df of [-1, 0, 1]) {
      if (!dr && !df) continue;
      const q = at(r + dr, f + df);
      if (q && colorOf(q) === by && q.toUpperCase() === 'K') return true;
    }
  }
  const slide = (dirs: [number, number][], set: PieceType[]): boolean => {
    for (const [dr, df] of dirs) {
      let k = 1;
      while (onBoard(r + dr * k, f + df * k)) {
        const q = b[IX(r + dr * k, f + df * k)] as string;
        if (q !== '.') {
          if (colorOf(q) === by && set.includes(q.toUpperCase() as PieceType)) return true;
          break;
        }
        k++;
      }
    }
    return false;
  };
  if (slide(DIAG, ['B', 'Q'])) return true;
  if (slide(ORTHO, ['R', 'Q'])) return true;
  return false;
}

export function kingSq(st: GameState, c: Color): number {
  const k = c === 'w' ? 'K' : 'k';
  return st.b.indexOf(k);
}

export function inCheck(st: GameState, c: Color): boolean {
  const k = kingSq(st, c);
  return k >= 0 && attacked(st, k, c === 'w' ? 'b' : 'w');
}

export function apply(st: GameState, m: Move): GameState {
  const n: GameState = {
    b: [...st.b],
    t: st.t === 'w' ? 'b' : 'w',
    cast: { ...st.cast },
    ep: -1,
    half: st.half + 1,
  };
  const p = n.b[m.from] as string;
  const U = p.toUpperCase();
  const me = st.t;
  n.b[m.from] = '.';
  if (m.ep) {
    const [tr, tf] = RF(m.to);
    n.b[IX(me === 'w' ? tr + 1 : tr - 1, tf)] = '.';
  }
  n.b[m.to] = m.promo ? (me === 'w' ? m.promo : m.promo.toLowerCase()) : p;
  if (m.dbl) {
    const [fr, ff] = RF(m.from);
    n.ep = IX(me === 'w' ? fr - 1 : fr + 1, ff);
  }
  if (m.castle) {
    const rank = me === 'w' ? 7 : 0;
    if (m.castle === 'K') {
      n.b[IX(rank, 5)] = n.b[IX(rank, 7)] as string;
      n.b[IX(rank, 7)] = '.';
    } else {
      n.b[IX(rank, 3)] = n.b[IX(rank, 0)] as string;
      n.b[IX(rank, 0)] = '.';
    }
  }
  if (U === 'K') {
    if (me === 'w') {
      n.cast.K = n.cast.Q = false;
    } else {
      n.cast.k = n.cast.q = false;
    }
  }
  if (m.from === 63 || m.to === 63) n.cast.K = false;
  if (m.from === 56 || m.to === 56) n.cast.Q = false;
  if (m.from === 7 || m.to === 7) n.cast.k = false;
  if (m.from === 0 || m.to === 0) n.cast.q = false;
  if (U === 'P' || m.cap) n.half = 0;
  return n;
}

export function legal(st: GameState, only?: number): Move[] {
  return pseudo(st, only).filter((m) => !inCheck(apply(st, m), st.t));
}

/* ---------------- search ---------------- */

export function evaluate(st: GameState): number {
  let s = 0;
  for (let i = 0; i < 64; i++) {
    const p = st.b[i] as string;
    if (p === '.') continue;
    const U = p.toUpperCase() as PieceType;
    const w = isW(p);
    let v = VAL[U];
    const idx = w ? i : 56 - (i & 56) + (i & 7);
    if (U === 'P') v += PST_P[idx] as number;
    else if (U === 'N') v += PST_N[idx] as number;
    s += w ? v : -v;
  }
  return s;
}

const byCapture = (a: Move, b: Move): number => (b.cap ? 1 : 0) - (a.cap ? 1 : 0);

export function search(st: GameState, depth: number, alpha: number, beta: number): number {
  if (depth === 0) return evaluate(st);
  const moves = legal(st).sort(byCapture);
  if (!moves.length) {
    return inCheck(st, st.t) ? (st.t === 'w' ? -99999 + depth : 99999 - depth) : 0;
  }
  if (st.t === 'w') {
    let best = -1e9;
    for (const m of moves) {
      best = Math.max(best, search(apply(st, m), depth - 1, alpha, beta));
      alpha = Math.max(alpha, best);
      if (beta <= alpha) break;
    }
    return best;
  }
  let best = 1e9;
  for (const m of moves) {
    best = Math.min(best, search(apply(st, m), depth - 1, alpha, beta));
    beta = Math.min(beta, best);
    if (beta <= alpha) break;
  }
  return best;
}

export function bestMove(st: GameState, depth: number): Move | null {
  const moves = legal(st).sort(byCapture);
  let best: Move | null = null;
  let bv = st.t === 'w' ? -1e9 : 1e9;
  for (const m of moves) {
    const v = search(apply(st, m), depth - 1, -1e9, 1e9);
    if (st.t === 'w' ? v > bv : v < bv) {
      bv = v;
      best = m;
    }
  }
  return best;
}

export function status(st: GameState): GameStatus {
  const moves = legal(st);
  if (!moves.length) {
    return inCheck(st, st.t) ? (st.t === 'w' ? 'black-mate' : 'white-mate') : 'stalemate';
  }
  if (st.half >= 100) return 'draw50';
  return inCheck(st, st.t) ? 'check' : 'ok';
}
