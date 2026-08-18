import { and, desc, eq, gt, inArray, isNull, lt, or } from "drizzle-orm";
import {
  callSessions,
  callSignals,
  conversations,
  feedback,
  likes,
  matches,
  messages,
  passes,
  profiles,
  users,
  videoNotes,
  type Conversation,
  type InsertMessage,
  type InsertVideoNote,
  type Match,
  type Message,
  type Profile,
  type VideoNote,
} from "@db/schema";
import { getDb } from "./connection";

export async function findConversationById(
  conversationId: number,
): Promise<Conversation | undefined> {
  const rows = await getDb()
    .select()
    .from(conversations)
    .where(eq(conversations.id, conversationId))
    .limit(1);
  return rows.at(0);
}

export async function findMatchById(matchId: number): Promise<Match | undefined> {
  const rows = await getDb()
    .select()
    .from(matches)
    .where(eq(matches.id, matchId))
    .limit(1);
  return rows.at(0);
}

export async function findConversationByMatchId(
  matchId: number,
): Promise<Conversation | undefined> {
  const rows = await getDb()
    .select()
    .from(conversations)
    .where(eq(conversations.matchId, matchId))
    .limit(1);
  return rows.at(0);
}

export function matchIncludesUser(match: Match, userId: number): boolean {
  return match.userAId === userId || match.userBId === userId;
}

export function otherUserId(match: Match, userId: number): number {
  return match.userAId === userId ? match.userBId : match.userAId;
}

export async function listMessages(
  conversationId: number,
  limit = 50,
): Promise<Message[]> {
  const db = getDb();
  const now = new Date();
  // Lazily purge expired ephemeral messages (fire-and-forget).
  void db
    .delete(messages)
    .where(
      and(eq(messages.conversationId, conversationId), lt(messages.expiresAt, now)),
    )
    .catch(() => {});
  const rows = await db
    .select()
    .from(messages)
    .where(
      and(
        eq(messages.conversationId, conversationId),
        or(isNull(messages.expiresAt), gt(messages.expiresAt, now)),
      ),
    )
    .orderBy(desc(messages.id))
    .limit(limit);
  return rows.reverse(); // chronological order
}

/** Merge a patch into a message's meta JSON and return the updated row. */
export async function mergeMessageMeta(
  messageId: number,
  patch: Record<string, unknown>,
): Promise<Message> {
  const db = getDb();
  const rows = await db
    .select()
    .from(messages)
    .where(eq(messages.id, messageId))
    .limit(1);
  const existing = rows.at(0);
  if (!existing) throw new Error("Message not found");
  const meta = { ...(existing.meta ?? {}), ...patch };
  await db.update(messages).set({ meta }).where(eq(messages.id, messageId));
  const updated = await db
    .select()
    .from(messages)
    .where(eq(messages.id, messageId))
    .limit(1);
  const message = updated.at(0);
  if (!message) throw new Error("Message not found");
  return message;
}

export async function findMessageById(
  messageId: number,
): Promise<Message | undefined> {
  const rows = await getDb()
    .select()
    .from(messages)
    .where(eq(messages.id, messageId))
    .limit(1);
  return rows.at(0);
}

export async function insertMessage(data: Omit<InsertMessage, "id">): Promise<Message> {
  const db = getDb();
  const [{ id }] = await db
    .insert(messages)
    .values(data)
    .returning({ id: messages.id });
  const rows = await db.select().from(messages).where(eq(messages.id, id)).limit(1);
  const message = rows.at(0);
  if (!message) throw new Error("Failed to insert message");
  return message;
}

export async function insertVideoNote(
  data: Omit<InsertVideoNote, "id">,
): Promise<VideoNote> {
  const db = getDb();
  const [{ id }] = await db
    .insert(videoNotes)
    .values(data)
    .returning({ id: videoNotes.id });
  const rows = await db
    .select()
    .from(videoNotes)
    .where(eq(videoNotes.id, id))
    .limit(1);
  const note = rows.at(0);
  if (!note) throw new Error("Failed to insert video note");
  return note;
}

export async function findVideoNoteById(
  noteId: number,
): Promise<VideoNote | undefined> {
  const rows = await getDb()
    .select()
    .from(videoNotes)
    .where(eq(videoNotes.id, noteId))
    .limit(1);
  return rows.at(0);
}

export async function countMessages(conversationId: number): Promise<number> {
  const rows = await getDb()
    .select({ id: messages.id })
    .from(messages)
    .where(eq(messages.conversationId, conversationId));
  return rows.length;
}

