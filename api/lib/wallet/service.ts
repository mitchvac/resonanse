/**
 * Smart Custody Wallet service — DB-backed orchestration behind walletRouter.
 *
 * Ports the locked reference spec (smart-custody-wallet/src) to TiDB:
 *  - Date-Coin is an internal utility token; real crypto is watch-only.
 *  - First 100,000 wallets get a 10,000-coin airdrop (isOriginalHundredK).
 *  - Every sale ratchets the up-only price by exactly +5000 micro.
 *  - Suppliers never drop below 2,000 coins; fallback; fail closed.
 *  - Top-ups go through the PLATFORM path (single credit — no double-credit).
 *  - Supplier rewards are recorded as 'pending' XRP obligations (never sent).
 *  - Everything is audited.
 */
import { randomInt, randomUUID } from "node:crypto";
import { and, desc, eq, or, sql } from "drizzle-orm";
import * as schema from "@db/schema";
import { getDb } from "../../queries/connection";
import { env } from "../env";
import { audit, ensurePriceState, getCurrentPriceMicro, type Db, type Tx } from "./db";
import { burn as ledgerBurn, getBalance, type SettledSale } from "./ledger";
import { platformTopUpTx } from "./engine";
import { getChainVerifier } from "./chainVerifier";
import {
  AIRDROP_AMOUNT,
  ASSET_USD_MICRO,
  INTENT_TTL_MS,
  ORIGINAL_HUNDRED_K_LIMIT,
  PURPOSE_USD_MICRO,
  SUBSCRIBER_ALLOCATION,
} from "./constants";
import {
  decimalStringToSubUnits,
  unitsToDecimalString,
  usdMicroToAssetText,
} from "./util";

export type WalletErrorCode =
  | "WALLET_NOT_FOUND"
  | "INTENT_NOT_FOUND"
  | "FORBIDDEN"
  | "QUOTE_TOO_SMALL"
  | "POOL_EXHAUSTED"
  | "ASSET_UNAVAILABLE";

export class WalletError extends Error {
  code: WalletErrorCode;

  constructor(code: WalletErrorCode, message: string) {
    super(message);
    this.name = "WalletError";
    this.code = code;
  }
}

const actorFor = (userId: number) => `user:${userId}`;

/** XRPL classic address (r…). */
export function isValidXrplAddress(address: string): boolean {
  return /^r[1-9A-HJ-NP-Za-km-z]{25,34}$/.test(address);
}

/** Stellar public key (G…, 56 chars, base32 alphabet). */
export function isValidXlmAddress(address: string): boolean {
  return /^G[A-Z2-7]{55}$/.test(address);
}

function isDupEntry(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { code?: string }).code === "ER_DUP_ENTRY"
  );
}

async function getWalletByUserId(
  db: DbOrTx,
  userId: number,
): Promise<schema.DcWallet | undefined> {
  const rows = await db
    .select()
    .from(schema.dcWallets)
    .where(eq(schema.dcWallets.userId, userId))
    .limit(1);
  return rows.at(0);
}

type DbOrTx = Db | Tx;

export type EnsureWalletResult = {
  wallet: schema.DcWallet;
  created: boolean;
  airdropped: boolean;
};

/**
 * Idempotently ensure a wallet exists for the user. Creates one with a
 * 10,000-coin airdrop when the new wallet's ordinal is within the first
 * 100,000 (isOriginalHundredK). MUST run inside a transaction.
 */
export async function ensureWalletInTx(
  tx: Tx,
  userId: number,
): Promise<EnsureWalletResult> {
  const existing = await getWalletByUserId(tx, userId);
  if (existing) return { wallet: existing, created: false, airdropped: false };

  const countRows = await tx
    .select({ value: sql<number>`count(*)` })
    .from(schema.dcWallets);
  const existingCount = Number(countRows.at(0)?.value ?? 0);
  const newNumber = existingCount + 1;
  const isOriginal = newNumber <= ORIGINAL_HUNDRED_K_LIMIT;

  const walletId = randomUUID();
  const initial = isOriginal ? AIRDROP_AMOUNT : 0;
  await tx.insert(schema.dcWallets).values({
    userId,
    walletId,
    switchOn: true,
    isOriginalHundredK: isOriginal,
  });
  await tx.insert(schema.dcLedger).values({ walletId, balance: initial });

  await audit(tx, actorFor(userId), "GRANT_AUTHORITY", {
    userId,
    walletId,
    walletNumber: newNumber,
    isOriginalHundredK: isOriginal,
  });
  if (isOriginal) {
    await audit(tx, actorFor(userId), "AIRDROP", {
      walletId,
      amount: AIRDROP_AMOUNT,
    });
  }

  const wallet = await getWalletByUserId(tx, userId);
  if (!wallet) throw new WalletError("WALLET_NOT_FOUND", "Wallet create failed");
  return { wallet, created: true, airdropped: isOriginal };
}

