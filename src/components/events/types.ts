/**
 * Shared event view-model for the Events feature (matches
 * api/queries/events.ts `EventWithRsvp`, re-declared locally so the
 * client bundle never imports db modules).
 */
export type EventItem = {
  id: number;
  title: string;
  category: string;
  description: string | null;
  image: string | null;
  city: string | null;
  venue: string | null;
  startsAt: Date | string;
  capacity: number;
  hostName: string | null;
  goingCount: number;
  interestedCount: number;
  myRsvp: 'going' | 'interested' | null;
};

export function eventDate(e: EventItem): Date {
  return e.startsAt instanceof Date ? e.startsAt : new Date(e.startsAt);
}

/** "FRI 7 PM" — hero eyebrow form */
export function fmtEyebrowDate(d: Date): string {
  const day = d.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase();
  const h = d.getHours();
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 || 12;
  return `${day} ${hour} ${ampm}`;
}

/** "Sat 11am" / "Fri 6:30pm" — list micro form */
export function fmtListDate(d: Date): string {
  const day = d.toLocaleDateString('en-US', { weekday: 'short' });
  const h = d.getHours();
  const ampm = h >= 12 ? 'pm' : 'am';
  const hour = h % 12 || 12;
  const min = d.getMinutes();
  return `${day} ${hour}${min ? `:${String(min).padStart(2, '0')}` : ''}${ampm}`;
}

/** "7:00 PM" — agenda form */
export function fmtAgendaTime(d: Date): string {
  return d
    .toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    .toUpperCase();
}