export async function setConversationEphemeral(
  conversationId: number,
  ephemeral: boolean,
): Promise<Conversation> {
  const db = getDb();
  await db
    .update(conversations)
    .set({ ephemeral })
    .where(eq(conversations.id, conversationId));
  const rows = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, conversationId))
    .limit(1);
  const conversation = rows.at(0);
  if (!conversation) throw new Error("Conversation not found");
  return conversation;
}

async function setConversationFlag(
  conversationId: number,
  column: "archivedAt" | "mutedAt",
  on: boolean,
): Promise<Conversation> {
  const db = getDb();
  await db
    .update(conversations)
    .set({ [column]: on ? new Date() : null })
    .where(eq(conversations.id, conversationId));
  const rows = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, conversationId))
    .limit(1);
  const conversation = rows.at(0);
  if (!conversation) throw new Error("Conversation not found");
  return conversation;
}

export function setConversationArchived(
  conversationId: number,
  archived: boolean,
): Promise<Conversation> {
  return setConversationFlag(conversationId, "archivedAt", archived);
}

export function setConversationMuted(
  conversationId: number,
  muted: boolean,
): Promise<Conversation> {
  return setConversationFlag(conversationId, "mutedAt", muted);
}

export type MatchListEntry = {
  match: Match;
  conversationId: number | null;
  ephemeral: boolean;
  archivedAt: Date | null;
  mutedAt: Date | null;
  otherProfile: Profile | null;
  /** V93: true when the peer's account was removed (tombstone state in the UI). */
  removedPeer: boolean;
  lastMessage: Message | null;
};

export async function listMatchesForUser(
  userId: number,
  opts: { includeArchived?: boolean } = {},
): Promise<MatchListEntry[]> {
  const db = getDb();
  const matchRows = await db
    .select()
    .from(matches)
    .where(or(eq(matches.userAId, userId), eq(matches.userBId, userId)))
    .orderBy(desc(matches.createdAt));

  const entries: MatchListEntry[] = [];
  for (const match of matchRows) {
    const otherId = otherUserId(match, userId);

    const convRows = await db
      .select()
      .from(conversations)
      .where(eq(conversations.matchId, match.id))
      .limit(1);
    const conversation = convRows.at(0);
    if (conversation?.archivedAt && !opts.includeArchived) continue;

    const profileRows = await db
      .select()
      .from(profiles)
      .where(eq(profiles.userId, otherId))
      .limit(1);

    const peerUserRows = await db
      .select({ removedAt: users.removedAt })
      .from(users)
      .where(eq(users.id, otherId))
      .limit(1);

    let lastMessage: Message | null = null;
    if (conversation) {
      const msgRows = await db
        .select()
        .from(messages)
        .where(eq(messages.conversationId, conversation.id))
        .orderBy(desc(messages.id))
        .limit(1);
      lastMessage = msgRows.at(0) ?? null;
    }

    entries.push({
      match,
      conversationId: conversation?.id ?? null,
      ephemeral: conversation?.ephemeral ?? false,
      archivedAt: conversation?.archivedAt ?? null,
      mutedAt: conversation?.mutedAt ?? null,
      otherProfile: profileRows.at(0) ?? null,
      removedPeer: peerUserRows.at(0)?.removedAt != null,
      lastMessage,
    });
  }

  // Most recent activity first (last message, else match creation).
  entries.sort((a, b) => {
    const ta = a.lastMessage?.createdAt ?? a.match.createdAt;
    const tb = b.lastMessage?.createdAt ?? b.match.createdAt;
    return tb.getTime() - ta.getTime();
  });

  return entries;
}

/**
 * User-controlled unmatch. Removes the match for BOTH sides (quiet — no
 * notification), deletes its conversation tree (messages/video notes/call
 * signaling), clears likes between the two users, and records a pass from the
 * remover toward the removed profile so they don't reappear in that user's
 * queue. Returns the peer user id, or null when the match isn't the caller's.
 */
