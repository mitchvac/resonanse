import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import * as schema from "@db/schema";
import { createRouter, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import {
  claimDaily,
  getEarnState,
  DAILY_CHECKIN_AMOUNT,
  VAULT_BONUS_AMOUNT,
} from "./lib/wallet/earn";

/**
 * walletEarnRouter — Earn Date-Coin engagement rewards (V70).
 *
 * Earned Date-Coin is promotional issuance of a closed-loop in-app credit:
 * NOT a sale (no dc_sales row, no price ratchet) and never redeemable for
 * cash or crypto. Credits land on the same dcLedger balance as purchases.
 */
export const walletEarnRouter = createRouter({
  /**
   * Earn state: { canClaimDaily, lastDailyClaimAt, nextClaimAt,
   * vaultBonusAwarded, totalEarned, earnedToday } + display constants and
   * the wallet gate. No wallet → nothing is claimable yet.
   */
  status: authedQuery.query(async ({ ctx }) => {
    const db = getDb();
    const walletRows = await db
      .select({ id: schema.dcWallets.id })
      .from(schema.dcWallets)
      .where(eq(schema.dcWallets.userId, ctx.user.id))
      .limit(1);
    const hasWallet = walletRows.length > 0;

    const state = await getEarnState(db, ctx.user.id);
    return {
      hasWallet,
      canClaimDaily: hasWallet && state.canClaimDaily,
      lastDailyClaimAt: state.lastDailyClaimAt,
      nextClaimAt: state.nextClaimAt,
      vaultBonusAwarded: state.vaultBonusAwarded,
      totalEarned: state.totalEarned,
      earnedToday: state.earnedToday,
      dailyAmount: DAILY_CHECKIN_AMOUNT,
      vaultBonusAmount: VAULT_BONUS_AMOUNT,
    };
  }),

  /**
   * Claim the daily check-in (+25 DC). FORBIDDEN when the member has no
   * Smart Custody wallet. Cooldown conflicts surface as a TRPCError
   * CONFLICT whose message tells the member when they can claim next —
   * the server is the source of truth.
   */
  claimDaily: authedQuery.mutation(async ({ ctx }) => {
    const db = getDb();
    const walletRows = await db
      .select({ id: schema.dcWallets.id })
      .from(schema.dcWallets)
      .where(eq(schema.dcWallets.userId, ctx.user.id))
      .limit(1);
    if (walletRows.length === 0) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Create your wallet first to start earning Date-Coin.",
      });
    }
    try {
      return await claimDaily(ctx.user.id);
    } catch (err) {
      if (err instanceof TRPCError) throw err;
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Couldn't complete your check-in — try again.",
      });
    }
  }),
});