/** grantAuthority — create the Smart Custody wallet (idempotent). */
export async function grantAuthority(userId: number): Promise<EnsureWalletResult> {
  const db = getDb();
  try {
    return await db.transaction((tx) => ensureWalletInTx(tx, userId));
  } catch (err) {
    // Concurrent grant for the same user → return the existing wallet.
    if (isDupEntry(err)) {
      const wallet = await getWalletByUserId(db, userId);
      if (wallet) return { wallet, created: false, airdropped: false };
    }
    throw err;
  }
}

/** setSwitch — toggle the Smart Custody Switch + audit. */
export async function setSwitch(
  userId: number,
  on: boolean,
): Promise<schema.DcWallet> {
  const db = getDb();
  return db.transaction(async (tx) => {
    const wallet = await getWalletByUserId(tx, userId);
    if (!wallet) {
      throw new WalletError("WALLET_NOT_FOUND", "No Smart Custody wallet");
    }
    await tx
      .update(schema.dcWallets)
      .set({ switchOn: on })
      .where(eq(schema.dcWallets.id, wallet.id));
    await audit(tx, actorFor(userId), "SET_SWITCH", {
      walletId: wallet.walletId,
      on,
    });
    return { ...wallet, switchOn: on };
  });
}

export type WalletState = {
  hasWallet: boolean;
  walletId?: string;
  balance?: number;
  switchOn?: boolean;
  isOriginalHundredK?: boolean;
  price: number;
  totalSalesCount: number;
};

/** state — current wallet + system price snapshot. */
export async function getWalletState(userId: number): Promise<WalletState> {
  const db = getDb();
  const priceState = await ensurePriceState(db);
  const wallet = await getWalletByUserId(db, userId);
  if (!wallet) {
    return {
      hasWallet: false,
      price: priceState.currentPriceMicro,
      totalSalesCount: priceState.totalSalesCount,
    };
  }
  const balance = await getBalance(db, wallet.walletId);
  return {
    hasWallet: true,
    walletId: wallet.walletId,
    balance,
    switchOn: wallet.switchOn,
    isOriginalHundredK: wallet.isOriginalHundredK,
    price: priceState.currentPriceMicro,
    totalSalesCount: priceState.totalSalesCount,
  };
}

const HISTORY_PAGE_SIZE = 20;

export type HistoryItem = {
  saleId: string;
  direction: "buy" | "sell";
  counterpartyWalletId: string;
  amount: number;
  pricePerCoinMicro: number;
  totalPaidText: string;
  paidWith: (typeof schema.DC_PAID_WITH)[number];
  createdAt: Date;
};

/** history — the user's sales (buy or sell), newest first, 20/page. */
export async function getHistory(
  userId: number,
  cursor?: number,
): Promise<{ items: HistoryItem[]; nextCursor: number | null }> {
  const db = getDb();
  const wallet = await getWalletByUserId(db, userId);
  if (!wallet) return { items: [], nextCursor: null };

  const offset = Math.max(0, cursor ?? 0);
  const rows = await db
    .select()
    .from(schema.dcSales)
    .where(
      or(
        eq(schema.dcSales.buyerWalletId, wallet.walletId),
        eq(schema.dcSales.sellerWalletId, wallet.walletId),
      ),
    )
    .orderBy(desc(schema.dcSales.id))
    .limit(HISTORY_PAGE_SIZE + 1)
    .offset(offset);

  const hasMore = rows.length > HISTORY_PAGE_SIZE;
  const page = rows.slice(0, HISTORY_PAGE_SIZE);
  const items: HistoryItem[] = page.map((s) => {
    const isBuy = s.buyerWalletId === wallet.walletId;
    return {
      saleId: s.saleId,
      direction: isBuy ? ("buy" as const) : ("sell" as const),
      counterpartyWalletId: isBuy ? s.sellerWalletId : s.buyerWalletId,
      amount: s.amount,
      pricePerCoinMicro: s.pricePerCoinMicro,
      totalPaidText: s.totalPaidText,
      paidWith: s.paidWith,
      createdAt: s.createdAt,
    };
  });
  return {
    items,
    nextCursor: hasMore ? offset + HISTORY_PAGE_SIZE : null,
  };
}