export async function removeMatchForUser(
  matchId: number,
  userId: number,
): Promise<{ otherUserId: number } | null> {
  const db = getDb();
  const match = await findMatchById(matchId);
  if (!match || !matchIncludesUser(match, userId)) return null;
  const otherId = otherUserId(match, userId);

  const conversation = await findConversationByMatchId(matchId);
  if (conversation) {
    const sessionRows = await db
      .select({ id: callSessions.id })
      .from(callSessions)
      .where(eq(callSessions.conversationId, conversation.id));
    const sessionIds = sessionRows.map((r) => r.id);
    if (sessionIds.length > 0) {
      await db.delete(callSignals).where(inArray(callSignals.sessionId, sessionIds));
    }
    await db.delete(callSessions).where(eq(callSessions.conversationId, conversation.id));
    await db.delete(videoNotes).where(eq(videoNotes.conversationId, conversation.id));
    await db.delete(messages).where(eq(messages.conversationId, conversation.id));
    await db.delete(conversations).where(eq(conversations.id, conversation.id));
  }

  // feedback references matches — remove before the match row.
  await db.delete(feedback).where(eq(feedback.matchId, matchId));

  const [myProfileRows, otherProfileRows] = await Promise.all([
    db.select({ id: profiles.id }).from(profiles).where(eq(profiles.userId, userId)).limit(1),
    db.select({ id: profiles.id }).from(profiles).where(eq(profiles.userId, otherId)).limit(1),
  ]);
  const myProfileId = myProfileRows.at(0)?.id;
  const otherProfileId = otherProfileRows.at(0)?.id;

  // Clean likes in both directions so neither Likes You points at a removed match.
  if (myProfileId) {
    await db
      .delete(likes)
      .where(and(eq(likes.fromUserId, otherId), eq(likes.toProfileId, myProfileId)));
  }
  if (otherProfileId) {
    await db
      .delete(likes)
      .where(and(eq(likes.fromUserId, userId), eq(likes.toProfileId, otherProfileId)));
    // Don't re-show the removed person to the user who removed them.
    await db
      .insert(passes)
      .values({ fromUserId: userId, toProfileId: otherProfileId })
      .onConflictDoUpdate({
        target: [passes.fromUserId, passes.toProfileId],
        set: { toProfileId: otherProfileId },
      });
  }

  await db.delete(matches).where(eq(matches.id, matchId));
  return { otherUserId: otherId };
}

/** Resolve the conversation + match + peer profile for a participant. */
export async function getConversationContext(conversationId: number, userId: number) {
  const conversation = await findConversationById(conversationId);
  if (!conversation) return null;
  const match = await findMatchById(conversation.matchId);
  if (!match || !matchIncludesUser(match, userId)) return null;

  const peerId = otherUserId(match, userId);
  const db = getDb();
  const profileRows = await db
    .select()
    .from(profiles)
    .where(eq(profiles.userId, peerId))
    .limit(1);
  const myProfileRows = await db
    .select()
    .from(profiles)
    .where(eq(profiles.userId, userId))
    .limit(1);

  return {
    conversation,
    match,
    peerId,
    peerProfile: profileRows.at(0) ?? null,
    myProfile: myProfileRows.at(0) ?? null,
  };
}

/** The neutral, defamation-safe removal line (community standards §8.9). */
export const REMOVAL_NOTICE_TEXT = "This account is no longer on Resonance.";

/** V93: is this account removed? Drives the chat.send guards. */
export async function isUserRemoved(userId: number): Promise<boolean> {
  const rows = await getDb()
    .select({ removedAt: users.removedAt })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return rows.at(0)?.removedAt != null;
}

/**
 * V93: after a confirmed strike-3 removal, every conversation of the removed
 * member gets ONE neutral system notice (never the reason, never a category).
 * Idempotent — skips conversations that already carry the notice.
 */
export async function insertRemovalNotices(userId: number): Promise<number> {
  const db = getDb();
  const matchRows = await db
    .select()
    .from(matches)
    .where(or(eq(matches.userAId, userId), eq(matches.userBId, userId)));

  let inserted = 0;
  for (const match of matchRows) {
    const conversation = await findConversationByMatchId(match.id);
    if (!conversation) continue;

    const existing = await db
      .select({ id: messages.id })
      .from(messages)
      .where(
        and(
          eq(messages.conversationId, conversation.id),
          eq(messages.senderId, userId),
          eq(messages.kind, "system"),
          eq(messages.content, REMOVAL_NOTICE_TEXT),
        ),
      )
      .limit(1);
    if (existing.length > 0) continue;

    await insertMessage({
      conversationId: conversation.id,
      senderId: userId,
      kind: "system",
      content: REMOVAL_NOTICE_TEXT,
      meta: { event: "account_removed" },
    });
    inserted++;
  }
  return inserted;
}
