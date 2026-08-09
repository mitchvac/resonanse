/**
 * bountyRouter — Referral bounty program v1 (V71).
 *
 * Members share a stable code; a new member applies it within 7 days of
 * joining; the referrer earns a flat $7.00 obligation that vests (NET-30)
 * once the referred member has kept a paid subscription for 30 days.
 * Payouts are executed by the OWNER from his self-custody wallet — the
 * server only records the obligation ledger and the tx hash; it never
 * moves money and never touches keys or seed phrases.
 *
 * PRIVACY: referral rows never expose referred-member PII beyond the id.
 *
 * NOT registered in api/router.ts here — the orchestrator wires it.
 */
import { TRPCError } from "@trpc/server";
import { desc, inArray } from "drizzle-orm";
import { z } from "zod";
import * as schema from "@db/schema";
import type { User } from "@db/schema";
import { createRouter, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { env } from "./lib/env";
import {
  CLAIM_WINDOW_DAYS,
  formatUsdMicro,
  getOrCreateReferralCode,
  parseReferralCode,
  REFERRAL_BOUNTY_USD_MICRO,
} from "./lib/bounty/codes";
import { claimReferralCode, getReferralState } from "./lib/bounty/referrals";
import {
  approveObligation,
  markObligationPaid,
  qualifyDueReferrals,
  voidObligation,
} from "./lib/bounty/ledger";

/** Admins only: role flag OR the owner email (when ADMIN_EMAIL is set). */
function adminGate(user: User): void {
  const isRoleAdmin = user.role === "admin";
  const adminEmail = env.adminEmail;
  const isEmailAdmin =
    adminEmail !== "" &&
    (user.email ?? "").toLowerCase() === adminEmail.toLowerCase();
  if (!isRoleAdmin && !isEmailAdmin) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Admins only." });
  }
}

/** Label recorded on approve/pay transitions — who did it. */
function adminLabel(user: User): string {
  return user.email ?? `user:${user.id}`;
}

