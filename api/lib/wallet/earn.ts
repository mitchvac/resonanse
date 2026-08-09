/**
 * Earn-DC engagement rewards (V70) — the airline-miles model.
 *
 * Members EARN closed-loop Date-Coin for engagement (daily check-in, identity
 * verification, …). Earning is PROMOTIONAL ISSUANCE, not a sale:
 *  - NO dc_sales row, NO dcPriceState ratchet, NO payment/intent of any kind.
 *  - The credit is a plain dcLedger increment (same runtime write as a
 *    purchase settlement) plus a wallet_earn_events row plus an audit row.
 *  - Earned Date-Coin has no cash value and never leaves the app.
 *
 * Idempotency: UNIQUE(userId, eventType) on wallet_earn_events makes one-time
 * awards (identity vault bonus) award exactly once; the daily check-in is a
 * repeatable event whose single row carries lastAwardedAt as the cooldown
 * basis (20h — slightly under a day so a daily habit doesn't drift later).
 * Repeatable rows keep running totals in meta so totalEarned / earnedToday
 * stay exact even though the row's `amount` column holds only the latest
 * grant (per the schema contract).
 */
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import * as schema from "@db/schema";
import { getDb } from "../../queries/connection";
import { audit, type DbOrTx, type Tx } from "./db";
import { creditBalance } from "./ledger";
import { ensureWalletInTx } from "./service";

/** Coins awarded per daily check-in. */
export const DAILY_CHECKIN_AMOUNT = 25;
/** One-time bonus for completing Identity Vault verification. */
export const VAULT_BONUS_AMOUNT = 500;
/** Cooldown between daily check-ins (20h). */
export const DAILY_COOLDOWN_MS = 20 * 60 * 60 * 1000;

/** wallet_earn_events.eventType values. */
export const EVENT_DAILY_CHECKIN = "daily_checkin";
export const EVENT_IDENTITY_VAULT = "identity_vault";

/** Running totals kept on a repeatable event row's meta. */
type RepeatMeta = { totalAmount?: number; todayDate?: string; todayAmount?: number };

const actorFor = (userId: number) => `user:${userId}`;

function isDupEntry(err: unknown, depth = 0): boolean {
  if (typeof err !== "object" || err === null || depth > 4) return false;
  const e = err as { code?: string; cause?: unknown };
  if (e.code === "ER_DUP_ENTRY") return true;
  // drizzle wraps driver errors ("Failed query: …") with the original
  // mysql2 error on .cause — walk the chain.
  return isDupEntry(e.cause, depth + 1);
}

/* ------------------------------------------------------------------------ */
/* Pure helpers (unit-tested — no DB).                                       */
/* ------------------------------------------------------------------------ */

export type DailyClaimState = {
  canClaim: boolean;
  lastClaimAt: Date | null;
  nextClaimAt: Date | null;
};

/**
 * Derive the daily check-in state from the row's lastAwardedAt.
 * Claimable when never claimed or lastAwardedAt ≤ now - cooldown;
 * nextClaimAt = lastAwardedAt + cooldown (null while claimable).
 */
export function computeDailyClaimState(
  lastAwardedAt: Date | null,
  now: Date,
): DailyClaimState {
  if (!lastAwardedAt) {
    return { canClaim: true, lastClaimAt: null, nextClaimAt: null };
  }
  const nextClaimAt = new Date(lastAwardedAt.getTime() + DAILY_COOLDOWN_MS);
  const canClaim = lastAwardedAt.getTime() <= now.getTime() - DAILY_COOLDOWN_MS;
  return {
    canClaim,
    lastClaimAt: lastAwardedAt,
    nextClaimAt: canClaim ? null : nextClaimAt,
  };
}

