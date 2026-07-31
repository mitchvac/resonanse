import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronLeft,
  BadgeCheck,
  Video,
  Shield,
  ShieldAlert,
  X,
  PhoneOff,
} from 'lucide-react';
import GlassSheet from '@/components/GlassSheet';
import { BtnPrimary } from '@/components/ui/buttons';
import MessageBubble, { SystemBubble } from '@/components/chat/MessageBubble';
import DateIdeaThreadCard, { type DateMeta } from '@/components/chat/DateIdeaThreadCard';
import WeMetCard from '@/components/chat/WeMetCard';
import StartersTray from '@/components/chat/StartersTray';
import DateIdeasSheet from '@/components/chat/DateIdeasSheet';
import SafetySheet from '@/components/chat/SafetySheet';
import Composer from '@/components/chat/Composer';
import { Toast, useToast } from '@/components/chat/Toast';
import type { ChatMessage } from '@/components/chat/types';
import {
  clockTime,
  dayLabel,
  firstNameOf,
  sameDay,
} from '@/components/chat/types';
import { trpc } from '@/providers/trpc';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';

const GOAL_LABEL: Record<string, string> = {
  serious: 'Serious',
  casual: 'Casual',
  explore: 'Explore',
  enm: 'ENM',
  friendship: 'Friendship',
};

const DAY_MS = 24 * 60 * 60 * 1000;

/** Day divider — centered micro label pill (chat.md §2). */
function DayDivider({ label }: { label: string }) {
  return (
    <div className="flex justify-center py-1">
      <span
        className="t-micro rounded-full px-3 py-1"
        style={{ background: 'var(--field)', color: 'var(--text-secondary)' }}
      >
        {label}
      </span>
    </div>
  );
}

/** Peer typing indicator — glass bubble with bouncing dots. */
function TypingBubble() {
  return (
    <motion.div
      className="flex justify-start"
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      aria-label="Typing"
    >
      <span
        className="flex items-center gap-1 rounded-[24px] rounded-bl-[4px] px-4 py-3"
        style={{
          background: 'var(--glass-a)',
          border: 'var(--glass-quiet-border)',
          boxShadow: 'var(--glass-hi), var(--glass-lo)',
        }}
      >
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
    </motion.div>
  );
}

