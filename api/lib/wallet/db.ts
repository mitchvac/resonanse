import { eq } from "drizzle-orm";
import * as schema from "@db/schema";
import { getDb } from "../../queries/connection";
import { INITIAL_PRICE_MICRO } from "./constants";

/** The shared database handle type. */
export type Db = ReturnType<typeof getDb>;

/** The transaction client type extracted from db.transaction(...). */
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/** Any client that can run queries — the pool or an open transaction. */
export type DbOrTx = Db | Tx;

const PRICE_STATE_ID = 1;

/**
 * Read the singleton price row, creating it at the initial price if absent.
 * Must be called inside a transaction before any sale mutation.
 */
export async function ensurePriceState(
  db: DbOrTx,
): Promise<schema.DcPriceStateRow> {
  const rows = await db
    .select()
    .from(schema.dcPriceState)
    .where(eq(schema.dcPriceState.id, PRICE_STATE_ID))
    .limit(1);
  const existing = rows.at(0);
  if (existing) return existing;

  await db.insert(schema.dcPriceState).values({
    id: PRICE_STATE_ID,
    currentPriceMicro: INITIAL_PRICE_MICRO,
    totalSalesCount: 0,
    lastSaleAt: null,
  });
  return {
    id: PRICE_STATE_ID,
    currentPriceMicro: INITIAL_PRICE_MICRO,
    totalSalesCount: 0,
    lastSaleAt: null,
  };
}

/** Current system price in micro-USD (read-only; creates the row if needed). */
export async function getCurrentPriceMicro(db: DbOrTx): Promise<number> {
  const state = await ensurePriceState(db);
  return state.currentPriceMicro;
}

/** Append an immutable audit row. */
export async function audit(
  db: DbOrTx,
  actor: string,
  action: string,
  detail: Record<string, unknown>,
): Promise<void> {
  await db.insert(schema.dcAudit).values({ actor, action, detail });
}
