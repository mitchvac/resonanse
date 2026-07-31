import type { inferRouterOutputs } from '@trpc/server';
import type { AppRouter } from '../../../api/router';

export type RouterOutputs = inferRouterOutputs<AppRouter>;
export type MatchEntry = RouterOutputs['matches']['list']['matches'][number];
export type ChatData = RouterOutputs['chat']['messages'];
export type ChatMessage = ChatData['messages'][number];
export type DateIdea = RouterOutputs['chat']['dateIdeas']['ideas'][number];

/** Relative timestamp per matches.md §2 ("2m" / "1h" / "3d"). */
export function relTime(input: Date | string): string {
  const t = input instanceof Date ? input.getTime() : new Date(input).getTime();
  const diff = Date.now() - t;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

/** Day-divider label per chat.md §2. */
export function dayLabel(input: Date | string): string {
  const d = input instanceof Date ? input : new Date(input);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (same(d, today)) return 'Today';
  if (same(d, yesterday)) return 'Yesterday';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** Clock time for system bubbles, e.g. "9:41 PM" (chat.md §5). */
export function clockTime(input: Date | string): string {
  const d = input instanceof Date ? input : new Date(input);
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export function sameDay(a: Date | string, b: Date | string): boolean {
  const da = a instanceof Date ? a : new Date(a);
  const db = b instanceof Date ? b : new Date(b);
  return da.toDateString() === db.toDateString();
}

export function firstNameOf(name?: string | null): string {
  return name?.split(' ')[0] ?? 'them';
}
