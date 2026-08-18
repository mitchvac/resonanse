/**
 * Referral-bounty (V71) — claim + member-facing state.
 *
 * Claiming a code writes TWO rows in ONE transaction: the referral_attributions
 * row (UNIQUE(referredUserId) enforces one-code-per-account) and the paired
 * bounty_obligations row earning the referrer $7.00 once the referral qualifies.
 */
import { TRPCError } from "@trpc/server";
import { desc, eq } from "drizzle-orm";
import * as schema from "@db/schema";
import { getDb } from "../../queries/connection";
import {
  CLAIM_WINDOW_DAYS,
  REFERRAL_BOUNTY_USD_MICRO,
} from "./codes";

/** bounty_obligations.bountyType for a converted referral. */
export const BOUNTY_TYPE_REFERRAL_CONVERSION = "referral_conversion";
/** bounty_obligations.refType pointing back at referral_attributions.id. */
export const REF_TYPE_REFERRAL_ATTRIBUTION = "referral_attribution";

function isDupEntry(err: unknown, depth = 0): boolean {
  if (typeof err !== "object" || err === null || depth > 4) return false;
  const e = err as { code?: string; cause?: unknown };
  if (e.code === "ER_DUP_ENTRY" || e.code === "23505") return true;
  // drizzle wraps driver errors ("Failed query: …") with the original
  // driver error on .cause — walk the chain.
  return isDupEntry(e.cause, depth + 1);
}

/**
 * Apply a referral code to the referred member's account.
 *
 * Rules: no self-referral; the referred account must be ≤ CLAIM_WINDOW_DAYS
 * old; one code per account (enforced by the unique index → CONFLICT).
 */
export async function claimReferralCode(
  referrerUserId: number,
  referredUserId: number,
): Promise<{ ok: true }> {
  if (referrerUserId === referredUserId) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "You can't use your own code.",
    });
  }

  const db = getDb();
  const referredRows = await db
    .select({ id: schema.users.id, createdAt: schema.users.createdAt })
    .from(schema.users)
    .where(eq(schema.users.id, referredUserId))
    .limit(1);
  const referred = referredRows.at(0);
  if (!referred) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Account not found." });
  }
  const ageMs = Date.now() - referred.createdAt.getTime();
  if (ageMs > CLAIM_WINDOW_DAYS * 24 * 60 * 60 * 1000) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Referral codes can only be applied within ${CLAIM_WINDOW_DAYS} days of joining.`,
    });
  }

  try {
    await db.transaction(async (tx) => {
      const [{ id: attributionId }] = await tx
        .insert(schema.referralAttributions)
        .values({
          referrerUserId,
          referredUserId,
          source: "claim",
          status: "pending",
        })
        .returning({ id: schema.referralAttributions.id });
      await tx.insert(schema.bountyObligations).values({
        userId: referrerUserId,
        bountyType: BOUNTY_TYPE_REFERRAL_CONVERSION,
        amountUsdMicro: REFERRAL_BOUNTY_USD_MICRO,
        status: "pending",
        refType: REF_TYPE_REFERRAL_ATTRIBUTION,
        refId: attributionId,
      });
    });
  } catch (err) {
    if (isDupEntry(err)) {
      throw new TRPCError({
        code: "CONFLICT",
        message: "A referral code was already applied to this account.",
      });
    }
    throw err;
  }
  return { ok: true as const };
}

export type ReferralStateTotals = {
  totalPendingUsdMicro: number;
  totalQualifiedUsdMicro: number;
  totalPaidUsdMicro: number;
  lifetimeUsdMicro: number;
};

/**
 * Member-facing referral + bounty state. Referral rows join the referred
 * user's createdAt for internal use; callers must NOT expose referred-user
 * PII beyond the id.
 */
export async function getReferralState(userId: number): Promise<{
  referrals: Array<{
    id: number;
    referredUserId: number;
    status: (typeof schema.REFERRAL_STATUSES)[number];
    createdAt: Date;
    qualifiedAt: Date | null;
    referredCreatedAt: Date;
  }>;
  obligations: schema.BountyObligation[];
  totals: ReferralStateTotals;
}> {
  const db = getDb();
  const referrals = await db
    .select({
      id: schema.referralAttributions.id,
      referredUserId: schema.referralAttributions.referredUserId,
      status: schema.referralAttributions.status,
      createdAt: schema.referralAttributions.createdAt,
      qualifiedAt: schema.referralAttributions.qualifiedAt,
      referredCreatedAt: schema.users.createdAt,
    })
    .from(schema.referralAttributions)
    .innerJoin(
      schema.users,
      eq(schema.users.id, schema.referralAttributions.referredUserId),
    )
    .where(eq(schema.referralAttributions.referrerUserId, userId))
    .orderBy(desc(schema.referralAttributions.id));

  const obligations = await db
    .select()
    .from(schema.bountyObligations)
    .where(eq(schema.bountyObligations.userId, userId))
    .orderBy(desc(schema.bountyObligations.id));

  const totals: ReferralStateTotals = {
    totalPendingUsdMicro: 0,
    totalQualifiedUsdMicro: 0,
    totalPaidUsdMicro: 0,
    lifetimeUsdMicro: 0,
  };
  for (const obligation of obligations) {
    // 'approved' counts as qualified: earned, awaiting payout.
    if (obligation.status === "pending") {
      totals.totalPendingUsdMicro += obligation.amountUsdMicro;
    } else if (
      obligation.status === "qualified" ||
      obligation.status === "approved"
    ) {
      totals.totalQualifiedUsdMicro += obligation.amountUsdMicro;
    } else if (obligation.status === "paid") {
      totals.totalPaidUsdMicro += obligation.amountUsdMicro;
    }
    // Lifetime = everything not void/clawed back.
    if (obligation.status !== "void" && obligation.status !== "clawedback") {
      totals.lifetimeUsdMicro += obligation.amountUsdMicro;
    }
  }
  return { referrals, obligations, totals };
}
