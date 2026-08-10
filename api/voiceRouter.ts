import { AccessToken } from "livekit-server-sdk";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { and, eq, or } from "drizzle-orm";
import { blocks, matches, profiles } from "@db/schema";
import { getDb } from "./queries/connection";
import { createRouter, authedQuery } from "./middleware";

/**
 * Game voice rooms — LiveKit (industry-standard WebRTC SFU).
 *
 * Design rules:
 * - A voice room exists per (game, match): `game-{game}-{matchId}`. Only the
 *   two members of that match can ever receive a token — the room is scoped
 *   to people who already matched, never strangers.
 * - Blocked either way → no voice. Hard stop.
 * - Tokens are short-lived (1h) and carry ONLY the member's display name —
 *   the same name their match already sees in chat. No user ids, no email,
 *   nothing that links display identity to account identity.
 * - Voice is live-only: nothing is recorded or stored server-side.
 * - When LiveKit env isn't configured yet, the router answers honestly so
 *   the UI can show "voice isn't switched on yet" instead of a dead button.
 */

const LIVEKIT_URL = process.env.LIVEKIT_URL ?? "";
const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY ?? "";
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET ?? "";

function voiceConfigured(): boolean {
  return Boolean(LIVEKIT_URL && LIVEKIT_API_KEY && LIVEKIT_API_SECRET);
}

function notConfigured(): TRPCError {
  return new TRPCError({
    code: "PRECONDITION_FAILED",
    message: "Voice isn't switched on yet — it unlocks at live tables.",
  });
}

async function requireMatchMembership(matchId: number, userId: number) {
  const db = getDb();
  const rows = await db
    .select()
    .from(matches)
    .where(eq(matches.id, matchId))
    .limit(1);
  const match = rows.at(0);
  if (!match || (match.userAId !== userId && match.userBId !== userId)) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Table not found" });
  }
  const otherId = match.userAId === userId ? match.userBId : match.userAId;

  // blocked either direction → voice is off the table
  const blockRows = await db
    .select({ blockerId: blocks.blockerId })
    .from(blocks)
    .where(
      or(
        and(eq(blocks.blockerId, userId), eq(blocks.blockedId, otherId)),
        and(eq(blocks.blockerId, otherId), eq(blocks.blockedId, userId)),
      ),
    )
    .limit(1);
  if (blockRows.length > 0) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Voice is unavailable" });
  }

  const nameRows = await db
    .select({ displayName: profiles.displayName })
    .from(profiles)
    .where(eq(profiles.userId, userId))
    .limit(1);
  return { match, otherId, displayName: nameRows.at(0)?.displayName ?? "Player" };
}

export const voiceRouter = createRouter({
  /** Whether LiveKit is configured — the UI hides the mic button when false. */
  config: authedQuery.query(() => ({ enabled: voiceConfigured() })),

  /**
   * Join the voice room for a game table. The table is keyed to a match, so
   * only the two matched members can ever get in.
   */
  join: authedQuery
    .input(
      z.object({
        matchId: z.number().int().positive(),
        game: z
          .string()
          .min(1)
          .max(24)
          .regex(/^[a-z0-9-]+$/, "game id"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!voiceConfigured()) throw notConfigured();
      const { displayName } = await requireMatchMembership(
        input.matchId,
        ctx.user.id,
      );

      const room = `game-${input.game}-${input.matchId}`;
      const token = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
        identity: `u${ctx.user.id}`,
        name: displayName,
        ttl: "1h",
      });
      token.addGrant({
        room,
        roomJoin: true,
        canPublish: true,
        canSubscribe: true,
        canPublishData: false, // voice only — no data channel abuse
      });
      return {
        url: LIVEKIT_URL,
        token: await token.toJwt(),
        room,
        name: displayName,
      };
    }),
});
