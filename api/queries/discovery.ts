import { and, asc, desc, eq, gte, notInArray } from "drizzle-orm";
import {
  blocks,
  conversations,
  likes,
  matches,
  passes,
  profiles,
  type Conversation,
  type Like,
  type Match,
  type Profile,
} from "@db/schema";
import { getDb } from "./connection";

/** Deterministic pseudo compatibility score in 72–98 derived from ids. */
export function compatibilityScore(userId: number, profileId: number): number {
  return 72 + ((userId * 31 + profileId * 17) % 27);
}

/** Deterministic seed auto-reciprocity (~40%): (fromUserId + toProfileId) % 5 < 2 */
export function seedReciprocates(fromUserId: number, toProfileId: number): boolean {
  return (fromUserId + toProfileId) % 5 < 2;
}

export type QueueEntry = { profile: Profile; compatibility: number };

export async function getDiscoveryQueue(
  userId: number,
  myGoal: string | null,
  limit = 8,
): Promise<QueueEntry[]> {
  const db = getDb();

  const [likedRows, passedRows, blockedRows, blockedByRows] = await Promise.all([
    db.select({ id: likes.toProfileId }).from(likes).where(eq(likes.fromUserId, userId)),
    db.select({ id: passes.toProfileId }).from(passes).where(eq(passes.fromUserId, userId)),
    db.select({ id: blocks.blockedId }).from(blocks).where(eq(blocks.blockerId, userId)),
    db.select({ id: blocks.blockerId }).from(blocks).where(eq(blocks.blockedId, userId)),
  ]);

  const excludedProfileIds = [
    ...new Set([...likedRows.map((r) => r.id), ...passedRows.map((r) => r.id)]),
  ];
  const excludedUserIds = [
    ...new Set([...blockedRows.map((r) => r.id), ...blockedByRows.map((r) => r.id), userId]),
  ];

  const conditions = [eq(profiles.isSeed, true)];
  if (excludedUserIds.length > 0) {
    conditions.push(notInArray(profiles.userId, excludedUserIds));
  }
  if (excludedProfileIds.length > 0) {
    conditions.push(notInArray(profiles.id, excludedProfileIds));
  }

  const candidates = await db
    .select()
    .from(profiles)
    .where(and(...conditions))
    .orderBy(asc(profiles.createdAt), asc(profiles.id));

  // Intent-aligned first: same relationshipGoal sorts ahead, stable otherwise.
  const sorted = [...candidates].sort((a, b) => {
    const aAlign = myGoal && a.relationshipGoal === myGoal ? 0 : 1;
    const bAlign = myGoal && b.relationshipGoal === myGoal ? 0 : 1;
    return aAlign - bAlign;
  });

  return sorted.slice(0, limit).map((profile) => ({
    profile,
    compatibility: compatibilityScore(userId, profile.id),
  }));
}

export async function countLikesToday(userId: number): Promise<number> {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const rows = await getDb()
    .select({ id: likes.id })
    .from(likes)
    .where(
      and(
        eq(likes.fromUserId, userId),
        eq(likes.kind, "like"),
        gte(likes.createdAt, startOfDay),
      ),
    );
  return rows.length;
}

export async function recordPass(
  fromUserId: number,
  toProfileId: number,
): Promise<void> {
  await getDb()
    .insert(passes)
    .values({ fromUserId, toProfileId })
    .onDuplicateKeyUpdate({ set: { toProfileId } });
}

export async function recordLike(
  data: Omit<Like, "id" | "createdAt">,
): Promise<void> {
  await getDb()
    .insert(likes)
    .values(data)
    .onDuplicateKeyUpdate({
      set: {
        kind: data.kind,
        comment: data.comment ?? null,
        targetType: data.targetType,
        targetRef: data.targetRef ?? null,
      },
    });
}

/** Has `fromUserId` already liked (or pulsed) `toProfileId`? */
export async function findExistingLike(
  fromUserId: number,
  toProfileId: number,
): Promise<Like | undefined> {
  const rows = await getDb()
    .select()
    .from(likes)
    .where(and(eq(likes.fromUserId, fromUserId), eq(likes.toProfileId, toProfileId)))
    .limit(1);
  return rows.at(0);
}

export async function getOrCreateMatch(
  userAId: number,
  userBId: number,
): Promise<{ match: Match; conversation: Conversation; created: boolean }> {
  const db = getDb();
  const [a, b] = userAId < userBId ? [userAId, userBId] : [userBId, userAId];

  const existingRows = await db
    .select()
    .from(matches)
    .where(and(eq(matches.userAId, a), eq(matches.userBId, b)))
    .limit(1);
  let match = existingRows.at(0);
  let created = false;

  if (!match) {
    await db
      .insert(matches)
      .values({ userAId: a, userBId: b })
      .onDuplicateKeyUpdate({ set: { userBId: b } });
    const rows = await db
      .select()
      .from(matches)
      .where(and(eq(matches.userAId, a), eq(matches.userBId, b)))
      .limit(1);
    match = rows.at(0);
    created = true;
  }
  if (!match) throw new Error("Failed to create match");

  const convRows = await db
    .select()
    .from(conversations)
    .where(eq(conversations.matchId, match.id))
    .limit(1);
  let conversation = convRows.at(0);
  if (!conversation) {
    await db
      .insert(conversations)
      .values({ matchId: match.id })
      .onDuplicateKeyUpdate({ set: { matchId: match.id } });
    const rows = await db
      .select()
      .from(conversations)
      .where(eq(conversations.matchId, match.id))
      .limit(1);
    conversation = rows.at(0);
  }
  if (!conversation) throw new Error("Failed to create conversation");

  return { match, conversation, created };
}

export async function likesReceivedForProfile(
  toProfileId: number,
): Promise<(Like & { likerProfile: Profile | null })[]> {
  const db = getDb();
  const rows = await db
    .select({ like: likes, likerProfile: profiles })
    .from(likes)
    .leftJoin(profiles, eq(likes.fromUserId, profiles.userId))
    .where(eq(likes.toProfileId, toProfileId))
    .orderBy(desc(likes.kind), desc(likes.createdAt)); // 'pulse' > 'like' → pinned first

  return rows.map((r) => ({ ...r.like, likerProfile: r.likerProfile }));
}
