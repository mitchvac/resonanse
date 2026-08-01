import { and, desc, eq, gt, isNull, lt, or } from "drizzle-orm";
import {
  conversations,
  matches,
  messages,
  profiles,
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
  const [{ id }] = await db.insert(messages).values(data).$returningId();
  const rows = await db.select().from(messages).where(eq(messages.id, id)).limit(1);
  const message = rows.at(0);
  if (!message) throw new Error("Failed to insert message");
  return message;
}

export async function insertVideoNote(
  data: Omit<InsertVideoNote, "id">,
): Promise<VideoNote> {
  const db = getDb();
  const [{ id }] = await db.insert(videoNotes).values(data).$returningId();
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
