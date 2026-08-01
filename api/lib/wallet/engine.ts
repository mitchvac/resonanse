/**
 * Marketplace engine — faithful port of
 * smart-custody-wallet/src/marketplace/engine.ts.
 *
 * - Only original-100k wallets can be suppliers.
 * - Smart Custody Switch OFF wallets are skipped.
 * - A supplier is never pushed below MINIMUM_DATE_COIN_BALANCE.
 * - Automatic fallback to the next eligible wallet; fails closed when the
 *   pool is exhausted.
 * - Top-ups route through the PLATFORM sale path and credit exactly once.
 *
 * The `*Tx` variants run inside a caller-managed transaction so payment
 * confirmation can settle atomically with intent + entitlement updates.
 */
import { randomUUID } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import * as schema from "@db/schema";
import { getDb } from "../../queries/connection";
import { debitSupplierGuarded, settleSale, type SettledSale } from "./ledger";
import { PLATFORM_SELLER } from "./constants";
import type { Tx } from "./db";

export type PaidWith = (typeof schema.DC_PAID_WITH)[number];

export class SupplierPoolExhaustedError extends Error {
  constructor() {
    super(
      "No eligible Date-Coin supplier available at this time (all switches OFF or below minimum)",
    );
    this.name = "SupplierPoolExhaustedError";
  }
}

export type FulfillParams = {
  buyerWalletId: string;
  amount: number;
  paidWith: PaidWith;
  totalPaidText: string;
  cryptoIntentId?: string | null;
  actor: string;
};

/**
 * Marketplace fulfillment inside a transaction: pick the first eligible
 * original-100k supplier (switch ON, enough above the minimum), debit it,
 * credit the buyer, ratchet the price, and record the supplier reward
 * obligation. Falls back across suppliers; throws SupplierPoolExhaustedError
 * (rolling back the transaction) when none can supply.
 */
export async function fulfillMarketplaceTx(
  tx: Tx,
  params: FulfillParams,
): Promise<SettledSale> {
  // Eligible suppliers: original 100k AND switch ON, deterministic order.
  const candidates = await tx
    .select({ walletId: schema.dcWallets.walletId })
    .from(schema.dcWallets)
    .innerJoin(
      schema.dcLedger,
      eq(schema.dcLedger.walletId, schema.dcWallets.walletId),
    )
    .where(
      and(
        eq(schema.dcWallets.isOriginalHundredK, true),
        eq(schema.dcWallets.switchOn, true),
      ),
    )
    .orderBy(asc(schema.dcWallets.id));

  for (const candidate of candidates) {
    // Enforce the hard minimum atomically; fall back on failure.
    const debited = await debitSupplierGuarded(
      tx,
      candidate.walletId,
      params.amount,
    );
    if (!debited) continue;

    return settleSale(tx, {
      saleId: `sale_${randomUUID()}`,
      buyerWalletId: params.buyerWalletId,
      sellerWalletId: candidate.walletId,
      amount: params.amount,
      paidWith: params.paidWith,
      totalPaidText: params.totalPaidText,
      cryptoIntentId: params.cryptoIntentId ?? null,
      withSupplierReward: true,
      actor: params.actor,
    });
  }

  // Fail closed with an explicit error.
  throw new SupplierPoolExhaustedError();
}

/** PLATFORM top-up inside a transaction — credits the buyer exactly once. */
export async function platformTopUpTx(
  tx: Tx,
  params: FulfillParams,
): Promise<SettledSale> {
  return settleSale(tx, {
    saleId: `platform_${randomUUID()}`,
    buyerWalletId: params.buyerWalletId,
    sellerWalletId: PLATFORM_SELLER,
    amount: params.amount,
    paidWith: params.paidWith,
    totalPaidText: params.totalPaidText,
    cryptoIntentId: params.cryptoIntentId ?? null,
    withSupplierReward: false,
    actor: params.actor,
  });
}

/** Standalone marketplace fulfillment (opens its own transaction). */
export async function fulfillMarketplace(
  params: FulfillParams,
): Promise<SettledSale> {
  return getDb().transaction((tx) => fulfillMarketplaceTx(tx, params));
}

/** Standalone PLATFORM top-up (opens its own transaction). */
export async function platformTopUp(params: FulfillParams): Promise<SettledSale> {
  return getDb().transaction((tx) => platformTopUpTx(tx, params));
}
