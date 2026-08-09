/**
 * Referral-bounty (V71) — obligation ledger state machine.
 *
 * Status flow: pending → qualified (lazy NET-30 vesting) → approved (admin)
 * → paid (admin records the owner-executed on-chain tx hash). Void from
 * pending/qualified. Transitions are guarded on the CURRENT status so a
 * double-click or replayed call is a CONFLICT, not a corruption.
 *
 * There is no cron: qualifyDueReferrals() runs lazily from myBounties and
 * the admin queue/qualify procedures.
 */
import { TRPCError } from "@trpc/server";
import { and, eq, inArray, isNotNull, lte } from "drizzle-orm";
import * as schema from "@db/schema";
import { getDb } from "../../queries/connection";
import { QUALIFY_DAYS } from "./codes";
import { REF_TYPE_REFERRAL_ATTRIBUTION } from "./referrals";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Vest due referrals: attribution still 'pending' whose REFERRED member is
 * on a paid tier (plus/x) with renewedAt ≤ now - QUALIFY_DAYS. Each pair
 * (attribution + linked obligation) flips to 'qualified' in one transaction.
 * Returns the number of attributions qualified.
 */
export async function qualifyDueReferrals(now = new Date()): Promise<number> {
  const db = getDb();
  const cutoff = new Date(now.getTime() - QUALIFY_DAYS * DAY_MS);
  const due = await db
    .select({ id: schema.referralAttributions.id })
    .from(schema.referralAttributions)
    .innerJoin(
      schema.entitlements,
      eq(
        schema.entitlements.userId,
        schema.referralAttributions.referredUserId,
      ),
    )
    .where(
      and(
        eq(schema.referralAttributions.status, "pending"),
        inArray(schema.entitlements.tier, ["plus", "x"]),
        isNotNull(schema.entitlements.renewedAt),
        lte(schema.entitlements.renewedAt, cutoff),
      ),
    );

  let qualified = 0;
  for (const row of due) {
    await db.transaction(async (tx) => {
      // Status guards make re-entry a no-op instead of a double flip.
      await tx
        .update(schema.referralAttributions)
        .set({ status: "qualified", qualifiedAt: now })
        .where(
          and(
            eq(schema.referralAttributions.id, row.id),
            eq(schema.referralAttributions.status, "pending"),
          ),
        );
      await tx
        .update(schema.bountyObligations)
        .set({ status: "qualified", qualifiedAt: now })
        .where(
          and(
            eq(schema.bountyObligations.refType, REF_TYPE_REFERRAL_ATTRIBUTION),
            eq(schema.bountyObligations.refId, row.id),
            eq(schema.bountyObligations.status, "pending"),
          ),
        );
    });
    qualified += 1;
  }
  return qualified;
}

/** Void an attribution + its obligation together (fraud, refund, …). */
export async function voidReferral(
  attributionId: number,
  obligationId: number,
  reason: string,
): Promise<void> {
  const db = getDb();
  await db.transaction(async (tx) => {
    await tx
      .update(schema.referralAttributions)
      .set({ status: "void" })
      .where(eq(schema.referralAttributions.id, attributionId));
    await tx
      .update(schema.bountyObligations)
      .set({ status: "void", meta: { voidReason: reason } })
      .where(eq(schema.bountyObligations.id, obligationId));
  });
}

async function getObligation(id: number): Promise<schema.BountyObligation> {
  const rows = await getDb()
    .select()
    .from(schema.bountyObligations)
    .where(eq(schema.bountyObligations.id, id))
    .limit(1);
  const row = rows.at(0);
  if (!row) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Obligation not found.",
    });
  }
  return row;
}

/** 'qualified' → 'approved' (admin green-light for payout). */
export async function approveObligation(
  id: number,
  adminLabel: string,
): Promise<void> {
  const obligation = await getObligation(id);
  if (obligation.status !== "qualified") {
    throw new TRPCError({
      code: "CONFLICT",
      message: "Only qualified obligations can be approved.",
    });
  }
  await getDb()
    .update(schema.bountyObligations)
    .set({ status: "approved", meta: { approvedBy: adminLabel } })
    .where(
      and(
        eq(schema.bountyObligations.id, id),
        eq(schema.bountyObligations.status, "qualified"),
      ),
    );
}

/**
 * 'approved' → 'paid'. The server never moves money — this only RECORDS the
 * tx hash of the payout the owner executed from his self-custody wallet.
 */
export async function markObligationPaid(
  id: number,
  txHash: string,
  paidBy: string,
): Promise<void> {
  const obligation = await getObligation(id);
  if (obligation.status !== "approved") {
    throw new TRPCError({
      code: "CONFLICT",
      message: "Only approved obligations can be marked paid.",
    });
  }
  await getDb()
    .update(schema.bountyObligations)
    .set({
      status: "paid",
      paidAt: new Date(),
      paidTxHash: txHash,
      paidBy,
    })
    .where(
      and(
        eq(schema.bountyObligations.id, id),
        eq(schema.bountyObligations.status, "approved"),
      ),
    );
}

/** 'pending'|'qualified' → 'void'. Paid/void rows are terminal — CONFLICT. */
export async function voidObligation(id: number): Promise<void> {
  const obligation = await getObligation(id);
  if (obligation.status !== "pending" && obligation.status !== "qualified") {
    throw new TRPCError({
      code: "CONFLICT",
      message: "Only pending or qualified obligations can be voided.",
    });
  }
  await getDb()
    .update(schema.bountyObligations)
    .set({ status: "void" })
    .where(eq(schema.bountyObligations.id, id));
}