export const bountyRouter = createRouter({
  /** The member's stable referral code + display constants. */
  myCode: authedQuery.query(({ ctx }) => ({
    code: getOrCreateReferralCode(ctx.user.id),
    claimWindowDays: CLAIM_WINDOW_DAYS,
    bountyUsdText: formatUsdMicro(REFERRAL_BOUNTY_USD_MICRO),
  })),

  /** Apply someone's referral code to the caller's (new) account. */
  claimCode: authedQuery
    .input(z.object({ code: z.string().min(4).max(32) }))
    .mutation(async ({ ctx, input }) => {
      const referrerUserId = parseReferralCode(input.code);
      if (referrerUserId === null) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "That code doesn't look right.",
        });
      }
      return claimReferralCode(referrerUserId, ctx.user.id);
    }),

  /**
   * Member's own bounty state. Runs lazy vesting first so qualified rows
   * surface without a cron. Referral rows carry NO referred-member PII.
   */
  myBounties: authedQuery.query(async ({ ctx }) => {
    await qualifyDueReferrals();
    const state = await getReferralState(ctx.user.id);
    return {
      obligations: state.obligations,
      referrals: state.referrals.map((r) => ({
        id: r.id,
        referredUserId: r.referredUserId,
        status: r.status,
        createdAt: r.createdAt,
        qualifiedAt: r.qualifiedAt,
      })),
      totals: state.totals,
    };
  }),

  /** Admin: run the lazy vesting pass on demand. */
  adminQualify: authedQuery.mutation(async ({ ctx }) => {
    adminGate(ctx.user);
    const qualified = await qualifyDueReferrals();
    return { qualified };
  }),

  /**
   * Admin: payout queue — pending/qualified/approved obligations, newest
   * first, enriched with payout-readiness signals. Payout-ready requires an
   * approved obligation + wallet + Identity Vault record + CLEAR sanctions
   * verdict (latest screening for the member's pseudonymous customerRef).
   */
  adminQueue: authedQuery.query(async ({ ctx }) => {
    adminGate(ctx.user);
    await qualifyDueReferrals();
    const db = getDb();
    const obligations = await db
      .select()
      .from(schema.bountyObligations)
      .where(
        inArray(schema.bountyObligations.status, [
          "pending",
          "qualified",
          "approved",
        ]),
      )
      .orderBy(desc(schema.bountyObligations.id))
      .limit(200);
    if (obligations.length === 0) return [];

    const userIds = [...new Set(obligations.map((o) => o.userId))];
    const walletRows = await db
      .select({ userId: schema.dcWallets.userId })
      .from(schema.dcWallets)
      .where(inArray(schema.dcWallets.userId, userIds));
    const walletUserIds = new Set(walletRows.map((r) => r.userId));

    // customerRef is the ONLY link from a user to vault/sanctions records.
    const keyRows = await db
      .select({
        userId: schema.walletKeys.userId,
        customerRef: schema.walletKeys.customerRef,
      })
      .from(schema.walletKeys)
      .where(inArray(schema.walletKeys.userId, userIds));
    const refByUserId = new Map<number, string>();
    for (const row of keyRows) {
      if (row.customerRef) refByUserId.set(row.userId, row.customerRef);
    }
    const refs = [...new Set(refByUserId.values())];

    const vaultRefs = new Set<string>();
    const latestVerdictByRef = new Map<
      string,
      (typeof schema.SANCTIONS_VERDICTS)[number]
    >();
    if (refs.length > 0) {
      const vaultRows = await db
        .select({ customerRef: schema.identityVault.customerRef })
        .from(schema.identityVault)
        .where(inArray(schema.identityVault.customerRef, refs));
      for (const row of vaultRows) vaultRefs.add(row.customerRef);

      // sanctions_results has no userId — keyed by the pseudonymous
      // customerRef, newest screening first, first row per ref wins.
      const sanctionRows = await db
        .select({
          customerRef: schema.sanctionsResults.customerRef,
          verdict: schema.sanctionsResults.verdict,
        })
        .from(schema.sanctionsResults)
        .where(inArray(schema.sanctionsResults.customerRef, refs))
        .orderBy(desc(schema.sanctionsResults.screenedAt));
      for (const row of sanctionRows) {
        if (!latestVerdictByRef.has(row.customerRef)) {
          latestVerdictByRef.set(row.customerRef, row.verdict);
        }
      }
    }

    return obligations.map((obligation) => {
      const hasWallet = walletUserIds.has(obligation.userId);
      const customerRef = refByUserId.get(obligation.userId) ?? null;
      const hasVaultRecord =
        customerRef !== null && vaultRefs.has(customerRef);
      const latestSanctionsVerdict =
        customerRef !== null
          ? (latestVerdictByRef.get(customerRef) ?? null)
          : null;
      const payoutReady =
        obligation.status === "approved" &&
        hasWallet &&
        hasVaultRecord &&
        latestSanctionsVerdict === "CLEAR";
      return {
        ...obligation,
        hasWallet,
        hasVaultRecord,
        latestSanctionsVerdict,
        payoutReady,
      };
    });
  }),

  /** Admin: 'qualified' → 'approved' (green-light for payout). */
  adminApprove: authedQuery
    .input(z.object({ obligationId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      adminGate(ctx.user);
      await approveObligation(input.obligationId, adminLabel(ctx.user));
      return { ok: true as const };
    }),

  /** Admin: void a pending/qualified obligation. */
  adminVoid: authedQuery
    .input(z.object({ obligationId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      adminGate(ctx.user);
      await voidObligation(input.obligationId);
      return { ok: true as const };
    }),

  /**
   * Admin: record the owner-executed payout. txHash is the on-chain hash of
   * the payment sent from the owner's self-custody wallet — the server never
   * broadcasts or signs anything.
   */
  adminMarkPaid: authedQuery
    .input(
      z.object({
        obligationId: z.number().int().positive(),
        txHash: z.string().regex(/^[0-9A-Fa-f]{64}$/),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      adminGate(ctx.user);
      await markObligationPaid(
        input.obligationId,
        input.txHash.toUpperCase(),
        adminLabel(ctx.user),
      );
      return { ok: true as const };
    }),
});
