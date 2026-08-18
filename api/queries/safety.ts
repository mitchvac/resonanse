import { and, desc, eq, inArray, or } from "drizzle-orm";
import {
  blocks,
  callSessions,
  callSignals,
  conversations,
  entitlements,
  eventRsvps,
  feedback,
  likes,
  matches,
  messages,
  passes,
  passwordCredentials,
  profiles,
  reports,
  users,
  videoNotes,
  type Block,
  type Profile,
} from "@db/schema";
import { getDb } from "./connection";

export async function createReport(data: {
  reporterId: number;
  targetUserId: number;
  reason: string;
  detail?: string;
}): Promise<void> {
  await getDb().insert(reports).values(data);
}

export async function blockUser(
  blockerId: number,
  blockedId: number,
): Promise<void> {
  await getDb()
    .insert(blocks)
    .values({ blockerId, blockedId })
    .onConflictDoUpdate({
      target: [blocks.blockerId, blocks.blockedId],
      set: { blockedId },
    });
}

export async function unblockUser(
  blockerId: number,
  blockedId: number,
): Promise<void> {
  await getDb()
    .delete(blocks)
    .where(and(eq(blocks.blockerId, blockerId), eq(blocks.blockedId, blockedId)));
}

export async function listBlocked(
  blockerId: number,
): Promise<(Block & { profile: Profile | null })[]> {
  const rows = await getDb()
    .select({ block: blocks, profile: profiles })
    .from(blocks)
    .leftJoin(profiles, eq(blocks.blockedId, profiles.userId))
    .where(eq(blocks.blockerId, blockerId))
    .orderBy(desc(blocks.createdAt));
  return rows.map((r) => ({ ...r.block, profile: r.profile }));
}

