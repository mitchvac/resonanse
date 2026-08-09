/**
 * Sale engine.
 *
 * V69 CLOSED LOOP: the marketplace path (member wallets "supplying" Date-Coin
 * to buyers in exchange for XRP reward obligations) was removed. Date-Coin is
 * a strictly in-app credit — the PLATFORM is the sole seller, no value ever
 * flows back out, and no code path converts Date-Coin into XRP. This keeps
 * the token outside FinCEN's convertible-virtual-currency analysis.
 *
 * The `*Tx` variants run inside a caller-managed transaction so payment
 * confirmation can settle atomically with intent + entitlement updates.
 */
import { randomUUID } from "node:crypto";
import * as schema from "@db/schema";
import { getDb } from "../../queries/connection";
import { settleSale, type SettledSale } from "./ledger";
import { PLATFORM_SELLER } from "./constants";
import type { Tx } from "./db";

export type PaidWith = (typeof schema.DC_PAID_WITH)[number];

export type FulfillParams = {
  buyerWalletId: string;
  amount: number;
  paidWith: PaidWith;
  totalPaidText: string;
  cryptoIntentId?: string | null;
  actor: string;
};

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
    actor: params.actor,
  });
}

/** Standalone PLATFORM top-up (opens its own transaction). */
export async function platformTopUp(params: FulfillParams): Promise<SettledSale> {
  return getDb().transaction((tx) => platformTopUpTx(tx, params));
}
