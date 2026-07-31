import { eq } from "drizzle-orm";
import {
  entitlements,
  profiles,
  type Entitlement,
  type InsertProfile,
  type Profile,
} from "@db/schema";
import { getDb } from "./connection";

export async function findProfileByUserId(
  userId: number,
): Promise<Profile | undefined> {
  const rows = await getDb()
    .select()
    .from(profiles)
    .where(eq(profiles.userId, userId))
    .limit(1);
  return rows.at(0);
}

export async function findProfileById(
  profileId: number,
): Promise<Profile | undefined> {
  const rows = await getDb()
    .select()
    .from(profiles)
    .where(eq(profiles.id, profileId))
    .limit(1);
  return rows.at(0);
}

/** Lazily create a stub profile on first access (per brief: router, not seed). */
export async function ensureProfile(
  userId: number,
  defaults: { displayName: string; age?: number },
): Promise<Profile> {
  const existing = await findProfileByUserId(userId);
  if (existing) return existing;
  await getDb()
    .insert(profiles)
    .values({
      userId,
      displayName: defaults.displayName,
      age: defaults.age ?? 28,
      relationshipGoal: "explore",
      onboardingComplete: false,
    })
    .onDuplicateKeyUpdate({ set: { displayName: defaults.displayName } });
  const created = await findProfileByUserId(userId);
  if (!created) throw new Error("Failed to create profile");
  return created;
}

export async function ensureEntitlement(userId: number): Promise<Entitlement> {
  const db = getDb();
  const rows = await db
    .select()
    .from(entitlements)
    .where(eq(entitlements.userId, userId))
    .limit(1);
  const existing = rows.at(0);
  if (existing) return existing;
  await db
    .insert(entitlements)
    .values({ userId })
    .onDuplicateKeyUpdate({ set: { userId } });
  const created = await db
    .select()
    .from(entitlements)
    .where(eq(entitlements.userId, userId))
    .limit(1);
  const ent = created.at(0);
  if (!ent) throw new Error("Failed to create entitlements");
  return ent;
}

export async function upsertProfile(
  userId: number,
  data: Partial<Omit<InsertProfile, "userId">>,
): Promise<Profile> {
  const db = getDb();
  const existing = await findProfileByUserId(userId);

  // Merge to decide onboarding completion: core identity + intent + content.
  const merged = { ...existing, ...data };
  const onboardingComplete = Boolean(
    merged.displayName &&
      merged.age &&
      merged.relationshipGoal &&
      Array.isArray(merged.photos) &&
      merged.photos.length >= 1 &&
      Array.isArray(merged.prompts) &&
      merged.prompts.length >= 1,
  );

  const set: Partial<InsertProfile> = { ...data, onboardingComplete };

  if (existing) {
    await db.update(profiles).set(set).where(eq(profiles.userId, userId));
  } else {
    await db
      .insert(profiles)
      .values({
        userId,
        displayName: data.displayName ?? "New member",
        age: data.age ?? 28,
        ...set,
      })
      .onDuplicateKeyUpdate({ set });
  }

  const profile = await findProfileByUserId(userId);
  if (!profile) throw new Error("Failed to upsert profile");
  return profile;
}

export async function markVerified(userId: number): Promise<Profile> {
  const db = getDb();
  await db
    .update(profiles)
    .set({ verificationStatus: "verified", verified: true })
    .where(eq(profiles.userId, userId));
  const profile = await findProfileByUserId(userId);
  if (!profile) throw new Error("Profile not found");
  return profile;
}

export async function updateProfileSettings(
  userId: number,
  settings: { anonymityMode?: boolean; hiddenWords?: string[] },
): Promise<Profile> {
  await getDb()
    .update(profiles)
    .set(settings)
    .where(eq(profiles.userId, userId));
  const profile = await findProfileByUserId(userId);
  if (!profile) throw new Error("Profile not found");
  return profile;
}
