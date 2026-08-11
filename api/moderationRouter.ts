/**
 * moderationRouter — V93 Phase 0 moderation foundations.
 *
 * Admin-only (adminQuery = requireRole("admin"), api/middleware.ts). The
 * reports table becomes a real queue; Tier A hard strikes carry a mandatory
 * corroboration basis (standards §5.4 — no single-signal strikes, ever);
 * strike 3 removes an account ONLY after a human confirms it here, and every
 * removal can be appealed (§5.6). Every mutation writes a moderation_actions
 * audit row.
 *
 * Strike decay is READ-TIME: "active" means voidedAt IS NULL AND
 * expiresAt > now — nothing ever voids expired rows.
 */
import { TRPCError } from "@trpc/server";
import { and, asc, eq, gt, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import {
  STRIKE_BASES,
  STRIKE_CATEGORIES,
  moderationActions,
  removalAppeals,
  reports,
  userStrikes,
  users,
  type UserStrike,
} from "@db/schema";
import { createRouter, adminQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { insertRemovalNotices } from "./queries/chat";
import { sendRemovalEmail, sendStrikeWarningEmail } from "./lib/email";

const DAY_MS = 24 * 60 * 60 * 1000;
const STRIKE_WINDOW_DAYS = 90;

/** §8.2 "Why it worries people" — one sentence per Tier A category. */
const WHY_IT_WORRIES: Record<(typeof STRIKE_CATEGORIES)[number], string> = {
  A1: "patterns like this are the #1 way romance scams start — they lead to fake sites or wallets that take money and vanish",
  A2: "words like this can make people feel unsafe, and feeling safe is the one thing this place is built on",
  A3: "members rely on verification meaning something — when it isn't real, everyone gets hurt",
};

function activeStrikeCondition() {
  return and(isNull(userStrikes.voidedAt), gt(userStrikes.expiresAt, new Date()));
}

/** Every moderator action lands in the audit trail before it takes effect. */
async function logAction(
  actorId: number,
  action: string,
  targetUserId: number | null,
  refs = "",
  note = "",
): Promise<void> {
  await getDb()
    .insert(moderationActions)
    .values({ actorId, action, targetUserId, refs, note: note.slice(0, 500) });
}

async function findStrikeOrThrow(strikeId: number): Promise<UserStrike> {
  const rows = await getDb()
    .select()
    .from(userStrikes)
    .where(eq(userStrikes.id, strikeId))
    .limit(1);
  const strike = rows.at(0);
  if (!strike) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Strike not found" });
  }
  return strike;
}

export const moderationRouter = createRouter({
  /**
   * Triage queue: open reports (with reporter context), strike-3 candidates
   * (3+ active strikes, removal not yet confirmed), and unresolved appeals
   * SLA-first (oldest waiting longest).
   */
  queue: adminQuery.query(async () => {
    const db = getDb();

    const openReports = await db
      .select({
        report: reports,
        reporter: { id: users.id, email: users.email, name: users.name },
      })
      .from(reports)
      .leftJoin(users, eq(reports.reporterId, users.id))
      .where(eq(reports.status, "open"))
      .orderBy(asc(reports.createdAt));

    const activeStrikes = await db
      .select()
      .from(userStrikes)
      .where(activeStrikeCondition());
    const strikesByUser = new Map<number, UserStrike[]>();
    for (const strike of activeStrikes) {
      const list = strikesByUser.get(strike.userId) ?? [];
      list.push(strike);
      strikesByUser.set(strike.userId, list);
    }
    const candidateIds = [...strikesByUser.entries()]
      .filter(([, strikes]) => strikes.length >= 3)
      .map(([userId]) => userId);
    const unremoved =
      candidateIds.length > 0
        ? await db
            .select({ id: users.id })
            .from(users)
            .where(and(inArray(users.id, candidateIds), isNull(users.removedAt)))
        : [];
    const strike3Candidates = unremoved.map(({ id }) => ({
      userId: id,
      strikes: strikesByUser.get(id) ?? [],
    }));

    const openAppeals = await db
      .select()
      .from(removalAppeals)
      .where(inArray(removalAppeals.status, ["open", "in_review"]))
      .orderBy(asc(removalAppeals.createdAt));

    return { openReports, strike3Candidates, openAppeals };
  }),

  /** Review a report: set status/weight/dedup group + stamp reviewedAt. */
  reviewReport: adminQuery
    .input(
      z.object({
        reportId: z.number().int().positive(),
        status: z.string().min(1).max(24),
        weight: z.number().min(0).max(10).optional(),
        dedupGroup: z.string().max(64).nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const rows = await db
        .select()
        .from(reports)
        .where(eq(reports.id, input.reportId))
        .limit(1);
      const report = rows.at(0);
      if (!report) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Report not found" });
      }
      await db
        .update(reports)
        .set({
          status: input.status,
          reviewedAt: new Date(),
          ...(input.weight !== undefined ? { weight: input.weight } : {}),
          ...(input.dedupGroup !== undefined
            ? { dedupGroup: input.dedupGroup }
            : {}),
        })
        .where(eq(reports.id, input.reportId));
      await logAction(
        ctx.user.id,
        "review_report",
        report.targetUserId,
        `report:${input.reportId}`,
        `status=${input.status}`,
      );
      return { ok: true as const };
    }),

  /**
   * Issue a Tier A strike. `basis` is mandatory and validated against the
   * three contract values — a strike that cannot show its corroboration
   * basis is invalid on its face (§5.4). expiresAt = issuedAt + 90 days.
   */
  issueStrike: adminQuery
    .input(
      z.object({
        userId: z.number().int().positive(),
        category: z.enum(STRIKE_CATEGORIES),
        ruleRef: z.string().min(1).max(64),
        basis: z.enum(STRIKE_BASES),
        signalRefs: z.string().max(255).default(""),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const targetRows = await db
        .select()
        .from(users)
        .where(eq(users.id, input.userId))
        .limit(1);
      const target = targetRows.at(0);
      if (!target) {
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
      }

      const expiresAt = new Date(Date.now() + STRIKE_WINDOW_DAYS * DAY_MS);
      const [{ id: strikeId }] = await db
        .insert(userStrikes)
        .values({
          userId: input.userId,
          category: input.category,
          ruleRef: input.ruleRef,
          basis: input.basis,
          signalRefs: input.signalRefs,
          issuedBy: ctx.user.id,
          expiresAt,
        })
        .$returningId();
      await logAction(
        ctx.user.id,
        "issue_strike",
        input.userId,
        input.signalRefs,
        `${input.category} ${input.ruleRef} (${input.basis})`,
      );

      const strikeCount = (
        await db
          .select({ id: userStrikes.id })
          .from(userStrikes)
          .where(
            and(eq(userStrikes.userId, input.userId), activeStrikeCondition()),
          )
      ).length;
      const strikeNumber = Math.min(Math.max(strikeCount, 1), 3);

      // Strike 1 educates, strike 2 is the final warning, strike 3 is the
      // pending-review notice (a human confirms removal separately).
      if (target.email) {
        try {
          await sendStrikeWarningEmail(target.email, {
            strikeNumber,
            ruleText: input.ruleRef,
            triggerDescription: input.signalRefs
              ? `corroborated signals reviewed by our team (${input.signalRefs})`
              : "corroborated reports from members, reviewed by our team",
            whyItWorries: WHY_IT_WORRIES[input.category],
          });
        } catch (err) {
          console.error("[moderation] strike warning email failed", err);
        }
      }

      return { ok: true as const, strikeId, strikeNumber };
    }),

  /** Void a strike (wrongful issuance, detector tuning, …) with a reason. */
  voidStrike: adminQuery
    .input(
      z.object({
        strikeId: z.number().int().positive(),
        reason: z.string().min(1).max(255),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const strike = await findStrikeOrThrow(input.strikeId);
      if (strike.voidedAt) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Strike already voided",
        });
      }
      await db
        .update(userStrikes)
        .set({ voidedAt: new Date(), voidReason: input.reason })
        .where(eq(userStrikes.id, input.strikeId));
      await logAction(
        ctx.user.id,
        "void_strike",
        strike.userId,
        `strike:${input.strikeId}`,
        input.reason,
      );
      return { ok: true as const };
    }),

  /**
   * Confirm a strike-3 candidate → account removal. Sets the removal
   * tombstone, emails the member the §8.4 notice with the appeal path, and
   * drops the neutral §8.9 line into every one of their conversations.
   */
  confirmStrike3: adminQuery
    .input(
      z.object({
        userId: z.number().int().positive(),
        strikeId: z.number().int().positive(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const targetRows = await db
        .select()
        .from(users)
        .where(eq(users.id, input.userId))
        .limit(1);
      const target = targetRows.at(0);
      if (!target) {
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
      }
      if (target.removedAt) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Account already removed",
        });
      }
      const strike = await findStrikeOrThrow(input.strikeId);
      if (
        strike.userId !== input.userId ||
        strike.voidedAt !== null ||
        strike.expiresAt <= new Date()
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Strike is not an active strike for this user",
        });
      }

      await db
        .update(users)
        .set({ removedAt: new Date(), removalStrikeId: input.strikeId })
        .where(eq(users.id, input.userId));
      await logAction(
        ctx.user.id,
        "confirm_strike3",
        input.userId,
        `strike:${input.strikeId}`,
        `${strike.category} ${strike.ruleRef}`,
      );

      if (target.email) {
        try {
          await sendRemovalEmail(target.email, { ruleText: strike.ruleRef });
        } catch (err) {
          console.error("[moderation] removal email failed", err);
        }
      }
      const notices = await insertRemovalNotices(input.userId);

      return { ok: true as const, notices };
    }),

  /**
   * Reject a strike-3 candidate — the removal does NOT happen. The note is
   * required: it feeds detector tuning (Appendix A runbook).
   */
  rejectStrike3: adminQuery
    .input(
      z.object({
        userId: z.number().int().positive(),
        strikeId: z.number().int().positive(),
        note: z.string().min(1).max(500),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const strike = await findStrikeOrThrow(input.strikeId);
      if (strike.userId !== input.userId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Strike does not belong to this user",
        });
      }
      await logAction(
        ctx.user.id,
        "reject_strike3",
        input.userId,
        `strike:${input.strikeId}`,
        input.note,
      );
      return { ok: true as const };
    }),

  /** All appeals, oldest first (SLA-first ordering). */
  listAppeals: adminQuery.query(async () => {
    const db = getDb();
    const rows = await db
      .select({
        appeal: removalAppeals,
        user: { id: users.id, email: users.email, name: users.name },
      })
      .from(removalAppeals)
      .leftJoin(users, eq(removalAppeals.userId, users.id))
      .orderBy(asc(removalAppeals.createdAt));
    return { appeals: rows };
  }),

  /** Take an open appeal: in_review + first human response timestamp (72h SLA). */
  assignAppeal: adminQuery
    .input(z.object({ appealId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const rows = await db
        .select()
        .from(removalAppeals)
        .where(eq(removalAppeals.id, input.appealId))
        .limit(1);
      const appeal = rows.at(0);
      if (!appeal) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Appeal not found" });
      }
      if (appeal.status !== "open") {
        throw new TRPCError({
          code: "CONFLICT",
          message: `Appeal is ${appeal.status}, not open`,
        });
      }
      await db
        .update(removalAppeals)
        .set({
          status: "in_review",
          reviewedBy: ctx.user.id,
          firstResponseAt: new Date(),
        })
        .where(eq(removalAppeals.id, input.appealId));
      await logAction(
        ctx.user.id,
        "assign_appeal",
        appeal.userId,
        `appeal:${input.appealId}`,
      );
      return { ok: true as const };
    }),

  /**
   * Decide an appeal. Upheld = full restoration: the removal tombstone is
   * cleared (reads filter on removedAt, so nothing else needs restoring)
   * and the strike is voided with reason 'appeal_upheld'.
   */
  decideAppeal: adminQuery
    .input(
      z.object({
        appealId: z.number().int().positive(),
        upheld: z.boolean(),
        note: z.string().min(1).max(500),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const rows = await db
        .select()
        .from(removalAppeals)
        .where(eq(removalAppeals.id, input.appealId))
        .limit(1);
      const appeal = rows.at(0);
      if (!appeal) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Appeal not found" });
      }
      if (appeal.status === "upheld" || appeal.status === "denied") {
        throw new TRPCError({
          code: "CONFLICT",
          message: `Appeal already decided (${appeal.status})`,
        });
      }

      const now = new Date();
      await db
        .update(removalAppeals)
        .set({
          status: input.upheld ? "upheld" : "denied",
          reviewedBy: ctx.user.id,
          firstResponseAt: appeal.firstResponseAt ?? now,
          decidedAt: now,
        })
        .where(eq(removalAppeals.id, input.appealId));

      if (input.upheld) {
        await db
          .update(users)
          .set({ removedAt: null, removalStrikeId: null })
          .where(eq(users.id, appeal.userId));
        await db
          .update(userStrikes)
          .set({ voidedAt: now, voidReason: "appeal_upheld" })
          .where(
            and(
              eq(userStrikes.id, appeal.strikeId),
              isNull(userStrikes.voidedAt),
            ),
          );
      }

      await logAction(
        ctx.user.id,
        "decide_appeal",
        appeal.userId,
        `appeal:${input.appealId}`,
        `${input.upheld ? "upheld" : "denied"}: ${input.note}`,
      );
      return { ok: true as const };
    }),
});
