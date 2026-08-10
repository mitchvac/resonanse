import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { motion, AnimatePresence } from 'framer-motion';
import { Archive, Search, X } from 'lucide-react';
import BrandMark from '@/components/BrandMark';
import GlassCard from '@/components/GlassCard';
import TabBar from '@/components/TabBar';
import { BtnDanger, BtnGlass, BtnPrimary } from '@/components/ui/buttons';
import GlassSheet from '@/components/GlassSheet';
import NewMatchesRail from '@/components/matches/NewMatchesRail';
import ConversationRow, {
  type OutcomeChipKind,
} from '@/components/matches/ConversationRow';
import SafetySheet from '@/components/chat/SafetySheet';
import { useToast, Toast } from '@/components/chat/Toast';
import { trpc } from '@/providers/trpc';
import { useAuth } from '@/hooks/useAuth';
import { firstNameOf, type MatchEntry } from '@/components/chat/types';

const WINDOW_MS = 48 * 60 * 60 * 1000;

/** Skeleton glass block (§7.2 — shimmer pulse). */
function Skeleton({ className }: { className: string }) {
  return (
    <div
      className={`animate-pulse rounded-[20px] ${className}`}
      style={{ background: 'var(--field)' }}
      aria-hidden="true"
    />
  );
}

export default function Matches() {
  const { t } = useTranslation('connect');
  const navigate = useNavigate();
  const { user } = useAuth();
  const myUserId = user?.id ?? null;
  const { toast, showToast } = useToast();
  const utils = trpc.useUtils();

  const [showArchived, setShowArchived] = useState(false);

  const listQuery = trpc.matches.list.useQuery(
    { includeArchived: showArchived },
    {
      refetchOnWindowFocus: false,
      retry: false,
    },
  );
  const entries = useMemo(() => listQuery.data?.matches ?? [], [listQuery.data]);

  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [reportEntry, setReportEntry] = useState<MatchEntry | null>(null);
  const [removeEntry, setRemoveEntry] = useState<MatchEntry | null>(null);
  const [pullY, setPullY] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const touchStart = useRef<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const setArchivedMut = trpc.matches.setArchived.useMutation({
    onSuccess: (_d, vars) => {
      showToast(vars.archived ? t('matches.toastArchived') : t('matches.toastUnarchived'));
      void utils.matches.list.invalidate();
    },
    onError: () => showToast(t('matches.toastUpdateError')),
  });
  const setMutedMut = trpc.matches.setMuted.useMutation({
    onSuccess: (_d, vars) => {
      showToast(vars.muted ? t('matches.toastMuted') : t('matches.toastNotificationsOn'));
      void utils.matches.list.invalidate();
    },
    onError: () => showToast(t('matches.toastUpdateError')),
  });
  const removeMut = trpc.matches.remove.useMutation({
    onSuccess: () => {
      showToast(t('matches.toastRemoved'));
      setRemoveEntry(null);
      void utils.matches.list.invalidate();
      void utils.chat.messages.invalidate();
    },
    onError: () => showToast(t('matches.toastRemoveError')),
  });

  /* §1 New matches rail: no conversation yet, inside the 48h window */
  const newMatches = useMemo(
    () =>
      entries.filter(
        (e) =>
          !e.lastMessage &&
          Date.now() - new Date(e.match.createdAt).getTime() < WINDOW_MS &&
          !e.archivedAt,
      ),
    [entries],
  );

  /* §2 Active conversations */
  const conversations = useMemo(() => {
    const q = query.trim().toLowerCase();
    return entries.filter(
      (e) =>
        e.lastMessage &&
        !e.archivedAt &&
        (!q || (e.otherProfile?.displayName ?? '').toLowerCase().includes(q)),
    );
  }, [entries, query]);

  /* Archived conversations — only fetched/listed in the Archived view */
  const archivedConversations = useMemo(
    () => entries.filter((e) => e.archivedAt && e.lastMessage),
    [entries],
  );

  const hasUnread = useMemo(
    () =>
      conversations.some(
        (e) => e.lastMessage && e.lastMessage.senderId !== myUserId,
      ),
    [conversations, myUserId],
  );

  const openChat = (entry: MatchEntry, starters = false) => {
    const id = entry.conversationId ?? entry.match.id;
    navigate(`/chat/${id}${starters ? '?starters=1' : ''}`);
  };

  const chipFor = (entry: MatchEntry): OutcomeChipKind | null => {
    if (entry.match.weMet !== 'none') return 'wemet';
    if (entry.lastMessage?.kind === 'date_idea') return 'date';
    if (entry.lastMessage && entry.lastMessage.senderId !== myUserId) return 'replied';
    return null;
  };

  /* Goal progress (§3): dates this week vs 1/week goal */
  const datesThisWeek = useMemo(() => {
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    return entries.filter(
      (e) =>
        e.match.weMet !== 'none' &&
        new Date(e.match.createdAt).getTime() > weekAgo,
    ).length;
  }, [entries]);

  /* Pull-to-refresh (§2) */
  const onTouchStart = (e: React.TouchEvent) => {
    if (scrollRef.current && scrollRef.current.scrollTop <= 0) {
      touchStart.current = e.touches[0].clientY;
    } else {
      touchStart.current = null;
    }
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (touchStart.current === null) return;
    const dy = e.touches[0].clientY - touchStart.current;
    setPullY(Math.max(0, Math.min(72, dy * 0.5)));
  };
  const onTouchEnd = () => {
    if (pullY > 48) {
      setRefreshing(true);
      void utils.matches.list.invalidate().finally(() => {
        setRefreshing(false);
        setPullY(0);
      });
    } else {
      setPullY(0);
    }
    touchStart.current = null;
  };

  const otherUserIdOf = (entry: MatchEntry) =>
    entry.match.userAId === myUserId ? entry.match.userBId : entry.match.userAId;
  const removeName = firstNameOf(removeEntry?.otherProfile?.displayName, t('chat.them'));

  const isLoading = listQuery.isLoading;
  const isEmpty = !isLoading && entries.length === 0;

  return (
    <div className="relative flex h-full min-h-[100dvh] flex-col md:min-h-0">
      <Toast toast={toast} />

      {/* Header: t-heading + inline expanding search (§Header) */}
      <header className="flex items-center gap-2 px-5 pb-3 pt-2">
        <AnimatePresence mode="wait">
          {!searchOpen && (
            <motion.h1
              key="title"
              className="t-heading flex-1"
              style={{ color: 'var(--text-ink)' }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.24 }}
            >
              {t('matches.header')}
            </motion.h1>
          )}
        </AnimatePresence>
        <AnimatePresence>
          {searchOpen && (
            <motion.div
              key="search"
              className="flex-1 overflow-hidden"
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: '100%', opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
            >
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('matches.searchPlaceholder')}
                className="t-body h-11 w-full rounded-2xl px-4 outline-none focus:ring-1 focus:ring-[var(--violet)]"
                style={{ background: 'var(--field)', color: 'var(--text)' }}
                aria-label={t('matches.searchAria')}
              />
            </motion.div>
          )}
        </AnimatePresence>
        <button
          type="button"
          onClick={() => setShowArchived((v) => !v)}
          className="flex h-11 w-11 min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-full"
          style={{
            background: 'var(--field)',
            color: 'var(--text)',
            boxShadow: showArchived ? 'inset 0 0 0 1.5px var(--violet)' : 'none',
          }}
          aria-label={showArchived ? t('matches.hideArchived') : t('matches.showArchived')}
          aria-pressed={showArchived}
        >
          <Archive size={18} aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={() => {
            setSearchOpen((o) => !o);
            if (searchOpen) setQuery('');
          }}
          className="flex h-11 w-11 min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-full"
          style={{ background: 'var(--field)', color: 'var(--text)' }}
          aria-label={searchOpen ? t('matches.closeSearch') : t('matches.searchAria')}
          aria-expanded={searchOpen}
        >
          {searchOpen ? <X size={18} aria-hidden="true" /> : <Search size={18} aria-hidden="true" />}
        </button>
      </header>

      {/* Scrollable column */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto pb-32"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        {/* Pull-to-refresh indicator */}
        <div
          className="flex items-center justify-center overflow-hidden transition-[height] duration-fast"
          style={{ height: refreshing ? 40 : pullY * 0.6 }}
          aria-hidden="true"
        >
          <span
            className={refreshing ? 't-caption animate-pulse' : 't-caption'}
            style={{ color: 'var(--text-secondary)', opacity: refreshing ? 1 : pullY / 48 }}
          >
            {refreshing ? t('matches.refreshing') : t('matches.releaseToRefresh')}
          </span>
        </div>

        {isLoading && (
          <div className="flex flex-col gap-3 px-5 pt-2">
            <div className="flex gap-4">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-[72px] w-[72px] shrink-0 !rounded-full" />
              ))}
            </div>
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-[72px] w-full" />
            ))}
          </div>
        )}

        {!isLoading && !isEmpty && (
          <motion.div
            className="flex flex-col gap-6 pt-1"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
          >
            {newMatches.length > 0 && (
              <NewMatchesRail
                entries={newMatches}
                onOpen={(e) => openChat(e, true)}
                onRemove={(e) => setRemoveEntry(e)}
              />
            )}

            {/* §2 Active conversations */}
            {conversations.length > 0 && (
              <section aria-label={t('matches.conversations')} className="flex flex-col gap-2 px-5">
                {conversations.map((entry, i) => (
                  <ConversationRow
                    key={entry.match.id}
                    entry={entry}
                    index={i}
                    myUserId={myUserId}
                    active={(entry.otherProfile?.id ?? 1) % 2 === 0}
                    chip={chipFor(entry)}
                    muted={!!entry.mutedAt}
                    onOpen={() => openChat(entry)}
                    onArchive={() => {
                      if (entry.conversationId) {
                        setArchivedMut.mutate({ conversationId: entry.conversationId, archived: true });
                      }
                    }}
                    onMute={() => {
                      if (entry.conversationId) {
                        setMutedMut.mutate({
                          conversationId: entry.conversationId,
                          muted: !entry.mutedAt,
                        });
                      }
                    }}
                    onReport={() => setReportEntry(entry)}
                    onRemove={() => setRemoveEntry(entry)}
                  />
                ))}
              </section>
            )}

            {/* Archived view — fetched via includeArchived, rows offer Unarchive */}
            {showArchived && archivedConversations.length > 0 && (
              <section aria-label={t('matches.archivedConversations')} className="flex flex-col gap-2 px-5">
                <p className="t-eyebrow">{t('matches.archived')}</p>
                {archivedConversations.map((entry, i) => (
                  <ConversationRow
                    key={entry.match.id}
                    entry={entry}
                    index={i}
                    myUserId={myUserId}
                    active={false}
                    chip={chipFor(entry)}
                    muted={!!entry.mutedAt}
                    archived
                    onOpen={() => openChat(entry)}
                    onArchive={() => {
                      if (entry.conversationId) {
                        setArchivedMut.mutate({ conversationId: entry.conversationId, archived: false });
                      }
                    }}
                    onMute={() => {
                      if (entry.conversationId) {
                        setMutedMut.mutate({
                          conversationId: entry.conversationId,
                          muted: !entry.mutedAt,
                        });
                      }
                    }}
                    onReport={() => setReportEntry(entry)}
                    onRemove={() => setRemoveEntry(entry)}
                  />
                ))}
              </section>
            )}

            {/* §3 Goal progress card — after 4+ conversation rows */}
            {conversations.length >= 4 && (
              <section className="px-5" aria-label={t('matches.yourGoal')}>
                <GlassCard edge="none" className="px-[22px] py-5">
                  <p className="t-eyebrow">{t('matches.goalTitle')}</p>
                  <div className="mt-2 flex items-baseline gap-2">
                    <motion.span
                      className="t-title-sm"
                      initial={{ opacity: 0 }}
                      whileInView={{ opacity: 1 }}
                      viewport={{ once: true, amount: 0.2 }}
                      transition={{ duration: 0.6 }}
                    >
                      {t('matches.goalProgress', { count: Math.min(datesThisWeek, 1) })}
                    </motion.span>
                  </div>
                  <div
                    className="mt-3 h-1 w-full overflow-hidden rounded-full"
                    style={{ background: 'var(--field)' }}
                  >
                    <motion.div
                      className="h-full rounded-full"
                      style={{ background: 'var(--violet)' }}
                      initial={{ width: 0 }}
                      whileInView={{ width: `${Math.min(datesThisWeek, 1) * 100}%` }}
                      viewport={{ once: true, amount: 0.2 }}
                      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                    />
                  </div>
                  <p className="t-caption mt-3" style={{ color: 'var(--text-secondary)' }}>
                    {t('matches.goalCaption')}
                  </p>
                </GlassCard>
              </section>
            )}
          </motion.div>
        )}

        {/* §4 Empty state */}
        {isEmpty && (
          <motion.div
            className="flex h-full flex-col items-center justify-center gap-4 px-10 text-center"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
          >
            <BrandMark size={64} />
            <h2 className="t-title-sm" style={{ color: 'var(--text-ink)' }}>
              {t('matches.emptyTitle')}
            </h2>
            <p className="t-body" style={{ color: 'var(--text-secondary)' }}>
              {t('matches.emptyBody')}
            </p>
            <BtnPrimary to="/discover" className="mt-2">
              {t('matches.emptyCta')}
            </BtnPrimary>
          </motion.div>
        )}
      </div>

      {/* Remove match — explicit, quiet, user-owned. */}
      <GlassSheet
        open={!!removeEntry}
        onClose={() => (removeMut.isPending ? undefined : setRemoveEntry(null))}
        labelledBy="remove-match-title"
      >
        <div className="px-5 pb-6 pt-1">
          <h2 id="remove-match-title" className="t-title" style={{ color: 'var(--text)' }}>
            {t('matches.removeTitle', { name: removeName })}
          </h2>
          <p className="t-body mt-2" style={{ color: 'var(--text-secondary)' }}>
            {t('matches.removeBody')}
          </p>
          <div className="mt-5 flex gap-3">
            <BtnGlass
              className="flex-1"
              onClick={() => setRemoveEntry(null)}
              disabled={removeMut.isPending}
            >
              {t('matches.keep')}
            </BtnGlass>
            <BtnDanger
              className="flex-1"
              disabled={!removeEntry || removeMut.isPending}
              onClick={() => {
                if (removeEntry) removeMut.mutate({ matchId: removeEntry.match.id });
              }}
            >
              {removeMut.isPending ? t('matches.removing') : t('matches.remove')}
            </BtnDanger>
          </div>
        </div>
      </GlassSheet>

      {/* Swipe-report — reason chips + block, same pattern as chat safety */}
      <SafetySheet
        open={!!reportEntry}
        onClose={() => setReportEntry(null)}
        peerUserId={reportEntry ? otherUserIdOf(reportEntry) : null}
        peerName={reportEntry?.otherProfile?.displayName}
        onToast={showToast}
      />

      <TabBar hasUnreadChat={hasUnread} />
    </div>
  );
}
