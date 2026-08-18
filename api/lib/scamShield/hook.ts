/**
 * chat.send hook (V93-P1): scan a just-sent message for extraction patterns
 * and persist the result. Runs AFTER insertMessage, wrapped by the caller in
 * try/catch — a failure here must NEVER block sending, and the sender's
 * response is byte-identical either way (the sender never learns anything).
 *
 * Context building is bounded (last 50 messages, last 50 prior signals).
 * No network calls: the domain check is the in-memory blocked-domain cache.
 * Pattern classes are stored — never message content.
 */
import { desc, eq } from "drizzle-orm";
import { messages, scamSignals, victimWarnings } from "@db/schema";
import { getDb } from "../../queries/connection";
import { countMessages } from "../../queries/chat";
import { scanMessage, type ScamPattern } from "./detector";
import { isDomainBlocked } from "./domainCache";

/** Bound on context building — never scan more than this much history. */
const CONTEXT_MESSAGE_LIMIT = 50;
const CONTEXT_SIGNAL_LIMIT = 50;

/** "Let's move to WhatsApp" — the off-platform migration step of the P5 sequence. */
const OFF_PLATFORM_RE =
  /\b(whatsapp|telegram|snapchat|hangouts|kik)\b|\bmove (this|this chat|us|our chat) (to|over)\b|\btext me (on|at)\b|\bcontinue (this|chatting|talking) (on|over)\b|\boff (this|the) app\b/i;

const SCAM_PATTERNS: readonly ScamPattern[] = ["P1", "P2", "P3", "P4", "P5"];

export type ScamDisposition = "none" | "recipient_warning" | "queued_review";

/** SPEC §4 thresholds: >=70 queued_review, 40-69 recipient_warning, <40 none. */
export function dispositionFor(score: number): ScamDisposition {
  if (score >= 70) return "queued_review";
  if (score >= 40) return "recipient_warning";
  return "none";
}

export async function runScamScan(args: {
  conversationId: number;
  senderId: number;
  /** The OTHER participant — the only person a victim warning can go to. */
  peerId: number;
  messageId: number;
  content: string;
}): Promise<void> {
  const { conversationId, senderId, peerId, messageId, content } = args;
  const db = getDb();

  const [recent, priorSignalRows, messageCount] = await Promise.all([
    db
      .select({ content: messages.content })
      .from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(desc(messages.id))
      .limit(CONTEXT_MESSAGE_LIMIT),
    db
      .select({ patterns: scamSignals.patterns })
      .from(scamSignals)
      .where(eq(scamSignals.conversationId, conversationId))
      .orderBy(desc(scamSignals.id))
      .limit(CONTEXT_SIGNAL_LIMIT),
    countMessages(conversationId),
  ]);

  const priorPatterns = new Set<ScamPattern>();
  for (const row of priorSignalRows) {
    for (const p of row.patterns.split(",")) {
      if ((SCAM_PATTERNS as readonly string[]).includes(p)) {
        priorPatterns.add(p as ScamPattern);
      }
    }
  }
  // Exclude the message just sent (it is `content`) when testing history.
  const offPlatformSuggestedEarlier = recent
    .slice(1)
    .some((m) => OFF_PLATFORM_RE.test(m.content));

  const { score, patterns } = scanMessage(content, {
    priorPatterns: [...priorPatterns],
    messageCountInConversation: messageCount,
    offPlatformSuggestedEarlier,
    isDomainBlocked,
  });

  // Nothing matched — nothing stored. Crypto-topic talk lands here at score 0.
  if (patterns.length === 0) return;

  const disposition = dispositionFor(score);
  const [{ id: signalId }] = await db
    .insert(scamSignals)
    .values({
      conversationId,
      senderId,
      messageId,
      patterns: patterns.join(","),
      score,
      disposition,
    })
    .returning({ id: scamSignals.id });

  // Victim-side warning: the OTHER participant only, never the sender.
  if (disposition === "recipient_warning" || disposition === "queued_review") {
    await db.insert(victimWarnings).values({
      signalId,
      recipientId: peerId,
      conversationId,
      level: disposition === "queued_review" ? "elevated" : "standard",
    });
  }
}
