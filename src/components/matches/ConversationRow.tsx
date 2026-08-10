import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { Archive, ArchiveRestore, BellOff, Bell, Check, Flag, MapPin, Timer, UserX } from 'lucide-react';
import type { MatchEntry } from '@/components/chat/types';
import { relTime } from '@/components/chat/types';
import { cn } from '@/lib/utils';

export type OutcomeChipKind = 'replied' | 'date' | 'wemet';

/**
 * OutcomeChip — matches.md §2 (the differentiator): micro pills —
 * "Replied" (violet text) / "Date planned" (--ok text + pin) /
 * "We Met ✓" (--ok filled dot).
 */
export function OutcomeChip({ kind }: { kind: OutcomeChipKind }) {
  const { t } = useTranslation('connect');
  if (kind === 'wemet') {
    return (
      <span className="t-micro flex items-center gap-1 font-bold" style={{ color: 'var(--ok)' }}>
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: 'var(--ok)' }} aria-hidden="true" />
        {t('matches.chipWeMet')}
      </span>
    );
  }
  if (kind === 'date') {
    return (
      <span className="t-micro flex items-center gap-1 font-bold" style={{ color: 'var(--ok)' }}>
        <MapPin size={9} aria-hidden="true" />
        {t('matches.chipDatePlanned')}
      </span>
    );
  }
  return (
    <span className="t-micro font-bold" style={{ color: 'var(--violet)' }}>
      {t('matches.chipReplied')}
    </span>
  );
}

/** Typing state — three dots bouncing (translateY 2px, 600ms loop, 120ms stagger). */
function TypingDots() {
  const { t } = useTranslation('connect');
  return (
    <span className="flex items-center gap-1 py-1" aria-label={t('matches.typing')}>
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="h-1.5 w-1.5 rounded-full"
          style={{ background: 'var(--text-secondary)' }}
          animate={{ y: [0, -2, 0] }}
          transition={{ duration: 0.6, repeat: Infinity, delay: 0.12 * i }}
        />
      ))}
    </span>
  );
}

/**
 * ConversationRow — matches.md §2
 * 72px row, var(--field) fill (no individual blur). 56px avatar + presence
 * dot (--ok when active) + ephemeral icon in vanish mode. Name t-value 700 +
 * last-message preview t-caption secondary (1-line truncate). Right:
 * timestamp t-caption + outcome chip. Swipe left → quick actions (archive /
 * mute / report) slide in 200ms.
 */
