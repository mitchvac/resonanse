import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createRouter, authedQuery } from "./middleware";
import { env } from "./lib/env";
import {
  confirmPayment,
  createPaymentIntent,
  getAdminTreasury,
  getBuyQuote,
  getHistory,
  getWalletState,
  grantAuthority,
  isValidXlmAddress,
  isValidXrplAddress,
  setSwitch,
  WalletError,
} from "./lib/wallet/service";

const WALLET_ERROR_CODE: Record<WalletError["code"], TRPCError["code"]> = {
  WALLET_NOT_FOUND: "NOT_FOUND",
  INTENT_NOT_FOUND: "NOT_FOUND",
  FORBIDDEN: "FORBIDDEN",
  QUOTE_TOO_SMALL: "BAD_REQUEST",
  POOL_EXHAUSTED: "CONFLICT",
  ASSET_UNAVAILABLE: "PRECONDITION_FAILED",
};

/** Run a wallet service call, translating domain errors into tRPC errors. */
async function run<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof WalletError) {
      throw new TRPCError({
        code: WALLET_ERROR_CODE[err.code] ?? "INTERNAL_SERVER_ERROR",
        message: err.message,
      });
    }
    throw err;
  }
}

export const walletRouter = createRouter({
  /** Current wallet + up-only system price snapshot. */
  state: authedQuery.query(({ ctx }) =>
    run(() => getWalletState(ctx.user.id)),
  ),

  /** Create the Smart Custody wallet (idempotent); airdrops first 100k. */
  grantAuthority: authedQuery.mutation(({ ctx }) =>
    run(async () => {
      const { wallet, created, airdropped } = await grantAuthority(
        ctx.user.id,
      );
      return {
        walletId: wallet.walletId,
        switchOn: wallet.switchOn,
        isOriginalHundredK: wallet.isOriginalHundredK,
        created,
        airdropped,
      };
    }),
  ),

  /** Toggle the Smart Custody Switch. */
  setSwitch: authedQuery
    .input(z.object({ on: z.boolean() }))
    .mutation(({ ctx, input }) =>
      run(async () => {
        const wallet = await setSwitch(ctx.user.id, input.on);
        return { walletId: wallet.walletId, switchOn: wallet.switchOn };
      }),
    ),

  /** The user's sales (buy or sell), newest first, 20/page. */
  history: authedQuery
    // Cursor is an opaque offset string (client contract: string | null).
    .input(z.object({ cursor: z.string().optional() }))
    .query(({ ctx, input }) =>
      run(async () => {
        const parsed = input.cursor === undefined ? NaN : Number(input.cursor);
        const offset = Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : 0;
        const page = await getHistory(ctx.user.id, offset);
        return {
          items: page.items.map((item) => ({
            id: item.saleId,
            kind: item.direction === "buy" ? ("BOUGHT" as const) : ("SUPPLIED" as const),
            coins: item.amount,
            /** micro-USD per coin (client formats with formatPriceMicro) */
            pricePerCoin: item.pricePerCoinMicro,
            asset: item.paidWith,
            at: item.createdAt,
          })),
          nextCursor: page.nextCursor === null ? null : String(page.nextCursor),
        };
      }),
    ),

  /** Informational buy quote at the current price. */
  buyQuote: authedQuery
    .input(z.object({ usdMicro: z.number().int().min(0) }))
    .query(({ input }) => run(() => getBuyQuote(input.usdMicro))),

  /** Which crypto assets are actually configured for checkout (never expose placeholders). */
  paymentAssets: authedQuery.query(() => {
    const assets: Array<"XRP" | "RLUSD" | "XLM"> = [];
    if (isValidXrplAddress(env.merchantXrpAddress)) assets.push("XRP", "RLUSD");
    if (isValidXlmAddress(env.merchantXlmAddress)) assets.push("XLM");
    return { assets };
  }),

  /** Create a watch-only payment intent (30-min expiry). */
  createPayment: authedQuery
    .input(
      z.object({
        purpose: z.enum(["SUBSCRIPTION_PLUS", "SUBSCRIPTION_X", "TOP_UP"]),
        asset: z.enum(["XRP", "RLUSD", "XLM"]),
        /** TOP_UP only: chosen USD amount in micro-USD (defaults to the $10 pack) */
        usdMicro: z.number().int().min(1_000_000).max(10_000_000_000).optional(),
      }),
    )
    .mutation(({ ctx, input }) =>
      run(() =>
        createPaymentIntent(ctx.user.id, input.purpose, input.asset, {
          usdMicro: input.usdMicro,
        }),
      ),
    ),

  /** Server-side on-chain verification + atomic settlement (idempotent). */
  paymentStatus: authedQuery
    .input(z.object({ intentId: z.string().min(1) }))
    // Polled via useQuery (GET) from the checkout sheet — must be a query.
    .query(({ ctx, input }) =>
      run(() => confirmPayment(ctx.user.id, input.intentId)),
    ),

  /** Supplier reward obligations summary (owner only, gated on ADMIN_EMAIL). */
  adminTreasury: authedQuery.query(({ ctx }) => {
    const adminEmail = env.adminEmail;
    const userEmail = ctx.user.email ?? "";
    if (!adminEmail || userEmail.toLowerCase() !== adminEmail.toLowerCase()) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Treasury view is restricted to the owner",
      });
    }
    return run(() => getAdminTreasury());
  }),
});