/** "7h 23m" / "42m" — human countdown for cooldown messages. */
export function formatCooldownRemaining(remainingMs: number): string {
  const totalMinutes = Math.max(1, Math.ceil(remainingMs / 60_000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

/** UTC calendar day key — the "today" basis for earnedToday. */
export function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Defensively read a repeatable row's meta (json column → unknown). */
export function parseRepeatMeta(meta: unknown): RepeatMeta {
  if (typeof meta !== "object" || meta === null) return {};
  const m = meta as Record<string, unknown>;
  return {
    totalAmount: typeof m.totalAmount === "number" ? m.totalAmount : undefined,
    todayDate: typeof m.todayDate === "string" ? m.todayDate : undefined,
    todayAmount: typeof m.todayAmount === "number" ? m.todayAmount : undefined,
  };
}

/** The narrow row shape the pure derivations need. */
export type EarnEventLike = {
  eventType: string;
  amount: number;
  lastAwardedAt: Date;
  createdAt: Date;
  meta: unknown;
};

/**
 * Lifetime coins earned across a member's event rows. One-time rows count
 * their `amount`; repeatable rows count meta.totalAmount (falling back to
 * `amount` for rows written before totals were tracked).
 */
export function deriveTotalEarned(rows: EarnEventLike[]): number {
  return rows.reduce((sum, r) => {
    if (r.eventType === EVENT_DAILY_CHECKIN) {
      return sum + (parseRepeatMeta(r.meta).totalAmount ?? r.amount);
    }
    return sum + r.amount;
  }, 0);
}

/**
 * Coins earned on `now`'s UTC day. Repeatable rows report meta.todayAmount
 * when meta.todayDate matches today; one-time rows count when their
 * createdAt falls on today.
 */
export function deriveEarnedToday(rows: EarnEventLike[], now: Date): number {
  const today = dayKey(now);
  return rows.reduce((sum, r) => {
    if (r.eventType === EVENT_DAILY_CHECKIN) {
      const m = parseRepeatMeta(r.meta);
      if (m.todayDate !== undefined) {
        return sum + (m.todayDate === today ? (m.todayAmount ?? 0) : 0);
      }
      // Legacy row without day tracking: a claim happened, count one grant
      // when the latest award landed today.
      return sum + (dayKey(r.lastAwardedAt) === today ? r.amount : 0);
    }
    return sum + (dayKey(r.createdAt) === today ? r.amount : 0);
  }, 0);
}

/* ------------------------------------------------------------------------ */
/* One-time awards.                                                          */
/* ------------------------------------------------------------------------ */

/**
 * awardDc — award a ONE-TIME earn event (e.g. the identity vault bonus).
 * Returns true when the credit was granted, false when the event was already
 * awarded (unique key → no credit, idempotent). The insert + wallet credit +
 * audit run in ONE transaction. No sale row, no price ratchet: promotional
 * issuance of a closed-loop in-app credit, never a sale.
 */
export async function awardDc(
  userId: number,
  eventType: string,
  amount: number,
): Promise<boolean> {
  const db = getDb();
  return db.transaction(async (tx) => {
    try {
      await tx.insert(schema.walletEarnEvents).values({
        userId,
        eventType,
        amount,
        lastAwardedAt: new Date(),
      });
    } catch (err) {
      // Already awarded — the unique key is the idempotency guard.
      if (isDupEntry(err)) return false;
      throw err;
    }
    const { wallet } = await ensureWalletInTx(tx, userId);
    await creditBalance(tx, wallet.walletId, amount);
    await audit(tx, actorFor(userId), "EARN", { eventType, amount });
    return true;
  });
}

/* ------------------------------------------------------------------------ */
/* State.                                                                    */
/* ------------------------------------------------------------------------ */

export type EarnState = {
  canClaimDaily: boolean;
  lastDailyClaimAt: Date | null;
  nextClaimAt: Date | null;
  vaultBonusAwarded: boolean;
  totalEarned: number;
  earnedToday: number;
};

/** Read the member's earn state (no wallet gating — see the router). */
export async function getEarnState(
  db: DbOrTx,
  userId: number,
): Promise<EarnState> {
  const rows = await db
    .select()
    .from(schema.walletEarnEvents)
    .where(eq(schema.walletEarnEvents.userId, userId));

  const dailyRow = rows.find((r) => r.eventType === EVENT_DAILY_CHECKIN);
  const daily = computeDailyClaimState(dailyRow?.lastAwardedAt ?? null, new Date());
  const now = new Date();

  return {
    canClaimDaily: daily.canClaim,
    lastDailyClaimAt: daily.lastClaimAt,
    nextClaimAt: daily.nextClaimAt,
    vaultBonusAwarded: rows.some((r) => r.eventType === EVENT_IDENTITY_VAULT),
    totalEarned: deriveTotalEarned(rows),
    earnedToday: deriveEarnedToday(rows, now),
  };
}

/* ------------------------------------------------------------------------ */
/* Daily check-in.                                                           */
/* ------------------------------------------------------------------------ */

export type ClaimDailyResult = {
  awarded: boolean;
  amount: number;
  nextClaimAt: Date;
};

function cooldownConflict(nextClaimAt: Date, now: Date): TRPCError {
  const remaining = nextClaimAt.getTime() - now.getTime();
  return new TRPCError({
    code: "CONFLICT",
    message: `Next check-in available in ${formatCooldownRemaining(remaining)}`,
  });
}

/**
 * Claim the daily check-in. Cooldown enforcement is race-safe: the row is
 * re-read inside the transaction and the INSERT relies on the unique key —
 * a concurrent claim loses the race and gets a CONFLICT, never a double
 * credit. ON DUPLICATE KEY UPDATE is deliberately NOT used (it is racy for
 * cooldowns). Fail closed: any throw rolls back credit + row + audit.
 * The row's `amount` holds the LATEST grant; lifetime/today totals run in
 * meta (totalAmount / todayDate / todayAmount).
 */
export async function claimDaily(userId: number): Promise<ClaimDailyResult> {
  const db = getDb();
  return db.transaction(async (tx: Tx) => {
    const { wallet } = await ensureWalletInTx(tx, userId);

    const rows = await tx
      .select()
      .from(schema.walletEarnEvents)
      .where(
        and(
          eq(schema.walletEarnEvents.userId, userId),
          eq(schema.walletEarnEvents.eventType, EVENT_DAILY_CHECKIN),
        ),
      )
      .limit(1);
    const row = rows.at(0);

    const now = new Date();
    const state = computeDailyClaimState(row?.lastAwardedAt ?? null, now);
    if (!state.canClaim && state.nextClaimAt) {
      throw cooldownConflict(state.nextClaimAt, now);
    }
    const nextClaimAt = new Date(now.getTime() + DAILY_COOLDOWN_MS);

    if (!row) {
      try {
        await tx.insert(schema.walletEarnEvents).values({
          userId,
          eventType: EVENT_DAILY_CHECKIN,
          amount: DAILY_CHECKIN_AMOUNT,
          lastAwardedAt: now,
          meta: {
            totalAmount: DAILY_CHECKIN_AMOUNT,
            todayDate: dayKey(now),
            todayAmount: DAILY_CHECKIN_AMOUNT,
          } satisfies RepeatMeta,
        });
      } catch (err) {
        // Lost a concurrent-claim race — the other tx inserted first.
        if (isDupEntry(err)) throw cooldownConflict(nextClaimAt, now);
        throw err;
      }
    } else {
      const prev = parseRepeatMeta(row.meta);
      const today = dayKey(now);
      const meta: RepeatMeta = {
        totalAmount: (prev.totalAmount ?? row.amount) + DAILY_CHECKIN_AMOUNT,
        todayDate: today,
        todayAmount:
          (prev.todayDate === today ? (prev.todayAmount ?? 0) : 0) +
          DAILY_CHECKIN_AMOUNT,
      };
      await tx
        .update(schema.walletEarnEvents)
        .set({ lastAwardedAt: now, amount: DAILY_CHECKIN_AMOUNT, meta })
        .where(eq(schema.walletEarnEvents.id, row.id));
    }

    await creditBalance(tx, wallet.walletId, DAILY_CHECKIN_AMOUNT);
    await audit(tx, actorFor(userId), "EARN", {
      eventType: EVENT_DAILY_CHECKIN,
      amount: DAILY_CHECKIN_AMOUNT,
    });

    return { awarded: true, amount: DAILY_CHECKIN_AMOUNT, nextClaimAt };
  });
}
