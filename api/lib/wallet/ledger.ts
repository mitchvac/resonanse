/**
 * DB-backed Date-Coin ledger — faithful port of
 * smart-custody-wallet/src/chains/internal/dateCoinLedger.ts.
 *
 * Invariants enforced here:
 *  - Price is up-only: every sale ratchets +PRICE_INCREMENT_MICRO.
 *  - PLATFORM sales credit the buyer exactly once (the prototype's
 *    mint()+executeSale() double-credit bug is fixed by settling once).
 *  - All multi-write operations run inside ONE transaction (fail closed).
 *
 * V69 CLOSED LOOP: Date-Coin is a strictly in-app credit (see Legal.tsx).
 * The marketplace/supplier path and XRP supplier rewards were removed —
 * the platform is the sole seller, and no code path converts Date-Coin
 * into XRP or any other value outside the app.
 */
import { and, eq, gte, sql } from "drizzle-orm";
import * as schema from "@db/schema";
import { audit, ensurePriceState, type DbOrTx } from "./db";
import { PRICE_INCREMENT_MICRO } from "./constants";

export async function getBalance(db: DbOrTx, walletId: string): Promise<number> {
  const rows = await db
    .select()
    .from(schema.dcLedger)
    .where(eq(schema.dcLedger.walletId, walletId))
    .limit(1);
  return rows.at(0)?.balance ?? 0;
}

/** Create (or no-op) a ledger row, then add `amount` coins atomically. */
export async function creditBalance(
  db: DbOrTx,
  walletId: string,
  amount: number,
): Promise<void> {
  await db
    .insert(schema.dcLedger)
    .values({ walletId, balance: amount })
    .onConflictDoUpdate({
      target: schema.dcLedger.walletId,
      set: { balance: sql`${schema.dcLedger.balance} + ${amount}` },
    });
}

/** Debit any wallet, throwing (fail closed) if the balance is insufficient. */
export async function debitBalanceOrThrow(
  db: DbOrTx,
  walletId: string,
  amount: number,
): Promise<void> {
  const rows = await db
    .update(schema.dcLedger)
    .set({ balance: sql`${schema.dcLedger.balance} - ${amount}` })
    .where(
      and(
        eq(schema.dcLedger.walletId, walletId),
        gte(schema.dcLedger.balance, amount),
      ),
    )
    .returning({ walletId: schema.dcLedger.walletId });
  if (rows.length !== 1) {
    throw new Error("Insufficient Date-Coin balance");
  }
}

export type SettleSaleParams = {
  saleId: string;
  buyerWalletId: string;
  /** Supplier walletId, or PLATFORM_SELLER for platform top-up sales. */
  sellerWalletId: string;
  amount: number;
  paidWith: (typeof schema.DC_PAID_WITH)[number];
  totalPaidText: string;
  cryptoIntentId?: string | null;
  actor: string;
};

export type SettledSale = {
  saleId: string;
  buyerWalletId: string;
  sellerWalletId: string;
  amount: number;
  pricePerCoinMicro: number;
  priceAfterSaleMicro: number;
  /** Always null since V69 — supplier XRP rewards were removed (closed loop). */
  rewardAmountXrpText: string | null;
};

/**
 * Settle a sale in one shot: credit the buyer, ratchet the price up, record
 * the sale and audit. Since V69 every sale is a PLATFORM sale — the platform
 * is the sole seller of this closed-loop in-app credit.
 *
 * MUST be called inside a transaction.
 */
export async function settleSale(
  db: DbOrTx,
  params: SettleSaleParams,
): Promise<SettledSale> {
  const priceState = await ensurePriceState(db);
  const priceBefore = priceState.currentPriceMicro;
  const priceAfter = priceBefore + PRICE_INCREMENT_MICRO;

  // Credit the buyer exactly once (never combined with a separate mint).
  await creditBalance(db, params.buyerWalletId, params.amount);

  // Ratchet the up-only price.
  await db
    .update(schema.dcPriceState)
    .set({
      currentPriceMicro: priceAfter,
      totalSalesCount: priceState.totalSalesCount + 1,
      lastSaleAt: new Date(),
    })
    .where(eq(schema.dcPriceState.id, priceState.id));

  // Record the sale at the pre-ratchet price.
  await db.insert(schema.dcSales).values({
    saleId: params.saleId,
    buyerWalletId: params.buyerWalletId,
    sellerWalletId: params.sellerWalletId,
    amount: params.amount,
    pricePerCoinMicro: priceBefore,
    totalPaidText: params.totalPaidText,
    paidWith: params.paidWith,
    cryptoIntentId: params.cryptoIntentId ?? null,
  });

  // V69 CLOSED LOOP: no supplier reward is recorded. Date-Coin never
  // converts to XRP (or anything else) — it is spent only inside the app.
  const rewardAmountXrpText: string | null = null;

  await audit(db, params.actor, "SALE", {
    saleId: params.saleId,
    buyerWalletId: params.buyerWalletId,
    sellerWalletId: params.sellerWalletId,
    amount: params.amount,
    pricePerCoinMicro: priceBefore,
    priceAfterSaleMicro: priceAfter,
    paidWith: params.paidWith,
    totalPaidText: params.totalPaidText,
    cryptoIntentId: params.cryptoIntentId ?? null,
  });

  return {
    saleId: params.saleId,
    buyerWalletId: params.buyerWalletId,
    sellerWalletId: params.sellerWalletId,
    amount: params.amount,
    pricePerCoinMicro: priceBefore,
    priceAfterSaleMicro: priceAfter,
    rewardAmountXrpText,
  };
}

/** Burn Date-Coin when a user spends it on platform services. */
export async function burn(
  db: DbOrTx,
  walletId: string,
  amount: number,
  actor: string,
): Promise<void> {
  await debitBalanceOrThrow(db, walletId, amount);
  await audit(db, actor, "BURN", { walletId, amount });
}