export type BuyQuote = {
  pricePerCoin: number;
  coins: number;
  totalUsdMicro: number;
};

/** buyQuote — informational quote at the current up-only price. */
export async function getBuyQuote(usdMicro: number): Promise<BuyQuote> {
  const db = getDb();
  const pricePerCoin = await getCurrentPriceMicro(db);
  const coins = pricePerCoin > 0 ? Math.floor(usdMicro / pricePerCoin) : 0;
  return {
    pricePerCoin,
    coins,
    totalUsdMicro: coins * pricePerCoin,
  };
}

export type CreatePaymentResult = {
  intentId: string;
  address: string;
  memoOrTag: string | null;
  expectedAmountText: string;
  asset: (typeof schema.DC_PAID_WITH)[number];
  expiresAt: Date;
  pricePerCoin?: number;
  coins?: number;
};

/** createPayment — build a watch-only payment intent with a 30-min expiry. */
export async function createPaymentIntent(
  userId: number,
  purpose: (typeof schema.DC_INTENT_PURPOSE)[number],
  asset: (typeof schema.DC_PAID_WITH)[number],
  opts?: { usdMicro?: number },
): Promise<CreatePaymentResult> {
  const db = getDb();
  const quotedUsdMicro =
    purpose === "TOP_UP" && opts?.usdMicro
      ? opts.usdMicro
      : PURPOSE_USD_MICRO[purpose];
  const address =
    asset === "XLM" ? env.merchantXlmAddress : env.merchantXrpAddress;

  // BTC was removed from checkout — only XRP/RLUSD/XLM intents can be created.
  if (asset === "BTC") {
    throw new WalletError(
      "ASSET_UNAVAILABLE",
      "BTC payments are no longer accepted — please pay with XRP, RLUSD or XLM.",
    );
  }

  // Never hand a customer an unconfigured/placeholder deposit address.
  if (asset === "XLM" ? !isValidXlmAddress(address) : !isValidXrplAddress(address)) {
    throw new WalletError(
      "ASSET_UNAVAILABLE",
      "This payment method is temporarily unavailable.",
    );
  }

  // XRP / RLUSD use a destination tag; XLM uses the same random uint32 as a
  // Stellar text memo (≤28 bytes — fits). Matched on-chain in both cases.
  const memoOrTag: string | null = String(randomInt(0, 2 ** 32));
  const expectedAmountText = usdMicroToAssetText(
    quotedUsdMicro,
    ASSET_USD_MICRO[asset],
    asset === "XLM" ? 7 : 6,
  );

  const intentId = randomUUID();
  const expiresAt = new Date(Date.now() + INTENT_TTL_MS);

  let quote: { pricePerCoin: number; coins: number } | null = null;
  if (purpose === "TOP_UP") {
    const q = await getBuyQuote(quotedUsdMicro);
    quote = { pricePerCoin: q.pricePerCoin, coins: q.coins };
  }

  await db.transaction(async (tx) => {
    await tx.insert(schema.dcCryptoIntents).values({
      intentId,
      userId,
      purpose,
      asset,
      address,
      memoOrTag,
      expectedAmountText,
      quotedUsdMicro,
      status: "pending",
      expiresAt,
    });
    await audit(tx, actorFor(userId), "CREATE_INTENT", {
      intentId,
      purpose,
      asset,
      expectedAmountText,
      quotedUsdMicro,
      memoOrTag,
    });
  });

  return {
    intentId,
    address,
    memoOrTag,
    expectedAmountText,
    asset,
    expiresAt,
    ...(quote ? { pricePerCoin: quote.pricePerCoin, coins: quote.coins } : {}),
  };
}

/** Grant a subscription tier inside a transaction (mirrors premiumRouter). */
async function grantEntitlementInTx(
  tx: Tx,
  userId: number,
  tier: "plus" | "x",
): Promise<void> {
  const rows = await tx
    .select()
    .from(schema.entitlements)
    .where(eq(schema.entitlements.userId, userId))
    .limit(1);
  if (!rows.at(0)) {
    await tx
      .insert(schema.entitlements)
      .values({ userId })
      .onConflictDoUpdate({
        target: schema.entitlements.userId,
        set: { userId },
      });
  }
  const set =
    tier === "plus"
      ? {
          tier: "plus" as const,
          dailyLikeLimit: 999,
          renewedAt: new Date(),
        }
      : {
          tier: "x" as const,
          dailyLikeLimit: 999,
          boosts: 99,
          pulses: 99,
          renewedAt: new Date(),
        };
  await tx
    .update(schema.entitlements)
    .set(set)
    .where(eq(schema.entitlements.userId, userId));
  await audit(tx, actorFor(userId), "GRANT_ENTITLEMENT", { tier });
}

