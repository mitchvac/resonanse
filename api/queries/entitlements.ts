import { eq } from "drizzle-orm";
import { entitlements, type Entitlement } from "@db/schema";
import { getDb } from "./connection";
import { ensureEntitlement as ensureEntitlementRow } from "./profiles";

export { ensureEntitlementRow };

export const TRIAL_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;
const TRIAL_MS = TRIAL_DAYS * DAY_MS;

/**
 * Read-side entitlement: an active free trial is presented as full Resonance X
 * access without permanently writing tier='x' to the row. When trialEndsAt
 * passes, the stored free defaults come back automatically.
 */
export function effectiveEntitlement(ent: Entitlement, now = new Date()): Entitlement {
  const trialActive =
    ent.tier === "free" && !!ent.trialEndsAt && ent.trialEndsAt.getTime() > now.getTime();
  if (!trialActive) return ent;
  return { ...ent, tier: "x", dailyLikeLimit: 999, pulses: 99, boosts: 99 };
}

export async function ensureEntitlement(userId: number): Promise<Entitlement> {
  return effectiveEntitlement(await ensureEntitlementRow(userId));
}

export function trialState(ent: Entitlement, now = new Date()) {
  const endsAt = ent.trialEndsAt ?? null;
  const active =
    ent.tier === "free" && !!endsAt && endsAt.getTime() > now.getTime();
  const eligible = ent.tier === "free" && !endsAt;
  const daysLeft =
    active && endsAt
      ? Math.max(1, Math.ceil((endsAt.getTime() - now.getTime()) / DAY_MS))
      : 0;
  return { active, eligible, daysLeft, endsAt };
}

export async function beginTrial(userId: number): Promise<Entitlement> {
  await ensureEntitlementRow(userId);
  const now = new Date();
  const endsAt = new Date(now.getTime() + TRIAL_MS);
  await getDb()
    .update(entitlements)
    .set({ trialStartedAt: now, trialEndsAt: endsAt })
    .where(eq(entitlements.userId, userId));
  return ensureEntitlement(userId);
}

export async function setTier(
  userId: number,
  tier: "plus" | "x",
): Promise<Entitlement> {
  await ensureEntitlementRow(userId);
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
  const ent = await ensureEntitlementRow(userId);
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
  const ent = await ensureEntitlementRow(userId);
  await getDb()
    .update(entitlements)
    .set({ boosts: ent.boosts + count })
    .where(eq(entitlements.userId, userId));
  return ensureEntitlement(userId);
}

/** Back to free-tier defaults — purchased pulses are kept. */
export async function cancelSubscription(userId: number): Promise<Entitlement> {
  await ensureEntitlementRow(userId);
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
  const effective = await ensureEntitlement(userId);
  // X (paid or active trial) is unlimited — never burn the stored balance.
  if (effective.tier === "x") return effective;
  const raw = await ensureEntitlementRow(userId);
  if (raw.pulses <= 0) return effective;
  await getDb()
    .update(entitlements)
    .set({ pulses: raw.pulses - 1 })
    .where(eq(entitlements.userId, userId));
  return ensureEntitlement(userId);
}
