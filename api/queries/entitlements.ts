import { eq } from "drizzle-orm";
import { entitlements, type Entitlement } from "@db/schema";
import { getDb } from "./connection";
import { ensureEntitlement } from "./profiles";

export { ensureEntitlement };

export async function setTier(
  userId: number,
  tier: "plus" | "x",
): Promise<Entitlement> {
  await ensureEntitlement(userId);
  const db = getDb();
  const set =
    tier === "plus"
      ? {
          tier: "plus" as const,
          dailyLikeLimit: 999,
          renewedAt: new Date(),
        }
      : {
          tier: "x" as const,
          dailyLikeLimit: 999,
          boosts: 99, // always-on boost flag for Resonance X
          pulses: 99, // unlimited pulses (demo representation)
          renewedAt: new Date(),
        };
  await db.update(entitlements).set(set).where(eq(entitlements.userId, userId));
  return ensureEntitlement(userId);
}

export async function addPulses(
  userId: number,
  count: number,
): Promise<Entitlement> {
  const ent = await ensureEntitlement(userId);
  await getDb()
    .update(entitlements)
    .set({ pulses: ent.pulses + count })
    .where(eq(entitlements.userId, userId));
  return ensureEntitlement(userId);
}

export async function addBoosts(
  userId: number,
  count: number,
): Promise<Entitlement> {
  const ent = await ensureEntitlement(userId);
  await getDb()
    .update(entitlements)
    .set({ boosts: ent.boosts + count })
    .where(eq(entitlements.userId, userId));
  return ensureEntitlement(userId);
}

/** Back to free-tier defaults — purchased pulses are kept. */
export async function cancelSubscription(userId: number): Promise<Entitlement> {
  await ensureEntitlement(userId);
  await getDb()
    .update(entitlements)
    .set({
      tier: "free",
      dailyLikeLimit: 5,
      boosts: 0,
      renewedAt: null,
    })
    .where(eq(entitlements.userId, userId));
  return ensureEntitlement(userId);
}

export async function decrementPulses(userId: number): Promise<Entitlement> {
  const ent = await ensureEntitlement(userId);
  if (ent.pulses <= 0) return ent;
  await getDb()
    .update(entitlements)
    .set({ pulses: ent.pulses - 1 })
    .where(eq(entitlements.userId, userId));
  return ensureEntitlement(userId);
}