/** A block exists in either direction between two users. */
export async function isBlockedBetween(
  userA: number,
  userB: number,
): Promise<boolean> {
  const rows = await getDb()
    .select({ id: blocks.id })
    .from(blocks)
    .where(
      or(
        and(eq(blocks.blockerId, userA), eq(blocks.blockedId, userB)),
        and(eq(blocks.blockerId, userB), eq(blocks.blockedId, userA)),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

// ── Account controls ───────────────────────────────────────────────────

async function matchIdsForUser(userId: number): Promise<number[]> {
  const rows = await getDb()
    .select({ id: matches.id })
    .from(matches)
    .where(or(eq(matches.userAId, userId), eq(matches.userBId, userId)));
  return rows.map((r) => r.id);
}

async function conversationIdsForMatches(matchIds: number[]): Promise<number[]> {
  if (matchIds.length === 0) return [];
  const rows = await getDb()
    .select({ id: conversations.id })
    .from(conversations)
    .where(inArray(conversations.matchId, matchIds));
  return rows.map((r) => r.id);
}

/** Permanently delete every row belonging to (or targeting) the user. */
export async function deleteAccountData(userId: number): Promise<void> {
  const db = getDb();
  const profileRows = await db
    .select({ id: profiles.id })
    .from(profiles)
    .where(eq(profiles.userId, userId));
  const myProfileId = profileRows.at(0)?.id;

  const matchIds = await matchIdsForUser(userId);
  const conversationIds = await conversationIdsForMatches(matchIds);

  // Video call signaling (deepest children first).
  const sessionIdRows =
    conversationIds.length > 0
      ? await db
          .select({ id: callSessions.id })
          .from(callSessions)
          .where(
            or(
              inArray(callSessions.conversationId, conversationIds),
              eq(callSessions.callerId, userId),
              eq(callSessions.calleeId, userId),
            ),
          )
      : await db
          .select({ id: callSessions.id })
          .from(callSessions)
          .where(
            or(
              eq(callSessions.callerId, userId),
              eq(callSessions.calleeId, userId),
            ),
          );
  const sessionIds = sessionIdRows.map((r) => r.id);
  if (sessionIds.length > 0) {
    await db.delete(callSignals).where(inArray(callSignals.sessionId, sessionIds));
  }
  await db
    .delete(callSignals)
    .where(eq(callSignals.fromUserId, userId));
  await db
    .delete(callSessions)
    .where(
      or(eq(callSessions.callerId, userId), eq(callSessions.calleeId, userId)),
    );

  if (conversationIds.length > 0) {
    await db
      .delete(videoNotes)
      .where(inArray(videoNotes.conversationId, conversationIds));
    await db
      .delete(messages)
      .where(inArray(messages.conversationId, conversationIds));
  }
  await db.delete(videoNotes).where(eq(videoNotes.senderId, userId));
  await db.delete(messages).where(eq(messages.senderId, userId));

  // feedback references matches — remove before matches.
  await db.delete(feedback).where(eq(feedback.userId, userId));
  if (matchIds.length > 0) {
    await db.delete(feedback).where(inArray(feedback.matchId, matchIds));
  }

  if (conversationIds.length > 0) {
    await db
      .delete(conversations)
      .where(inArray(conversations.id, conversationIds));
  }
  if (matchIds.length > 0) {
    await db.delete(matches).where(inArray(matches.id, matchIds));
  }

  await db.delete(likes).where(eq(likes.fromUserId, userId));
  await db.delete(passes).where(eq(passes.fromUserId, userId));
  if (myProfileId !== undefined) {
    await db.delete(likes).where(eq(likes.toProfileId, myProfileId));
    await db.delete(passes).where(eq(passes.toProfileId, myProfileId));
  }

  await db.delete(eventRsvps).where(eq(eventRsvps.userId, userId));
  await db.delete(entitlements).where(eq(entitlements.userId, userId));
  await db
    .delete(reports)
    .where(or(eq(reports.reporterId, userId), eq(reports.targetUserId, userId)));
  await db
    .delete(blocks)
    .where(or(eq(blocks.blockerId, userId), eq(blocks.blockedId, userId)));
  await db
    .delete(passwordCredentials)
    .where(eq(passwordCredentials.userId, userId));
  await db.delete(profiles).where(eq(profiles.userId, userId));
  await db.delete(users).where(eq(users.id, userId));
}

/** Aggregate everything about the caller for a data export. */
export async function exportUserData(userId: number) {
  const db = getDb();

  const userRows = await db.select().from(users).where(eq(users.id, userId));
  const profileRows = await db
    .select()
    .from(profiles)
    .where(eq(profiles.userId, userId));
  const profile = profileRows.at(0) ?? null;

  const entitlementRows = await db
    .select()
    .from(entitlements)
    .where(eq(entitlements.userId, userId));

  const likesGiven = await db
    .select()
    .from(likes)
    .where(eq(likes.fromUserId, userId));
  const likesReceived = profile
    ? await db.select().from(likes).where(eq(likes.toProfileId, profile.id))
    : [];
  const passesGiven = await db
    .select()
    .from(passes)
    .where(eq(passes.fromUserId, userId));

  const matchIds = await matchIdsForUser(userId);
  const matchRows =
    matchIds.length > 0
      ? await db.select().from(matches).where(inArray(matches.id, matchIds))
      : [];
  const conversationIds = await conversationIdsForMatches(matchIds);
  const conversationRows =
    conversationIds.length > 0
      ? await db
          .select()
          .from(conversations)
          .where(inArray(conversations.id, conversationIds))
      : [];
  const messageRows =
    conversationIds.length > 0
      ? await db
          .select()
          .from(messages)
          .where(inArray(messages.conversationId, conversationIds))
      : [];
  const rsvpRows = await db
    .select()
    .from(eventRsvps)
    .where(eq(eventRsvps.userId, userId));
  const reportRows = await db
    .select()
    .from(reports)
    .where(or(eq(reports.reporterId, userId), eq(reports.targetUserId, userId)));
  const blockRows = await db
    .select()
    .from(blocks)
    .where(or(eq(blocks.blockerId, userId), eq(blocks.blockedId, userId)));
  const feedbackRows = await db
    .select()
    .from(feedback)
    .where(eq(feedback.userId, userId));
  const callSessionRows = await db
    .select()
    .from(callSessions)
    .where(
      or(eq(callSessions.callerId, userId), eq(callSessions.calleeId, userId)),
    );
  // Video note metadata only — the heavy base64 payload never exports.
  const videoNoteRows =
    conversationIds.length > 0
      ? await db
          .select({
            id: videoNotes.id,
            conversationId: videoNotes.conversationId,
            senderId: videoNotes.senderId,
            durationSec: videoNotes.durationSec,
            createdAt: videoNotes.createdAt,
          })
          .from(videoNotes)
          .where(inArray(videoNotes.conversationId, conversationIds))
      : [];

  return {
    user: userRows.at(0) ?? null,
    profile,
    entitlements: entitlementRows.at(0) ?? null,
    likesGiven,
    likesReceived,
    passes: passesGiven,
    matches: matchRows,
    conversations: conversationRows,
    messages: messageRows,
    rsvps: rsvpRows,
    reports: reportRows,
    blocks: blockRows,
    feedback: feedbackRows,
    videoCallSessions: callSessionRows,
    videoNotes: videoNoteRows,
  };
}

/** Wipe likes given, passes, and received likes — matches stay intact. */
export async function resetMatchingData(userId: number): Promise<void> {
  const db = getDb();
  const profileRows = await db
    .select({ id: profiles.id })
    .from(profiles)
    .where(eq(profiles.userId, userId));
  const myProfileId = profileRows.at(0)?.id;

  await db.delete(likes).where(eq(likes.fromUserId, userId));
  await db.delete(passes).where(eq(passes.fromUserId, userId));
  if (myProfileId !== undefined) {
    await db.delete(likes).where(eq(likes.toProfileId, myProfileId));
  }
}
