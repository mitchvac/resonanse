/**
 * DB-backed Date-Coin ledger — faithful port of
 * smart-custody-wallet/src/chains/internal/dateCoinLedger.ts.
 *
 * Invariants enforced here:
 *  - Price is up-only: every sale ratchets +PRICE_INCREMENT_MICRO.
 *  - A supplier can never be pushed below MINIMUM_DATE_COIN_BALANCE.
 *  - PLATFORM sales credit the buyer exactly once (the prototype's
 *    mint()+executeSale() double-credit bug is fixed by settling once).
 *  - All multi-write operations run inside ONE transaction (fail closed).
 */
import { and, eq, gte, sql } from "drizzle-orm";
import * as schema from "@db/schema";
import { audit, ensurePriceState, type DbOrTx } from "./db";
import {
  ASSET_USD_MICRO,
  MINIMUM_DATE_COIN_BALANCE,
  PLATFORM_SELLER,
  PRICE_INCREMENT_MICRO,
  SUPPLIER_BONUS_PERCENT,
} from "./constants";
import { percentOfMicro, usdMicroToAssetText } from "./util";

function affectedRows(result: unknown): number {
  if (Array.isArray(result)) {
    const head = result[0] as { affectedRows?: number } | undefined;
    return head?.affectedRows ?? 0;
  }
  return (result as { affectedRows?: number })?.affectedRows ?? 0;
}

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
    .onDuplicateKeyUpdate({
      set: { balance: sql`${schema.dcLedger.balance} + ${amount}` },
    });
}

/**
 * Atomically debit a supplier, enforcing the hard minimum. Returns true when
 * the debit happened; false when the wallet cannot supply `amount` while
 * keeping at least MINIMUM_DATE_COIN_BALANCE (the Marketplace must then fall
 * back to the next eligible wallet).
 */
export async function debitSupplierGuarded(
  db: DbOrTx,
  walletId: string,
  amount: number,
): Promise<boolean> {
  const result = await db
    .update(schema.dcLedger)
    .set({ balance: sql`${schema.dcLedger.balance} - ${amount}` })
    .where(
      and(
        eq(schema.dcLedger.walletId, walletId),
        gte(schema.dcLedger.balance, amount + MINIMUM_DATE_COIN_BALANCE),
      ),
    );
  return affectedRows(result) === 1;
}

/** Debit any wallet, throwing (fail closed) if the balance is insufficient. */
export async function debitBalanceOrThrow(
  db: DbOrTx,
  walletId: string,
  amount: number,
): Promise<void> {
  const result = await db
    .update(schema.dcLedger)
    .set({ balance: sql`${schema.dcLedger.balance} - ${amount}` })
    .where(
      and(
        eq(schema.dcLedger.walletId, walletId),
        gte(schema.dcLedger.balance, amount),
      ),
    );
  if (affectedRows(result) !== 1) {
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
  /** Marketplace sales set this to record the supplier XRP reward obligation. */
  withSupplierReward?: boolean;
  actor: string;
};

export type SettledSale = {
  saleId: string;
  buyerWalletId: string;
  sellerWalletId: string;
  amount: number;
  pricePerCoinMicro: number;
  priceAfterSaleMicro: number;
  /** XRP reward obligation text (marketplace sales only), else null. */
  rewardAmountXrpText: string | null;
};

/**
 * Settle a sale in one shot: credit the buyer, ratchet the price up, record
 * the sale (+ optional supplier reward obligation) and audit. The supplier
 * debit, when applicable, is performed separately via debitSupplierGuarded so
 * the Marketplace can fall back across suppliers before committing.
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

  // Supplier reward obligation (platform treasury pays XRP; never broadcast).
  // Reward = 6% of the coin value at the pre-ratchet price, quoted in XRP.
  let rewardAmountXrpText: string | null = null;
  if (params.sellerWalletId !== PLATFORM_SELLER && params.withSupplierReward) {
    const coinValueUsdMicro = params.amount * priceBefore;
    const rewardUsdMicro = percentOfMicro(
      coinValueUsdMicro,
      SUPPLIER_BONUS_PERCENT,
    );
    rewardAmountXrpText = usdMicroToAssetText(
      rewardUsdMicro,
      ASSET_USD_MICRO.XRP,
      6,
    );
    await db.insert(schema.dcRewards).values({
      supplierWalletId: params.sellerWalletId,
      saleId: params.saleId,
      amountXrpText: rewardAmountXrpText,
      status: "pending",
    });
  }

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
