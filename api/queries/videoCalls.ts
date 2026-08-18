import { and, asc, desc, eq, gt, inArray, ne } from "drizzle-orm";
import {
  callSessions,
  callSignals,
  conversations,
  matches,
  profiles,
  type CallSession,
  type CallSignal,
  type InsertCallSignal,
  type Profile,
} from "@db/schema";
import { getDb } from "./connection";

/** How long a ringing session stays "live" before it's considered missed. */
export const RING_TIMEOUT_MS = 75_000;

export async function findCallSessionById(
  sessionId: number,
): Promise<CallSession | undefined> {
  const rows = await getDb()
    .select()
    .from(callSessions)
    .where(eq(callSessions.id, sessionId))
    .limit(1);
  return rows.at(0);
}

export function isCallParticipant(session: CallSession, userId: number): boolean {
  return session.callerId === userId || session.calleeId === userId;
}

export async function findLiveSessionForConversation(
  conversationId: number,
): Promise<CallSession | undefined> {
  const rows = await getDb()
    .select()
    .from(callSessions)
    .where(
      and(
        eq(callSessions.conversationId, conversationId),
        inArray(callSessions.status, ["ringing", "active"]),
      ),
    )
    .limit(1);
  return rows.at(0);
}

export async function insertCallSession(data: {
  conversationId: number;
  callerId: number;
  calleeId: number;
}): Promise<CallSession> {
  const db = getDb();
  const [{ id }] = await db
    .insert(callSessions)
    .values(data)
    .returning({ id: callSessions.id });
  const session = await findCallSessionById(id);
  if (!session) throw new Error("Failed to insert call session");
  return session;
}

export type IncomingCall = {
  sessionId: number;
  conversationId: number;
  fromProfile: Pick<Profile, "id" | "userId" | "displayName" | "photos"> | null;
};

export async function listIncomingCalls(
  calleeId: number,
  now = new Date(),
): Promise<IncomingCall[]> {
  const db = getDb();
  const since = new Date(now.getTime() - RING_TIMEOUT_MS);
  const rows = await db
    .select()
    .from(callSessions)
    .where(
      and(
        eq(callSessions.calleeId, calleeId),
        eq(callSessions.status, "ringing"),
        gt(callSessions.createdAt, since),
      ),
    )
    .orderBy(desc(callSessions.createdAt));

  const incoming: IncomingCall[] = [];
  for (const session of rows) {
    const profileRows = await db
      .select({
        id: profiles.id,
        userId: profiles.userId,
        displayName: profiles.displayName,
        photos: profiles.photos,
      })
      .from(profiles)
      .where(eq(profiles.userId, session.callerId))
      .limit(1);
    incoming.push({
      sessionId: session.id,
      conversationId: session.conversationId,
      fromProfile: profileRows.at(0) ?? null,
    });
  }
  return incoming;
}

export async function updateCallSession(
  sessionId: number,
  set: Partial<Pick<CallSession, "status" | "answeredAt" | "endedAt">>,
): Promise<CallSession> {
  await getDb()
    .update(callSessions)
    .set(set)
    .where(eq(callSessions.id, sessionId));
  const session = await findCallSessionById(sessionId);
  if (!session) throw new Error("Call session not found");
  return session;
}

export async function markMatchVideoVerified(
  conversationId: number,
  at: Date,
): Promise<boolean> {
  const db = getDb();
  const convRows = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, conversationId))
    .limit(1);
  const conversation = convRows.at(0);
  if (!conversation) return false;
  await db
    .update(matches)
    .set({ videoVerifiedAt: at })
    .where(eq(matches.id, conversation.matchId));
  return true;
}

export async function insertCallSignal(
  data: Omit<InsertCallSignal, "id">,
): Promise<CallSignal> {
  const db = getDb();
  const [{ id }] = await db
    .insert(callSignals)
    .values(data)
    .returning({ id: callSignals.id });
  const rows = await db
    .select()
    .from(callSignals)
    .where(eq(callSignals.id, id))
    .limit(1);
  const signal = rows.at(0);
  if (!signal) throw new Error("Failed to insert call signal");
  return signal;
}

export async function listSignalsAfter(
  sessionId: number,
  afterId: number,
  excludeFromUserId: number,
): Promise<Array<Pick<CallSignal, "id" | "payload">>> {
  return getDb()
    .select({ id: callSignals.id, payload: callSignals.payload })
    .from(callSignals)
    .where(
      and(
        eq(callSignals.sessionId, sessionId),
        gt(callSignals.id, afterId),
        ne(callSignals.fromUserId, excludeFromUserId),
      ),
    )
    .orderBy(asc(callSignals.id));
}
