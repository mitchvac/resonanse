/**
 * The Moderation Agent (V93 Phase 0) — appeal SLA watchdog.
 * Runs on boot and every 15 minutes, exactly like the event agent.
 * Never crashes the server.
 *
 * Strike decay is READ-TIME (queries filter expiresAt > now, voidedAt IS
 * NULL), so there is deliberately no voiding job here. The only recurring
 * duty is alerting when removal appeals breach their SLAs: first human
 * response within 72 hours, decision within 7 days (standards §5.6).
 */
import { and, isNull, lt, or } from "drizzle-orm";
import { removalAppeals } from "@db/schema";
import { getDb } from "../../queries/connection";

const INTERVAL_MS = 15 * 60 * 1000; // 15 minutes
const FIRST_RESPONSE_SLA_MS = 72 * 60 * 60 * 1000; // 72 hours
const DECISION_SLA_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

let started = false;

/** Log every appeal that has breached (or is breaching) an SLA. */
async function checkAppealSlas(): Promise<void> {
  const db = getDb();
  const now = Date.now();
  const firstResponseCutoff = new Date(now - FIRST_RESPONSE_SLA_MS);
  const decisionCutoff = new Date(now - DECISION_SLA_MS);

  const breaches = await db
    .select()
    .from(removalAppeals)
    .where(
      and(
        isNull(removalAppeals.decidedAt),
        or(
          and(
            isNull(removalAppeals.firstResponseAt),
            lt(removalAppeals.createdAt, firstResponseCutoff),
          ),
          lt(removalAppeals.createdAt, decisionCutoff),
        ),
      ),
    );

  for (const appeal of breaches) {
    const ageHours = Math.round(
      (now - appeal.createdAt.getTime()) / (60 * 60 * 1000),
    );
    const breach =
      appeal.firstResponseAt === null && appeal.createdAt < firstResponseCutoff
        ? "first-response SLA (72h)"
        : "decision SLA (7d)";
    console.warn(
      `[moderation-agent] appeal ${appeal.id} (user ${appeal.userId}) breached ${breach} — open for ${ageHours}h, status '${appeal.status}'`,
    );
  }
  if (breaches.length > 0) {
    console.warn(
      `[moderation-agent] ${breaches.length} appeal(s) breaching SLA — moderator attention needed`,
    );
  }
}

/**
 * Boot hook: check immediately (fire-and-forget), then every 15 minutes.
 * Errors are caught and logged — the server never crashes.
 */
export function startModerationAgent(): void {
  if (started) return;
  started = true;
  void (async () => {
    try {
      await checkAppealSlas();
    } catch (err) {
      console.error("[moderation-agent] initial SLA check failed", err);
    }
  })();
  const timer = setInterval(() => {
    checkAppealSlas().catch((err) =>
      console.error("[moderation-agent] scheduled SLA check failed", err),
    );
  }, INTERVAL_MS);
  timer.unref();
}