export default function ConversationRow({
  entry,
  myUserId,
  active,
  chip,
  typing,
  unread,
  muted = false,
  archived = false,
  index,
  onOpen,
  onArchive,
  onMute,
  onReport,
  onRemove,
}: {
  entry: MatchEntry;
  myUserId: number | null;
  active: boolean;
  chip: OutcomeChipKind | null;
  typing?: boolean;
  unread?: number;
  muted?: boolean;
  archived?: boolean;
  index: number;
  onOpen: () => void;
  onArchive: () => void;
  onMute: () => void;
  onReport: () => void;
  onRemove: () => void;
}) {
  const { t } = useTranslation('connect');
  const [open, setOpen] = useState(false);
  const profile = entry.otherProfile;
  const photo = profile?.photos?.[0] ?? '/avatar-01.jpg';
  const name = profile?.displayName?.split(' ')[0] ?? t('matches.defaultName');
  const last = entry.lastMessage;
  const previewText = last
    ? last.kind === 'date_idea'
      ? t('matches.previewDateIdea')
      : last.kind === 'video_note'
        ? t('matches.previewVideoNote')
        : last.content
    : '';
  const preview = typing
    ? null
    : last
      ? last.senderId === myUserId
        ? t('matches.previewYou', { content: previewText })
        : previewText
      : t('matches.previewSayHello');

  return (
    <motion.div
      className="relative overflow-hidden rounded-[20px]"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.05 * index, duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
    >
      {/* Quick actions revealed behind (slide in 200ms) */}
      <div className="absolute inset-y-0 right-0 flex items-center gap-2 pr-3" aria-hidden={!open}>
        {[
          archived
            ? { icon: ArchiveRestore, label: t('matches.actionUnarchive'), fn: onArchive, danger: false }
            : { icon: Archive, label: t('matches.actionArchive'), fn: onArchive, danger: false },
          { icon: muted ? Bell : BellOff, label: muted ? t('matches.actionUnmute') : t('matches.actionMute'), fn: onMute, danger: false },
          { icon: Flag, label: t('matches.actionReport'), fn: onReport, danger: true },
          { icon: UserX, label: t('matches.actionRemove'), fn: onRemove, danger: true },
        ].map((a) => (
          <button
            key={a.label}
            type="button"
            tabIndex={open ? 0 : -1}
            onClick={() => {
              a.fn();
              setOpen(false);
            }}
            className="flex h-10 w-10 min-h-[44px] min-w-[44px] items-center justify-center rounded-full"
            style={{
              background: 'var(--glass-a)',
              border: 'var(--glass-quiet-border)',
              color: a.danger ? 'var(--danger)' : 'var(--text)',
            }}
            aria-label={a.label}
          >
            <a.icon size={16} aria-hidden="true" />
          </button>
        ))}
      </div>

      <motion.button
        type="button"
        onClick={() => (open ? setOpen(false) : onOpen())}
        drag="x"
        dragConstraints={{ left: -196, right: 0 }}
        dragElastic={0.08}
        onDragEnd={(_, info) => setOpen(info.offset.x < -60)}
        animate={{ x: open ? -196 : 0 }}
        transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
        className="relative flex h-[72px] w-full items-center gap-3 rounded-[20px] px-3 text-left"
        // Opaque composite: --field is translucent Warm Glass, so on its own
        // the swipe-action buttons behind the row bleed through and look
        // permanently visible. Layering --field over --stage-base keeps the
        // exact same tint (the stage is behind every row anyway) while making
        // the row opaque — actions appear only when the row slides left.
        style={{ background: 'linear-gradient(var(--field), var(--field)), var(--stage-base)' }}
        aria-label={t('matches.chatWith', { name })}
      >
        <span className="relative shrink-0">
          <img
            src={photo}
            alt={name}
            className="h-14 w-14 rounded-full object-cover"
            loading="lazy"
          />
          {active && (
            <span
              className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full"
              style={{ background: 'var(--ok)', boxShadow: '0 0 0 2px var(--stage-base)' }}
              aria-label={t('matches.activeNow')}
            />
          )}
          {entry.ephemeral && (
            <span
              className="absolute -left-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full"
              style={{ background: 'var(--stage-base)', color: 'var(--warn)' }}
              aria-label={t('matches.vanishOn')}
            >
              <Timer size={11} aria-hidden="true" />
            </span>
          )}
        </span>

        <span className="min-w-0 flex-1">
          <span className="t-value flex items-center gap-1 truncate font-bold" style={{ color: 'var(--text)' }}>
            <span className="truncate">{name}</span>
            {muted && (
              <BellOff
                size={12}
                className="shrink-0"
                style={{ color: 'var(--text-secondary)' }}
                aria-label={t('matches.notificationsMuted')}
              />
            )}
            {entry.match.videoVerifiedAt && (
              <span
                className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full"
                style={{ background: 'var(--ok)' }}
                aria-label={t('matches.videoVerified')}
                role="img"
              >
                <Check size={9} strokeWidth={3.5} color="#fff" aria-hidden="true" />
              </span>
            )}
          </span>
          {typing ? (
            <TypingDots />
          ) : (
            <span
              className={cn('t-caption block truncate', unread ? 'font-bold' : '')}
              style={{ color: unread ? 'var(--text)' : 'var(--text-secondary)' }}
            >
              {preview}
            </span>
          )}
        </span>

        <span className="flex shrink-0 flex-col items-end justify-center gap-1">
          <span className="t-caption" style={{ color: 'var(--text-secondary)' }}>
            {last ? relTime(last.createdAt, t) : ''}
          </span>
          {chip && <OutcomeChip kind={chip} />}
          {unread ? (
            <motion.span
              className="flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold leading-none text-white"
              style={{ background: 'var(--violet)' }}
              initial={{ scale: 0.6 }}
              animate={{ scale: 1 }}
              transition={{ duration: 0.24, ease: [0.34, 1.56, 0.64, 1] }}
              aria-label={t('matches.unreadCount', { count: unread })}
            >
              {unread}
            </motion.span>
          ) : null}
        </span>
      </motion.button>
    </motion.div>
  );
}
