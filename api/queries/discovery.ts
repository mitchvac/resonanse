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

/* — gender preference matching ————————————————————————————————
 * The queue must respect "Show me" (and the candidate's own preference).
 * Genders are free-text (chips or self-describe), so normalize to buckets.
 * Check "woman" BEFORE "man" — "woman" contains "man" as a substring. */
export type GenderCategory = "woman" | "man" | "nonbinary" | "other";

export function categorizeGender(
  gender: string | null | undefined,
): GenderCategory | null {
  if (!gender) return null;
  const g = gender.toLowerCase();
  if (g.includes("woman") || g.includes("female") || g.includes("girl")) return "woman";
  if (g.includes("man") || g.includes("male") || g.includes("boy")) return "man";
  if (
    g.includes("nonbinary") ||
    g.includes("non-binary") ||
    g.includes("non binary") ||
    g.includes("two-spirit") ||
    g.includes("two spirit") ||
    g.includes("enby")
  ) {
    return "nonbinary";
  }
  return "other"; // self-described — visible only to "Everyone"
}

/**
 * Map a "Show me" selection (e.g. ['Women', 'Men', 'Nonbinary people',
 * 'Everyone']) to gender buckets. null/empty/'Everyone' → null (no filter).
 */
export function showMeCategories(
  showMe: string[] | null | undefined,
): Set<GenderCategory> | null {
  if (!showMe || showMe.length === 0 || showMe.includes("Everyone")) return null;
  const set = new Set<GenderCategory>();
  for (const s of showMe) {
    const v = s.toLowerCase();
    if (v.startsWith("women")) set.add("woman");
    else if (v.startsWith("men")) set.add("man");
    else if (v.startsWith("nonbinary")) set.add("nonbinary");
  }
  return set.size > 0 ? set : null;
}

export type GenderPrefs = {
  gender: string | null | undefined;
  showMe: string[] | null | undefined;
};

/** Does the viewer's "Show me" accept this candidate's gender? */
function candidateVisibleToViewer(
  candidate: Pick<Profile, "gender">,
  wanted: Set<GenderCategory> | null,
): boolean {
  if (!wanted) return true;
  const cat = categorizeGender(candidate.gender);
  if (cat === null) return true; // unknown gender — never hide
  if (cat === "other") return false; // self-described → only "Everyone" sees them
  return wanted.has(cat);
}

/** Does the candidate's own "Show me" accept the viewer's gender? */
function viewerVisibleToCandidate(
  candidate: Pick<Profile, "showMe">,
  myCat: GenderCategory | null,
): boolean {
  const theirs = showMeCategories(candidate.showMe);
  if (!theirs) return true; // they're open to Everyone
  if (myCat === null) return true; // viewer's gender unknown — don't over-filter
  if (myCat === "other") return false;
  return theirs.has(myCat);
}

/** Mutual gender-preference match between viewer prefs and a candidate. */
export function genderCompatible(
  candidate: Pick<Profile, "gender" | "showMe">,
  myPrefs: GenderPrefs,
): boolean {
  const wanted = showMeCategories(myPrefs.showMe);
  const myCat = categorizeGender(myPrefs.gender);
  return (
    candidateVisibleToViewer(candidate, wanted) &&
    viewerVisibleToCandidate(candidate, myCat)
  );
}

/* — city matching (Travel mode) ———————————————————————————————
 * Cities are free-text ("Brooklyn, NY"); an exact match on the whole string
 * makes Travel mode useless ("New York" matched nothing). Match on the city
 * core with alias expansion, falling back to same-state. */
const CITY_ALIASES: Record<string, string[]> = {
  "new york": ["new york", "nyc", "brooklyn", "queens", "manhattan", "bronx", "staten island"],
  nyc: ["new york", "nyc", "brooklyn", "queens", "manhattan", "bronx", "staten island"],
  "los angeles": ["los angeles", "la", "hollywood", "santa monica"],
  la: ["los angeles", "la", "hollywood", "santa monica"],
  "san francisco": ["san francisco", "sf", "bay area"],
  sf: ["san francisco", "sf", "bay area"],
};