export default function Chat() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const myUserId = user?.id ?? null;
  const { toast, showToast } = useToast();
  const utils = trpc.useUtils();

  const paramId = Number(id);

  /* Resolve :id — it may be a conversation id OR a match id (chat.md) */
  const matchesQuery = trpc.matches.list.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
  });
  const matchEntry = matchesQuery.data?.matches.find(
    (e) => e.conversationId === paramId || e.match.id === paramId,
  );
  const conversationId = matchEntry?.conversationId ?? paramId;

  const chatQuery = trpc.chat.messages.useQuery(
    { conversationId },
    { retry: false, enabled: Number.isFinite(conversationId) && conversationId > 0 },
  );
  const meQuery = trpc.profile.me.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
  });

  const conversation = chatQuery.data?.conversation;
  const match = chatQuery.data?.match;
  const peer = chatQuery.data?.peer ?? matchEntry?.otherProfile ?? null;
  const peerName = firstNameOf(peer?.displayName);
  const peerPhoto = peer?.photos?.[0] ?? '/avatar-01.jpg';

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [peerTyping, setPeerTyping] = useState(false);
  const [ephemeral, setEphemeral] = useState(false);
  const [startersOpen, setStartersOpen] = useState(false);
  const [usedStarter, setUsedStarter] = useState(false);
  const [dateSheetOpen, setDateSheetOpen] = useState(false);
  const [safetyOpen, setSafetyOpen] = useState(false);
  const [videoSheetOpen, setVideoSheetOpen] = useState(false);
  const [videoCall, setVideoCall] = useState(false);
  const [showWeMet, setShowWeMet] = useState(false);
  const [acceptedTime, setAcceptedTime] = useState<string | undefined>();
  const [safetyBarDismissed, setSafetyBarDismissed] = useState(true);

  const streamRef = useRef<HTMLDivElement>(null);
  const localId = useRef(-1);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const later = (fn: () => void, ms: number) => {
    timers.current.push(setTimeout(fn, ms));
  };
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  /* Sync server messages into local stream state */
  useEffect(() => {
    if (chatQuery.data) setMessages(chatQuery.data.messages);
  }, [chatQuery.data]);

  /* Sync ephemeral flag from the conversation */
  useEffect(() => {
    if (conversation) setEphemeral(conversation.ephemeral);
  }, [conversation]);

  /* Safety context bar — first 24h of any match, remembered per thread (§1) */
  useEffect(() => {
    if (!match) return;
    const key = `chat-safety-${match.id}`;
    const dismissed = window.localStorage.getItem(key) === '1';
    const fresh = Date.now() - new Date(match.createdAt).getTime() < DAY_MS;
    setSafetyBarDismissed(dismissed || !fresh);
  }, [match]);

  /* Starters tray: thread new or stale (48h), or pre-opened from the rail (§3) */
  useEffect(() => {
    if (searchParams.get('starters') === '1') {
      setStartersOpen(true);
      return;
    }
    if (!chatQuery.data) return;
    const last = chatQuery.data.messages.at(-1);
    const stale = !last || Date.now() - new Date(last.createdAt).getTime() > 2 * DAY_MS;
    setStartersOpen(stale);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatQuery.data]);

  /* Auto-scroll the stream */
  useEffect(() => {
    const el = streamRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, peerTyping, showWeMet, videoCall]);

  const sendMut = trpc.chat.send.useMutation();
  const proposeMut = trpc.chat.proposeDate.useMutation();
  const ephemeralMut = trpc.chat.setEphemeral.useMutation();

  const closed = !!chatQuery.error;

  /* ---- Send (§7) — outgoing slides in, seed replies after typing dots ---- */
  const handleSend = () => {
    const content = draft.trim();
    if (!content || sendMut.isPending) return;
    setDraft('');
    sendMut.mutate(
      { conversationId, content },
      {
        onSuccess: ({ message, reply }) => {
          setMessages((m) => [...m, message]);
          if (usedStarter) {
            setUsedStarter(false);
            setStartersOpen(false);
            showToast('Nice.');
          }
          if (reply) {
            setPeerTyping(true);
            later(() => {
              setPeerTyping(false);
              setMessages((m) => [...m, reply]);
            }, 1200);
          }
        },
        onError: () => showToast("Couldn't send — check your connection."),
      },
    );
  };

  /* ---- Date ideas (§4) ---- */
  const markDateStatus = (messageId: number, status: 'accepted' | 'declined', time?: string) => {
    setMessages((ms) =>
      ms.map((m) =>
        m.id === messageId
          ? { ...m, meta: { ...(m.meta as DateMeta), status, time: time ?? (m.meta as DateMeta)?.time } }
          : m,
      ),
    );
    if (status === 'accepted') {
      setAcceptedTime(time);
      showToast(`Date planned${time ? ` · ${time}` : ''} — added to your calendar`);
      /* 24h post-date both get the We Met card — the demo compresses the wait */
      later(() => setShowWeMet(true), 3200);
    } else {
      showToast('Declined — no pressure.');
    }
  };

  const handlePropose = (input: {
    title: string;
    emoji?: string;
    description?: string;
    location?: string;
    time?: string;
  }) => {
    proposeMut.mutate(
      { conversationId, ...input },
      {
        onSuccess: ({ message }) => {
          setMessages((m) => [...m, message]);
          setDateSheetOpen(false);
          showToast('Date idea sent.');
          /* Seed matches accept in the demo, driving the accept → We Met loop */
          later(() => markDateStatus(message.id, 'accepted', input.time), 2400);
        },
        onError: () => showToast("Couldn't send the date idea."),
      },
    );
  };

  /* ---- Ephemeral mode (§5) ---- */
  const toggleEphemeral = () => {
    const next = !ephemeral;
    setEphemeral(next);
    ephemeralMut.mutate({ conversationId, ephemeral: next });
    if (next) {
      showToast('Messages disappear 24h after being read.');
      /* Screenshot-detection demo: the peer screenshots vanish-mode chat */
      later(() => {
        setMessages((m) => [
          ...m,
          {
            id: localId.current--,
            conversationId,
            senderId: 0,
            kind: 'system',
            content: `${peerName} took a screenshot · ${clockTime(new Date())}`,
            meta: null,
            createdAt: new Date(),
          } as unknown as ChatMessage,
        ]);
        showToast('Screenshot detected', <ShieldAlert size={13} style={{ color: 'var(--danger)' }} />);
      }, 6000);
    }
  };

  /* ---- Video check (§6) ---- */
  const sendVideoInvite = () => {
    setVideoSheetOpen(false);
    showToast('Video-check invite sent.');
    later(() => setVideoCall(true), 2000);
  };

  /* ---- We Met (§6) ---- */
  const matchId = match?.id ?? matchEntry?.match.id ?? 0;

  /* Peer presence — deterministic for seed profiles */
  const activeNow = (peer?.id ?? 1) % 2 === 0;

  /* Mutual-context chips (thread top, once) */
  const peerChips = peer
    ? [GOAL_LABEL[peer.relationshipGoal] ?? 'Explore', peer.desires?.[0]].filter(Boolean)
    : [];
  const myProfile = meQuery.data?.profile;
  const myChips = myProfile
    ? [GOAL_LABEL[myProfile.relationshipGoal] ?? 'Explore', myProfile.desires?.[0]].filter(Boolean)
    : [];

  /* Read ticks: own message is read when a later peer message exists */
  const tickFor = (m: ChatMessage, i: number) => {
    if (m.senderId !== myUserId) return undefined;
    const read = messages.slice(i + 1).some((x) => x.senderId !== myUserId && x.kind !== 'system');
    return read ? ('read' as const) : ('delivered' as const);
  };

  const showSafetyBar = !safetyBarDismissed && !closed;

  return (
    <div className="relative flex h-full min-h-[100dvh] flex-col md:min-h-0">
      <Toast toast={toast} />

      {/* Glass top bar (pushed route — TabBar hidden) */}
      <div className="px-3 pt-1">
        <div className="glass rounded-[24px] px-2.5 py-2">
          <div className="glass-content flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => navigate('/matches')}
              className="flex h-10 w-10 min-h-[44px] min-w-[44px] items-center justify-center rounded-full"
              style={{ color: 'var(--text)' }}
              aria-label="Back to matches"
            >
              <ChevronLeft size={20} aria-hidden="true" />
            </button>
            <span className="relative shrink-0">
              <img
                src={peerPhoto}
                alt={peerName}
                className={cn('h-10 w-10 rounded-full object-cover', ephemeral && 'ring-2')}
                style={ephemeral ? ({ '--tw-ring-color': 'var(--warn)' } as React.CSSProperties) : undefined}
              />
              {ephemeral && (
                <span
                  className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full"
                  style={{ background: 'var(--warn)' }}
                  aria-label="Vanish mode on"
                />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <p className="t-value flex items-center gap-1 truncate font-bold" style={{ color: 'var(--text)' }}>
                {peerName}
                {peer?.verified && (
                  <BadgeCheck size={16} style={{ color: 'var(--violet)' }} aria-label="Verified" />
                )}
              </p>
              {activeNow && (
                <p className="t-caption flex items-center gap-1" style={{ color: 'var(--text-secondary)' }}>
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: 'var(--ok)' }} aria-hidden="true" />
                  Active now
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => setVideoSheetOpen(true)}
              className="flex h-10 w-10 min-h-[44px] min-w-[44px] items-center justify-center rounded-full"
              style={{ color: 'var(--text)' }}
              aria-label="Video check"
            >
              <Video size={18} aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => setSafetyOpen(true)}
              className="flex h-10 w-10 min-h-[44px] min-w-[44px] items-center justify-center rounded-full"
              style={{ color: 'var(--text)' }}
              aria-label="Safety tools"
            >
              <Shield size={18} aria-hidden="true" />
            </button>
          </div>
        </div>
        {/* Ephemeral underline — slides in 240ms (§5) */}
        <motion.div
          className="mx-6 h-0.5 rounded-full"
          style={{ background: 'var(--warn)' }}
          initial={false}
          animate={{ scaleX: ephemeral ? 1 : 0, opacity: ephemeral ? 1 : 0 }}
          transition={{ duration: 0.24 }}
          aria-hidden="true"
        />
      </div>

      {/* §1 Safety context bar (first 24h of any match, dismissible) */}
      <AnimatePresence>
        {showSafetyBar && (
          <motion.div
            className="mx-3 mt-2 overflow-hidden"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
          >
            <div
              className="flex items-center gap-2 rounded-2xl px-3.5 py-2.5"
              style={{
                background: 'var(--glass-a)',
                border: 'var(--glass-quiet-border)',
                color: 'var(--text)',
              }}
            >
              <Shield size={14} className="shrink-0" style={{ color: 'var(--violet)' }} aria-hidden="true" />
              <p className="t-caption flex-1" style={{ color: 'var(--text-secondary)' }}>
                Keep chats in-app until you feel safe. {peerName} can't see your exact location.
              </p>
              <button
                type="button"
                onClick={() => {
                  setSafetyBarDismissed(true);
                  if (match) window.localStorage.setItem(`chat-safety-${match.id}`, '1');
                }}
                className="flex h-8 w-8 min-h-[44px] min-w-[44px] items-center justify-center"
                style={{ color: 'var(--text-secondary)' }}
                aria-label="Dismiss safety note"
              >
                <X size={14} aria-hidden="true" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Ephemeral micro banner (§5) */}
      <AnimatePresence>
        {ephemeral && !closed && (
          <motion.p
            className="t-caption mt-2 text-center"
            style={{ color: 'var(--warn)' }}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            Messages disappear 24h after being read.
          </motion.p>
        )}
      </AnimatePresence>

      {/* §2 Message stream */}
      <div ref={streamRef} className="flex-1 overflow-y-auto px-4 pb-3 pt-3">
        {chatQuery.isLoading && (
          <div className="flex flex-col gap-3 pt-6">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className={cn('h-12 animate-pulse rounded-[24px]', i % 2 ? 'ml-auto w-2/3' : 'w-3/4')}
                style={{ background: 'var(--field)' }}
                aria-hidden="true"
              />
            ))}
          </div>
        )}

        {closed && (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <Shield size={28} style={{ color: 'var(--text-secondary)' }} aria-hidden="true" />
            <p className="t-body" style={{ color: 'var(--text-secondary)' }}>
              This conversation is closed.
            </p>
            <BtnPrimary to="/matches" className="h-11">
              Back to matches
            </BtnPrimary>
          </div>
        )}

        {!chatQuery.isLoading && !closed && (
          <div className="flex flex-col gap-2.5">
            {/* Mutual-context chips — render once at thread top */}
            {(peerChips.length > 0 || myChips.length > 0) && (
              <div className="mb-1 flex flex-wrap items-center justify-center gap-1.5">
                {peerChips.map((c) => (
                  <span
                    key={`p-${c}`}
                    className="t-caption rounded-full px-2.5 py-1"
                    style={{ background: 'var(--field)', color: 'var(--text)' }}
                  >
                    {c}
                  </span>
                ))}
                <span className="t-caption" style={{ color: 'var(--text-secondary)' }} aria-hidden="true">
                  ×
                </span>
                {myChips.map((c) => (
                  <span
                    key={`m-${c}`}
                    className="t-caption rounded-full px-2.5 py-1"
                    style={{ background: 'var(--field)', color: 'var(--text)' }}
                  >
                    {c}
                  </span>
                ))}
              </div>
            )}

            {messages.map((m, i) => {
              const own = m.senderId === myUserId;
              const divider =
                i === 0 || !sameDay(messages[i - 1].createdAt, m.createdAt);
              return (
                <div key={m.id} className="flex flex-col gap-2.5">
                  {divider && <DayDivider label={dayLabel(m.createdAt)} />}
                  {m.kind === 'system' ? (
                    <SystemBubble text={m.content} />
                  ) : m.kind === 'date_idea' ? (
                    <DateIdeaThreadCard
                      message={m}
                      own={own}
                      onAccept={() => markDateStatus(m.id, 'accepted', (m.meta as DateMeta)?.time)}
                      onDecline={() => markDateStatus(m.id, 'declined')}
                    />
                  ) : (
                    <MessageBubble
                      message={m}
                      own={own}
                      tick={tickFor(m, i)}
                      ephemeral={ephemeral}
                      index={Math.max(0, messages.length - i - 1)}
                    />
                  )}
                </div>
              );
            })}

            <AnimatePresence>{peerTyping && <TypingBubble />}</AnimatePresence>

            {/* In-thread video-check card (§6) */}
            <AnimatePresence>
              {videoCall && (
                <motion.div
                  className="relative mx-auto w-full max-w-[320px] overflow-hidden rounded-[24px]"
                  style={{ border: 'var(--glass-quiet-border)' }}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.32 }}
                >
                  <img src={peerPhoto} alt={`${peerName} on video check`} className="h-56 w-full object-cover" />
                  <img
                    src="/self-01.jpg"
                    alt="You on video check"
                    className="absolute bottom-12 right-3 h-20 w-16 rounded-xl border-2 border-white/70 object-cover"
                  />
                  <div className="absolute inset-x-0 bottom-0 flex items-center justify-between px-3 py-2" style={{ background: 'var(--photo-scrim)' }}>
                    <span className="t-caption text-white">Video check · 3:00</span>
                    <button
                      type="button"
                      onClick={() => {
                        setVideoCall(false);
                        showToast('Video check ended.');
                      }}
                      className="flex h-9 w-9 min-h-[44px] min-w-[44px] items-center justify-center rounded-full text-white"
                      style={{ background: 'var(--danger)' }}
                      aria-label="End video check"
                    >
                      <PhoneOff size={15} aria-hidden="true" />
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* §6 We Met card */}
            {showWeMet && matchId > 0 && match?.weMet === 'none' && (
              <WeMetCard
                matchId={matchId}
                peerName={peer?.displayName}
                dateLabel={acceptedTime?.split(' ')[0] ?? 'the date'}
                onToast={showToast}
                onDone={() => {
                  setShowWeMet(false);
                  void utils.matches.list.invalidate();
                }}
              />
            )}
          </div>
        )}
      </div>

      {/* §3 AI starters tray (above input) */}
      {!closed && conversationId > 0 && (
        <StartersTray
          conversationId={conversationId}
          peerName={peerName}
          open={startersOpen}
          onPick={(text) => {
            setDraft(text);
            setUsedStarter(true);
          }}
        />
      )}

      {/* §7 Composer */}
      {!closed && (
        <Composer
          peerName={peerName}
          value={draft}
          onChange={setDraft}
          onSend={handleSend}
          sending={sendMut.isPending}
          ephemeral={ephemeral}
          onToggleEphemeral={toggleEphemeral}
          onDateIdea={() => setDateSheetOpen(true)}
          onVideoCheck={() => setVideoSheetOpen(true)}
          onActionToast={showToast}
        />
      )}

      {/* §4 Date ideas sheet */}
      {conversationId > 0 && (
        <DateIdeasSheet
          conversationId={conversationId}
          open={dateSheetOpen}
          onClose={() => setDateSheetOpen(false)}
          onPropose={handlePropose}
        />
      )}

      {/* §6 Safety sheet */}
      <SafetySheet
        open={safetyOpen}
        onClose={() => setSafetyOpen(false)}
        peerUserId={
          match && myUserId
            ? match.userAId === myUserId
              ? match.userBId
              : match.userAId
            : null
        }
        peerName={peer?.displayName}
        onToast={showToast}
      />

      {/* §6 Video-check consent sheet */}
      <GlassSheet open={videoSheetOpen} onClose={() => setVideoSheetOpen(false)} labelledBy="video-check-title">
        <div className="px-5 pb-6 pt-1">
          <h2 id="video-check-title" className="t-title" style={{ color: 'var(--text)' }}>
            Video check
          </h2>
          <p className="t-body mt-2" style={{ color: 'var(--text-secondary)' }}>
            Both cameras, 3 minutes, no recording stored.
          </p>
          <BtnPrimary className="mt-4 w-full" onClick={sendVideoInvite}>
            Send video-check invite
          </BtnPrimary>
        </div>
      </GlassSheet>
    </div>
  );
}