export type ConfirmPaymentResult = {
  status: (typeof schema.DC_INTENT_STATUS)[number];
  txHash?: string | null;
  sale?: SettledSale;
  /**
   * Actual received amount text when the payment came in under the expected
   * amount (from the chain verifier when it reports one); otherwise null.
   */
  receivedAmountText: string | null;
};

/**
 * paymentStatus — server-side on-chain verification + atomic settlement.
 * NEVER trusts the client. Idempotent: an already-confirmed intent returns
 * its current state without re-settling.
 */
export async function confirmPayment(
  userId: number,
  intentId: string,
): Promise<ConfirmPaymentResult> {
  const db = getDb();
  const intentRows = await db
    .select()
    .from(schema.dcCryptoIntents)
    .where(eq(schema.dcCryptoIntents.intentId, intentId))
    .limit(1);
  const intent = intentRows.at(0);
  if (!intent) throw new WalletError("INTENT_NOT_FOUND", "Unknown intent");
  if (intent.userId !== userId) {
    throw new WalletError("FORBIDDEN", "Not your payment intent");
  }

  // Idempotent: already confirmed → return current state, no re-settlement.
  if (intent.status === "confirmed") {
    return { status: "confirmed", txHash: intent.txHash, receivedAmountText: null };
  }
  if (intent.status === "expired") {
    return { status: "expired", receivedAmountText: null };
  }

  // Expiry sweep.
  if (intent.expiresAt.getTime() <= Date.now()) {
    await db.transaction(async (tx) => {
      await tx
        .update(schema.dcCryptoIntents)
        .set({ status: "expired" })
        .where(
          and(
            eq(schema.dcCryptoIntents.intentId, intentId),
            eq(schema.dcCryptoIntents.status, "pending"),
          ),
        );
      await audit(tx, actorFor(userId), "INTENT_EXPIRED", { intentId });
    });
    return { status: "expired", receivedAmountText: null };
  }

  // BTC was removed from checkout — any legacy BTC intent can never settle;
  // expire it honestly instead of verifying a chain we no longer watch.
  if (intent.asset === "BTC") {
    await db.transaction(async (tx) => {
      await tx
        .update(schema.dcCryptoIntents)
        .set({ status: "expired" })
        .where(
          and(
            eq(schema.dcCryptoIntents.intentId, intentId),
            eq(schema.dcCryptoIntents.status, "pending"),
          ),
        );
      await audit(tx, actorFor(userId), "INTENT_EXPIRED_BTC_REMOVED", { intentId });
    });
    return { status: "expired", receivedAmountText: null };
  }

  // Server-side on-chain verification (never trust the client).
  const outcome = await getChainVerifier().verify({
    asset: intent.asset,
    address: intent.address,
    memoOrTag: intent.memoOrTag,
    expectedAmountText: intent.expectedAmountText,
  });

  if (outcome.status === "pending") {
    return { status: "pending", receivedAmountText: null };
  }
  if (outcome.status === "underpaid") {
    // The verifier may report the actual received amount text; fall back to
    // null so the client can show its generic underpaid copy.
    const receivedAmountText =
      (outcome as { receivedAmountText?: string | null }).receivedAmountText ??
      null;
    await db.transaction(async (tx) => {
      await tx
        .update(schema.dcCryptoIntents)
        .set({ status: "underpaid" })
        .where(
          and(
            eq(schema.dcCryptoIntents.intentId, intentId),
            eq(schema.dcCryptoIntents.status, "pending"),
          ),
        );
      await audit(tx, actorFor(userId), "INTENT_UNDERPAID", { intentId });
    });
    return { status: "underpaid", receivedAmountText };
  }

  // Confirmed → settle atomically in ONE transaction (fail closed).
  const settled = await db.transaction(async (tx) => {
    const curRows = await tx
      .select()
      .from(schema.dcCryptoIntents)
      .where(eq(schema.dcCryptoIntents.intentId, intentId))
      .limit(1);
    const cur = curRows.at(0);
    if (!cur) throw new WalletError("INTENT_NOT_FOUND", "Unknown intent");
    if (cur.status === "confirmed") {
      return { sale: null as SettledSale | null, already: true };
    }

    await tx
      .update(schema.dcCryptoIntents)
      .set({
        status: "confirmed",
        txHash: outcome.txHash ?? null,
        confirmedAt: new Date(),
      })
      .where(eq(schema.dcCryptoIntents.intentId, intentId));

    const { wallet } = await ensureWalletInTx(tx, userId);
    const actor = actorFor(userId);

    let sale: SettledSale;
    if (cur.purpose === "TOP_UP") {
      const price = await getCurrentPriceMicro(tx);
      const coins = Math.floor(cur.quotedUsdMicro / price);
      if (coins <= 0) {
        throw new WalletError(
          "QUOTE_TOO_SMALL",
          "Top-up value buys zero coins at the current price",
        );
      }
      // PLATFORM sale — credits exactly once (no double-credit).
      sale = await platformTopUpTx(tx, {
        buyerWalletId: wallet.walletId,
        amount: coins,
        paidWith: cur.asset,
        totalPaidText: cur.expectedAmountText,
        cryptoIntentId: cur.intentId,
        actor,
      });
    } else {
      // Subscription → grant entitlement tier + PLATFORM sale of the
      // 10,000-coin subscriber allocation. V69 closed loop: the platform is
      // the sole seller — no member supplies coins, no XRP reward accrues.
      const tier = cur.purpose === "SUBSCRIPTION_PLUS" ? "plus" : "x";
      await grantEntitlementInTx(tx, userId, tier);
      sale = await platformTopUpTx(tx, {
        buyerWalletId: wallet.walletId,
        amount: SUBSCRIBER_ALLOCATION,
        paidWith: cur.asset,
        totalPaidText: cur.expectedAmountText,
        cryptoIntentId: cur.intentId,
        actor,
      });
    }

    await audit(tx, actor, "PAYMENT_CONFIRMED", {
      intentId,
      purpose: cur.purpose,
      asset: cur.asset,
      txHash: outcome.txHash ?? null,
      saleId: sale.saleId,
      amount: sale.amount,
      pricePerCoinMicro: sale.pricePerCoinMicro,
      sellerWalletId: sale.sellerWalletId,
    });
    return { sale, already: false };
  });

  return {
    status: "confirmed",
    txHash: outcome.txHash ?? null,
    sale: settled.sale ?? undefined,
    receivedAmountText: null,
  };
}

