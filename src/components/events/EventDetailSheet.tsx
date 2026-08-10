import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BadgeCheck, MapPin, Navigation, ShieldCheck } from 'lucide-react';
import GlassSheet from '@/components/GlassSheet';
import LightTrail from '@/components/LightTrail';
import { BtnGlass } from '@/components/ui/buttons';
import RsvpButton from '@/components/events/RsvpButton';
import {
  eventDate,
  fmtAgendaTime,
  fmtListDate,
  type EventItem,
} from '@/components/events/types';
import { trpc } from '@/providers/trpc';

const ATTENDEE_AVATARS = [
  '/avatar-02.jpg',
  '/avatar-04.jpg',
  '/avatar-06.jpg',
  '/avatar-08.jpg',
  '/avatar-10.jpg',
];

/**
 * EventDetailSheet — events.md §3
 * Full GlassSheet: hero photo pager, title, verified host row, description,
 * verified-attendee grid, safety strip, agenda timeline on a LightTrail
 * (the page's light-trail moment), sticky footer with RSVP + Invite a match.
 */
export default function EventDetailSheet({
  event,
  rsvpPending,
  onClose,
  onToggleRsvp,
  onToast,
}: {
  event: EventItem | null;
  rsvpPending: boolean;
  onClose: () => void;
  onToggleRsvp: (event: EventItem) => void;
  onToast: (message: string) => void;
}) {
  const { t } = useTranslation('connect');
  const [pickerOpen, setPickerOpen] = useState(false);
  const matchesQuery = trpc.matches.list.useQuery(undefined, {
    enabled: pickerOpen,
  });
  const invite = trpc.events.invite.useMutation();

  const start = event ? eventDate(event) : null;
  const lat = event?.lat ?? null;
  const lng = event?.lng ?? null;
  const hasGeo = lat != null && lng != null;
  const mapEmbedUrl = hasGeo
    ? `https://www.openstreetmap.org/export/embed.html?bbox=${lng - 0.012}%2C${lat - 0.007}%2C${lng + 0.012}%2C${lat + 0.007}&layer=mapnik&marker=${lat}%2C${lng}`
    : null;
  const directionsUrl = hasGeo
    ? /iPad|iPhone|iPod/.test(navigator.userAgent)
      ? `https://maps.apple.com/?daddr=${lat},${lng}`
      : `https://www.google.com/maps/dir/?api=1&destination=${lat}%2C${lng}`
    : null;
  const agenda = start
    ? [
        { at: start, label: t('events.agendaDoors') },
        { at: new Date(start.getTime() + 30 * 60000), label: t('events.agendaRounds') },
        { at: new Date(start.getTime() + 90 * 60000), label: t('events.agendaMingle') },
      ]
    : [];

  return (
    <>
      <GlassSheet open={!!event} onClose={onClose} labelledBy="event-detail-title">
        {event && start && (
          <div className="relative max-h-[78dvh] overflow-y-auto px-5 pb-40">
            {/* Hero photo pager */}
            <div className="relative mt-2 aspect-[3/2] overflow-hidden rounded-2xl">
              <img
                src={event.image ?? '/event-01.jpg'}
                alt={event.title}
                className="absolute inset-0 h-full w-full object-cover"
              />
              <div className="photo-scrim absolute inset-0" aria-hidden="true" />
              <div
                className="absolute inset-x-0 bottom-2 flex justify-center gap-1.5"
                aria-hidden="true"
              >
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="h-1.5 w-1.5 rounded-full bg-white"
                    style={{ opacity: i === 0 ? 1 : 0.45 }}
                  />
                ))}
              </div>
            </div>

            <h2 id="event-detail-title" className="t-title mt-4">
              {event.title}
            </h2>
            <p className="t-caption mt-1" style={{ color: 'var(--text-secondary)' }}>
              {fmtListDate(start)}
              {event.venue ? ` · ${event.venue}` : ''}
              {event.city ? ` · ${event.city}` : ''}
            </p>

            {/* Host row */}
            <div className="mt-3 flex items-center gap-2">
              <BadgeCheck size={16} style={{ color: 'var(--violet)' }} aria-hidden="true" />
              <span className="t-caption" style={{ color: 'var(--text)' }}>
                {t('events.verifiedHost')}{event.hostName ? ` · ${event.hostName}` : ''}
              </span>
            </div>

            {event.description && (
              <p className="t-body mt-3" style={{ color: 'var(--text)' }}>
                {event.description}
              </p>
            )}

            {/* Getting there — address, embedded map, directions */}
            {(event.address || hasGeo) && (
              <>
                <p className="t-micro mt-5" style={{ color: 'var(--text)' }}>
                  {t('events.gettingThere')}
                </p>
                <div className="mt-2 flex items-start gap-2">
                  <MapPin
                    size={16}
                    className="mt-0.5 shrink-0"
                    style={{ color: 'var(--violet)' }}
                    aria-hidden="true"
                  />
                  <div className="min-w-0">
                    {event.venue && (
                      <p className="t-caption font-semibold" style={{ color: 'var(--text)' }}>
                        {event.venue}
                      </p>
                    )}
                    {event.address && (
                      <p className="t-caption" style={{ color: 'var(--text-secondary)' }}>
                        {event.address}
                      </p>
                    )}
                  </div>
                </div>
                {hasGeo && mapEmbedUrl && directionsUrl && (
                  <>
                    <div
                      className="mt-3 aspect-[16/10] overflow-hidden rounded-2xl"
                      style={{ border: '1px solid hsl(var(--border))' }}
                    >
                      <iframe
                        src={mapEmbedUrl}
                        loading="lazy"
                        title={t('events.mapTitle', { venue: event.venue ?? t('events.theVenue') })}
                        className="h-full w-full border-0"
                      />
                    </div>
                    <div className="mt-3 flex items-center gap-3">
                      <BtnGlass href={directionsUrl} className="h-[44px] flex-1 px-4">
                        <Navigation size={16} aria-hidden="true" />
                        {t('events.getDirections')}
                      </BtnGlass>
                      <a
                        href={`https://www.openstreetmap.org/directions?to=${lat}%2C${lng}`}
                        target="_blank"
                        rel="noreferrer"
                        className="t-caption shrink-0 transition-opacity duration-fast active:opacity-70"
                        style={{ color: 'var(--text-secondary)' }}
                      >
                        OpenStreetMap
                      </a>
                    </div>
                  </>
                )}
              </>
            )}

            {/* Attendee grid */}
            <p className="t-micro mt-5" style={{ color: 'var(--text)' }}>
              {t('events.photoVerified')}
            </p>
            <div className="mt-2 grid grid-cols-6 gap-2">
              {ATTENDEE_AVATARS.map((src) => (
                <img
                  key={src}
                  src={src}
                  alt={t('events.verifiedAttendee')}
                  loading="lazy"
                  className="aspect-square w-full rounded-full object-cover"
                />
              ))}
              <div
                className="flex aspect-square w-full items-center justify-center rounded-full"
                style={{ background: 'var(--field)' }}
              >
                <span className="t-caption" style={{ color: 'var(--text)' }}>
                  +{Math.max(event.goingCount - ATTENDEE_AVATARS.length, 1)}
                </span>
              </div>
            </div>

            {/* Safety strip */}
            <div
              className="mt-5 flex items-center gap-2 rounded-2xl px-3 py-2.5"
              style={{ background: 'var(--field)' }}
            >
              <ShieldCheck size={16} style={{ color: 'var(--ok)' }} aria-hidden="true" />
              <span className="t-caption" style={{ color: 'var(--text)' }}>
                {t('events.safetyStrip')}
              </span>
            </div>

            {/* Agenda timeline — light-trail moment */}
            <p className="t-micro mt-5" style={{ color: 'var(--text)' }}>
              {t('events.agenda')}
            </p>
            <div className="relative mt-2">
              <LightTrail
                width={16}
                height={132}
                d="M 8 6 L 8 126"
                nodes={[
                  { x: 8, y: 10 },
                  { x: 8, y: 66 },
                  { x: 8, y: 122 },
                ]}
                style={{ left: 0, top: 0 }}
              />
              <div className="flex flex-col gap-5 pl-7">
                {agenda.map((slot) => (
                  <div key={slot.label}>
                    <p className="t-caption font-bold" style={{ color: 'var(--text)' }}>
                      {fmtAgendaTime(slot.at)}
                    </p>
                    <p className="t-caption" style={{ color: 'var(--text-secondary)' }}>
                      {slot.label}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Sticky footer */}
        {event && (
          <div
            className="absolute inset-x-0 bottom-0 flex gap-2 px-5 pt-6"
            style={{
              background:
                'linear-gradient(180deg, transparent 0%, var(--glass-solid) 45%)',
              paddingBottom: 'max(20px, env(safe-area-inset-bottom, 0px))',
            }}
          >
            <BtnGlass className="h-[52px] flex-1 px-4" onClick={() => setPickerOpen(true)}>
              {t('events.inviteMatch')}
            </BtnGlass>
            <RsvpButton
              variant="primary"
              className="flex-1 px-4"
              going={event.myRsvp === 'going'}
              pending={rsvpPending}
              onToggle={() => onToggleRsvp(event)}
            />
          </div>
        )}
      </GlassSheet>

      {/* Invite-a-match picker */}
      <GlassSheet
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        labelledBy="invite-match-title"
      >
        <div className="max-h-[60dvh] overflow-y-auto px-5 pb-8">
          <h3 id="invite-match-title" className="t-title-sm mt-2">
            {t('events.inviteMatch')}
          </h3>
          <p className="t-caption mt-1" style={{ color: 'var(--text-secondary)' }}>
            {t('events.inviteCaption')}
          </p>
          <div className="mt-4 flex flex-col gap-2">
            {matchesQuery.isLoading &&
              [0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="skeleton-shimmer h-14 rounded-2xl"
                  style={{ background: 'var(--field)' }}
                />
              ))}
            {matchesQuery.data?.matches.map((entry) => {
              const name = entry.otherProfile?.displayName ?? t('matches.defaultName');
              const photo = entry.otherProfile?.photos?.[0];
              return (
                <button
                  key={entry.match.id}
                  type="button"
                  disabled={invite.isPending}
                  className="flex min-h-[56px] items-center gap-3 rounded-2xl px-3 py-2 text-left disabled:opacity-60"
                  style={{ background: 'var(--field)' }}
                  onClick={() => {
                    if (!event) return;
                    invite.mutate(
                      { eventId: event.id, matchId: entry.match.id },
                      {
                        onSuccess: () => {
                          setPickerOpen(false);
                          onToast(t('events.inviteSent', { name }));
                        },
                        onError: () => {
                          onToast(t('events.inviteError'));
                        },
                      },
                    );
                  }}
                >
                  {photo ? (
                    <img
                      src={photo}
                      alt={name}
                      className="h-10 w-10 rounded-full object-cover"
                    />
                  ) : (
                    <div
                      className="h-10 w-10 rounded-full"
                      style={{ background: 'var(--field-focus)' }}
                    />
                  )}
                  <span className="t-value font-bold" style={{ color: 'var(--text)' }}>
                    {name}
                  </span>
                </button>
              );
            })}
            {matchesQuery.data && matchesQuery.data.matches.length === 0 && (
              <p className="t-caption py-3" style={{ color: 'var(--text-secondary)' }}>
                {t('events.noMatches')}
              </p>
            )}
          </div>
        </div>
      </GlassSheet>
    </>
  );
}
