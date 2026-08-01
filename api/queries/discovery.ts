import { and, asc, desc, eq, gte, inArray, isNull, lte, notInArray, or } from "drizzle-orm";
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

export type DiscoveryFilters = {
  intents?: string[];
  dealbreakerIntents?: string[];
  minAge?: number;
  maxAge?: number;
  verifiedOnly?: boolean;
  city?: string;
};

export async function getDiscoveryQueue(
  userId: number,
  myGoal: string | null,
  limit = 8,
  filters: DiscoveryFilters = {},
): Promise<QueueEntry[]> {
  const db = getDb();

  const [likedRows, passedRows, blockedRows, blockedByRows] = await Promise.all([
    db.select({ id: likes.toProfileId }).from(likes).where(eq(likes.fromUserId, userId)),
    db.select({ id: passes.toProfileId }).from(passes).where(eq(passes.fromUserId, userId)),
    db.select({ id: blocks.blockedId }).from(blocks).where(eq(blocks.blockerId, userId)),
    db.select({ id: blocks.blockerId }).from(blocks).where(eq(blocks.blockedId, userId)),
  ]);

  const likedProfileIds = likedRows.map((r) => r.id);
  const excludedProfileIds = [
    ...new Set([...likedProfileIds, ...passedRows.map((r) => r.id)]),
  ];
  const excludedUserIds = [
    ...new Set([...blockedRows.map((r) => r.id), ...blockedByRows.map((r) => r.id), userId]),
  ];

  const conditions = [eq(profiles.isSeed, true), isNull(profiles.pausedAt)];
  if (excludedUserIds.length > 0) {
    conditions.push(notInArray(profiles.userId, excludedUserIds));
  }
  if (excludedProfileIds.length > 0) {
    conditions.push(notInArray(profiles.id, excludedProfileIds));
  }
  // Anonymity-mode profiles stay hidden unless the caller already liked them.
  if (likedProfileIds.length > 0) {
    conditions.push(
      or(eq(profiles.anonymityMode, false), inArray(profiles.id, likedProfileIds))!,
    );
  } else {
    conditions.push(eq(profiles.anonymityMode, false));
  }

  // Optional filters.
  if (filters.intents && filters.intents.length > 0) {
    conditions.push(
      inArray(
        profiles.relationshipGoal,
        filters.intents as (typeof profiles.relationshipGoal.enumValues)[number][],
      ),
    );
  }
  if (filters.dealbreakerIntents && filters.dealbreakerIntents.length > 0) {
    conditions.push(
      notInArray(
        profiles.relationshipGoal,
        filters.dealbreakerIntents as (typeof profiles.relationshipGoal.enumValues)[number][],
      ),
    );
  }
  if (filters.minAge !== undefined) {
    conditions.push(gte(profiles.age, filters.minAge));
  }
  if (filters.maxAge !== undefined) {
    conditions.push(lte(profiles.age, filters.maxAge));
  }
  if (filters.verifiedOnly) {
    conditions.push(eq(profiles.verified, true));
  }
  if (filters.city) {
    conditions.push(eq(profiles.city, filters.city));
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

/**
 * "Pass quietly": when the caller passes on a profile, dismiss any like that
 * profile's user previously sent to the caller so it leaves their Likes You.
 */
export async function dismissIncomingLikesFrom(
  likerUserId: number,
  toProfileId: number,
): Promise<void> {
  await getDb()
    .update(likes)
    .set({ dismissedAt: new Date() })
    .where(
      and(
        eq(likes.fromUserId, likerUserId),
        eq(likes.toProfileId, toProfileId),
        isNull(likes.dismissedAt),
      ),
    );
}

export async function recordLike(
  data: Omit<Like, "id" | "createdAt" | "dismissedAt">,
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
    // Honor ephemeralDefault: if EITHER matched user defaults to ephemeral,
    // the new conversation starts ephemeral.
    const [profileA, profileB] = await Promise.all([
      db.select({ ephemeralDefault: profiles.ephemeralDefault }).from(profiles).where(eq(profiles.userId, a)).limit(1),
      db.select({ ephemeralDefault: profiles.ephemeralDefault }).from(profiles).where(eq(profiles.userId, b)).limit(1),
    ]);
    const ephemeral = Boolean(
      profileA.at(0)?.ephemeralDefault || profileB.at(0)?.ephemeralDefault,
    );
    await db
      .insert(conversations)
      .values({ matchId: match.id, ephemeral })
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
    .where(and(eq(likes.toProfileId, toProfileId), isNull(likes.dismissedAt)))
    .orderBy(desc(likes.kind), desc(likes.createdAt)); // 'pulse' > 'like' → pinned first

  return rows.map((r) => ({ ...r.like, likerProfile: r.likerProfile }));
}

export async function countMatchesForUser(userId: number): Promise<number> {
  const rows = await getDb()
    .select({ id: matches.id })
    .from(matches)
    .where(or(eq(matches.userAId, userId), eq(matches.userBId, userId)));
  return rows.length;
}

/**
 * One-time lazy seed: give a brand-new caller 5 incoming likes + 2 pulses
 * from distinct seed profiles (excluding blocked/passed) so Likes You
 * isn't empty on first visit. Idempotent via profiles.likesSeededAt.
 */
export async function seedIncomingLikes(
  userId: number,
  myProfileId: number,
): Promise<void> {
  const db = getDb();

  const [blockedRows, blockedByRows, passedRows] = await Promise.all([
    db.select({ id: blocks.blockedId }).from(blocks).where(eq(blocks.blockerId, userId)),
    db.select({ id: blocks.blockerId }).from(blocks).where(eq(blocks.blockedId, userId)),
    db.select({ id: passes.toProfileId }).from(passes).where(eq(passes.fromUserId, userId)),
  ]);
  const excludedUserIds = [
    ...new Set([...blockedRows.map((r) => r.id), ...blockedByRows.map((r) => r.id), userId]),
  ];
  const excludedProfileIds = passedRows.map((r) => r.id);

  const conditions = [eq(profiles.isSeed, true), notInArray(profiles.userId, excludedUserIds)];
  if (excludedProfileIds.length > 0) {
    conditions.push(notInArray(profiles.id, excludedProfileIds));
  }
  const seedProfiles = await db
    .select()
    .from(profiles)
    .where(and(...conditions))
    .orderBy(asc(profiles.createdAt), asc(profiles.id))
    .limit(7);

  const now = new Date();
  const rows = seedProfiles.map((profile, i) => {
    const isPulse = i >= 5;
    // Two of the likes target a specific prompt/photo with a comment.
    if (i === 0 && (profile.prompts?.length ?? 0) > 0) {
      return {
        fromUserId: profile.userId,
        toProfileId: myProfileId,
        kind: "like" as const,
        targetType: "prompt" as const,
        targetRef: profile.prompts![0].question.slice(0, 255),
        comment: "This answer stopped me mid-scroll. Tell me more?",
      };
    }
    if (i === 1 && (profile.photos?.length ?? 0) > 0) {
      return {
        fromUserId: profile.userId,
        toProfileId: myProfileId,
        kind: "like" as const,
        targetType: "photo" as const,
        targetRef: "0",
        comment: "You have the best smile in this one.",
      };
    }
    return {
      fromUserId: profile.userId,
      toProfileId: myProfileId,
      kind: isPulse ? ("pulse" as const) : ("like" as const),
      targetType: "profile" as const,
      targetRef: null,
      comment: null,
    };
  });

  for (const row of rows) {
    await db
      .insert(likes)
      .values({ ...row, createdAt: now })
      .onDuplicateKeyUpdate({ set: { toProfileId: myProfileId } });
  }

  await db
    .update(profiles)
    .set({ likesSeededAt: now })
    .where(eq(profiles.id, myProfileId));
}