export type AdminTreasury = {
  currentPriceMicro: number;
  totalSalesCount: number;
  pendingCount: number;
  pendingTotalXrpText: string;
  paidCount: number;
  paidTotalXrpText: string;
  recent: Array<{
    id: number;
    supplierWalletId: string;
    saleId: string;
    amountXrpText: string;
    status: (typeof schema.DC_REWARD_STATUS)[number];
    createdAt: Date;
  }>;
};

/** adminTreasury — supplier reward obligations summary (owner only). */
export async function getAdminTreasury(): Promise<AdminTreasury> {
  const db = getDb();
  const priceState = await ensurePriceState(db);
  const rewards = await db
    .select()
    .from(schema.dcRewards)
    .orderBy(desc(schema.dcRewards.id))
    .limit(50);

  let pendingCount = 0;
  let paidCount = 0;
  let pendingMicro = 0;
  let paidMicro = 0;
  for (const r of rewards) {
    const micro = decimalStringToSubUnits(r.amountXrpText, 6);
    if (r.status === "pending") {
      pendingCount++;
      pendingMicro += micro;
    } else {
      paidCount++;
      paidMicro += micro;
    }
  }

  return {
    currentPriceMicro: priceState.currentPriceMicro,
    totalSalesCount: priceState.totalSalesCount,
    pendingCount,
    pendingTotalXrpText: unitsToDecimalString(pendingMicro, 6),
    paidCount,
    paidTotalXrpText: unitsToDecimalString(paidMicro, 6),
    recent: rewards.map((r) => ({
      id: r.id,
      supplierWalletId: r.supplierWalletId,
      saleId: r.saleId,
      amountXrpText: r.amountXrpText,
      status: r.status,
      createdAt: r.createdAt,
    })),
  };
}

/** Burn Date-Coin on spend (used by platform services). */
export async function burnDateCoin(
  userId: number,
  amount: number,
): Promise<void> {
  const db = getDb();
  await db.transaction(async (tx) => {
    const wallet = await getWalletByUserId(tx, userId);
    if (!wallet) {
      throw new WalletError("WALLET_NOT_FOUND", "No Smart Custody wallet");
    }
    await ledgerBurn(tx, wallet.walletId, amount, actorFor(userId));
  });
}