export function cityMatches(
  candidateCity: string | null | undefined,
  filterCity: string,
): boolean {
  if (!candidateCity) return false;
  const [cCore, cState] = candidateCity.toLowerCase().split(",").map((s) => s.trim());
  const [fCore, fState] = filterCity.toLowerCase().split(",").map((s) => s.trim());
  if (!cCore || !fCore) return false;
  const fCores = CITY_ALIASES[fCore] ?? [fCore];
  const cCores = CITY_ALIASES[cCore] ?? [cCore];
  if (fCores.some((f) => cCores.some((c) => c.includes(f) || f.includes(c)))) return true;
  return Boolean(fState && cState && fState === cState);
}

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
  myPrefs: GenderPrefs = { gender: null, showMe: null },
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
  const candidates = await db
    .select()
    .from(profiles)
    .where(and(...conditions))
    .orderBy(asc(profiles.createdAt), asc(profiles.id));

  // Gender preferences are a hard gate: I only see genders I asked for,
  // and only candidates whose own "Show me" accepts my gender.
  let compatible = candidates.filter((c) => genderCompatible(c, myPrefs));

  // Travel/city filter — fuzzy core/state match, not exact string equality.
  if (filters.city) {
    const city = filters.city;
    compatible = compatible.filter((c) => cityMatches(c.city, city));
  }

  // Intent-aligned first: same relationshipGoal sorts ahead, stable otherwise.
  const sorted = [...compatible].sort((a, b) => {
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

/** Free tier gets FREE_DAILY_FLOWERS per day; Resonance+ is unlimited. */
export const FREE_DAILY_FLOWERS = 3;

export async function countFlowersToday(userId: number): Promise<number> {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const rows = await getDb()
    .select({ id: likes.id })
    .from(likes)
    .where(
      and(
        eq(likes.fromUserId, userId),
        eq(likes.kind, "flower"),
        gte(likes.createdAt, startOfDay),
      ),
    );
  return rows.length;
}

/** Kisses are the bold flirty gesture — scarce like roses: free tier 3/day, Resonance+ unlimited. */
export const FREE_DAILY_KISSES = 3;

export async function countKissesToday(userId: number): Promise<number> {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const rows = await getDb()
    .select({ id: likes.id })
    .from(likes)
    .where(
      and(
        eq(likes.fromUserId, userId),
        eq(likes.kind, "kiss"),
        gte(likes.createdAt, startOfDay),
      ),
    );
  return rows.length;
}

/** Waves are the low-stakes "say hi" — generous cap, same for every tier. */
export const FREE_DAILY_WAVES = 10;

export async function countWavesToday(userId: number): Promise<number> {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const rows = await getDb()
    .select({ id: likes.id })
    .from(likes)
    .where(
      and(
        eq(likes.fromUserId, userId),
        eq(likes.kind, "wave"),
        gte(likes.createdAt, startOfDay),
      ),
    );
  return rows.length;
}

/** A dozen roses is a grand gesture — ONE per day for every tier.
    A dozen is a flower row with targetRef 'dozen'. */
export const DAILY_DOZEN_LIMIT = 1;

export async function countDozenToday(userId: number): Promise<number> {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const rows = await getDb()
    .select({ id: likes.id })
    .from(likes)
    .where(
      and(
        eq(likes.fromUserId, userId),
        eq(likes.kind, "flower"),
        eq(likes.targetRef, "dozen"),
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
  myPrefs: GenderPrefs = { gender: null, showMe: null },
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
  const seedProfiles = (
    await db
      .select()
      .from(profiles)
      .where(and(...conditions))
      .orderBy(asc(profiles.createdAt), asc(profiles.id))
  )
    .filter((p) => genderCompatible(p, myPrefs))
    .slice(0, 7);

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
