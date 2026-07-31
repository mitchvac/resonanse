import { TRPCError } from "@trpc/server";
import { z } from "zod";
import type { CallSession } from "@db/schema";
import { createRouter, authedQuery } from "./middleware";
import { getConversationContext } from "./queries/chat";
import {
  findCallSessionById,
  findLiveSessionForConversation,
  insertCallSession,
  insertCallSignal,
  isCallParticipant,
  listIncomingCalls,
  listSignalsAfter,
  markMatchVideoVerified,
  RING_TIMEOUT_MS,
  updateCallSession,
} from "./queries/videoCalls";

/** A call counts as video-verification once both sides talked ≥ 30s. */
const VIDEO_VERIFY_MIN_MS = 30_000;

function notFound(message = "Call session not found"): TRPCError {
  return new TRPCError({ code: "NOT_FOUND", message });
}

/** Load a session and assert the caller participates in it. */
async function requireParticipantSession(
  sessionId: number,
  userId: number,
): Promise<CallSession> {
  const session = await findCallSessionById(sessionId);
  if (!session || !isCallParticipant(session, userId)) {
    throw notFound();
  }
  return session;
}

/** Lazily expire a stale ringing session; returns the effective status. */
async function effectiveStatus(session: CallSession): Promise<CallSession> {
  if (
    session.status === "ringing" &&
    Date.now() - session.createdAt.getTime() > RING_TIMEOUT_MS
  ) {
    return updateCallSession(session.id, { status: "missed" });
  }
  return session;
}

export const videoCallRouter = createRouter({
  start: authedQuery
    .input(z.object({ conversationId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const context = await getConversationContext(
        input.conversationId,
        ctx.user.id,
      );
      if (!context) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Conversation not found",
        });
      }

      const live = await findLiveSessionForConversation(input.conversationId);
      if (live) {
        // A stale ringing session no longer blocks a new call.
        const effective = await effectiveStatus(live);
        if (effective.status === "ringing" || effective.status === "active") {
          throw new TRPCError({
            code: "CONFLICT",
            message: "A call is already in progress for this conversation",
          });
        }
      }

      const session = await insertCallSession({
        conversationId: input.conversationId,
        callerId: ctx.user.id,
        calleeId: context.peerId,
      });
      return { sessionId: session.id, role: "caller" as const };
    }),

  incoming: authedQuery.query(async ({ ctx }) => {
    const calls = await listIncomingCalls(ctx.user.id);
    return {
      calls: calls.map((call) => ({
        sessionId: call.sessionId,
        conversationId: call.conversationId,
        fromProfile: call.fromProfile
          ? {
              displayName: call.fromProfile.displayName,
              photo: call.fromProfile.photos?.[0] ?? null,
            }
          : null,
      })),
    };
  }),

  accept: authedQuery
    .input(z.object({ sessionId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const session = await requireParticipantSession(
        input.sessionId,
        ctx.user.id,
      );
      if (session.calleeId !== ctx.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only the callee can accept this call",
        });
      }
      if (session.status !== "ringing") {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Call is no longer ringing",
        });
      }
      await updateCallSession(session.id, {
        status: "active",
        answeredAt: new Date(),
      });
      return { ok: true as const };
    }),

  decline: authedQuery
    .input(z.object({ sessionId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const session = await requireParticipantSession(
        input.sessionId,
        ctx.user.id,
      );
      if (session.calleeId !== ctx.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only the callee can decline this call",
        });
      }
      if (session.status !== "ringing") {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Call is no longer ringing",
        });
      }
      await updateCallSession(session.id, { status: "declined" });
      return { ok: true as const };
    }),

  end: authedQuery
    .input(z.object({ sessionId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const session = await requireParticipantSession(
        input.sessionId,
        ctx.user.id,
      );
      if (session.status !== "ringing" && session.status !== "active") {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Call has already ended",
        });
      }
      const endedAt = new Date();
      const ended = await updateCallSession(session.id, {
        status: "ended",
        endedAt,
      });

      let videoVerified = false;
      if (
        session.answeredAt &&
        endedAt.getTime() - session.answeredAt.getTime() >= VIDEO_VERIFY_MIN_MS
      ) {
        videoVerified = await markMatchVideoVerified(
          session.conversationId,
          endedAt,
        );
      }
      return { ok: true as const, videoVerified, status: ended.status };
    }),

  signal: authedQuery
    .input(
      z.object({
        sessionId: z.number().int().positive(),
        payload: z.string().min(1).max(20_000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const session = await requireParticipantSession(
        input.sessionId,
        ctx.user.id,
      );
      if (session.status !== "ringing" && session.status !== "active") {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Call is not live",
        });
      }
      await insertCallSignal({
        sessionId: session.id,
        fromUserId: ctx.user.id,
        payload: input.payload,
      });
      return { ok: true as const };
    }),

  poll: authedQuery
    .input(
      z.object({
        sessionId: z.number().int().positive(),
        afterId: z.number().int().default(0),
      }),
    )
    .query(async ({ ctx, input }) => {
      const session = await requireParticipantSession(
        input.sessionId,
        ctx.user.id,
      );
      const effective = await effectiveStatus(session);
      const signals = await listSignalsAfter(
        session.id,
        input.afterId,
        ctx.user.id,
      );
      return {
        status: effective.status,
        answeredAt: Boolean(effective.answeredAt),
        endedAt: Boolean(effective.endedAt),
        signals,
      };
    }),
});
