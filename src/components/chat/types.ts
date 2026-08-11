import type { inferRouterOutputs } from '@trpc/server';
import type { TFunction } from 'i18next';
import type { AppRouter } from '../../../api/router';

export type RouterOutputs = inferRouterOutputs<AppRouter>;
export type MatchEntry = RouterOutputs['matches']['list']['matches'][number];
export type ChatData = RouterOutputs['chat']['messages'];
export type ChatMessage = ChatData['messages'][number];
export type DateIdea = RouterOutputs['chat']['dateIdeas']['ideas'][number];

/* ------------------------------------------------------------------ */
/* V93 removed-peer tombstone: after a strike-3 removal the server      */
/* appends ONE neutral system message (meta.event === 'account_removed')*/
/* to every conversation of the removed user. matches.list may also     */
/* expose removedPeer on the entry. Either signal means: history stays  */
/* readable, composer is disabled, preview shows the neutral line.      */
/* ------------------------------------------------------------------ */
export function isAccountRemovedMessage(
  m: { kind?: string; meta?: unknown } | null | undefined,
): boolean {
  return (
    m?.kind === 'system' &&
    (m.meta as { event?: string } | null | undefined)?.event === 'account_removed'
  );
}

export function isRemovedPeer(entry: MatchEntry | null | undefined): boolean {
  if (!entry) return false;
  return (
    isAccountRemovedMessage(entry.lastMessage) ||
    (entry as { removedPeer?: boolean }).removedPeer === true
  );
}


/** Relative timestamp per matches.md §2 ("2m" / "1h" / "3d"). */
export function relTime(input: Date | string, t: TFunction): string {
  const ts = input instanceof Date ? input.getTime() : new Date(input).getTime();
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return t('chat.relNow');
  if (mins < 60) return t('chat.relMinutes', { count: mins });
  const hours = Math.floor(mins / 60);
  if (hours < 24) return t('chat.relHours', { count: hours });
  const days = Math.floor(hours / 24);
  return t('chat.relDays', { count: days });
}

/** Day-divider label per chat.md §2. */
export function dayLabel(input: Date | string, t: TFunction): string {
  const d = input instanceof Date ? input : new Date(input);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (same(d, today)) return t('chat.today');
  if (same(d, yesterday)) return t('chat.yesterday');
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

export function firstNameOf(name?: string | null, fallback = 'them'): string {
  return name?.split(' ')[0] ?? fallback;
}
