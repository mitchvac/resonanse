import { TRPCError } from "@trpc/server";
import { z } from "zod";
import type { Conversation, Message, Profile } from "@db/schema";
import { createRouter, authedQuery } from "./middleware";
import {
  countMessages,
  findMessageById,
  findVideoNoteById,
  getConversationContext,
  insertMessage,
  insertVideoNote,
  isUserRemoved,
  listMessages,
  mergeMessageMeta,
  REMOVAL_NOTICE_TEXT,
  setConversationEphemeral,
} from "./queries/chat";
import { runScamScan } from "./lib/scamShield/hook";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Ephemeral conversations stamp messages to expire 24h after send. */
function expiryFor(conversation: Conversation): Date | undefined {
  return conversation.ephemeral ? new Date(Date.now() + DAY_MS) : undefined;
}

/**
 * Response-only hidden-words flagging: messages from the peer containing any
 * of the caller's hidden words get `meta.flaggedHidden = true`. DB untouched.
 */
function flagHiddenWords(
  msgs: Message[],
  viewerId: number,
  hiddenWords: string[] | null,
): Message[] {
  if (!hiddenWords || hiddenWords.length === 0) return msgs;
  const needles = hiddenWords.map((w) => w.toLowerCase()).filter(Boolean);
  if (needles.length === 0) return msgs;
  return msgs.map((message) => {
    if (message.senderId === viewerId) return message;
    const content = message.content.toLowerCase();
    if (!needles.some((w) => content.includes(w))) return message;
    return { ...message, meta: { ...(message.meta ?? {}), flaggedHidden: true } };
  });
}

/** Build a contextual canned reply from a seed user. */
function seedReply(
  peer: Profile,
  myMessage: string,
  messageCount: number,
): string {
  const name = peer.displayName;
  const prompt = peer.prompts?.[messageCount % Math.max(1, peer.prompts?.length ?? 1)];
  const lower = myMessage.toLowerCase();

  if (lower.includes("?")) {
    return (
      prompt?.answer ??
      `Great question — ask me again over a drink? — ${name}`
    ).slice(0, 280);
  }
  if (lower.includes("date") || lower.includes("drink") || lower.includes("coffee")) {
    return `Okay, I like where this is going. Thursday works for me — pick the spot?`;
  }
  if (prompt) {
    return `Ha! That reminds me of my answer to "${prompt.question}" — ${prompt.answer}`;
  }
  const pool = [
    `That's such a good opener. Tell me more?`,
    `I had a feeling we'd get along.`,
    `Okay, you just made me smile at my phone in public.`,
  ];
  return pool[messageCount % pool.length];
}

function firstName(profile: Profile | null): string {
  return profile?.displayName?.split(" ")[0] ?? "them";
}

export const chatRouter = createRouter({
  messages: authedQuery
    .input(z.object({ conversationId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
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
      const messages = flagHiddenWords(
        await listMessages(input.conversationId, 50),
        ctx.user.id,
        context.myProfile?.hiddenWords ?? null,
      );
      return {
        conversation: context.conversation,
        match: context.match,
        peer: context.peerProfile,
        messages,
      };
    }),

  send: authedQuery
    .input(
      z.object({
        conversationId: z.number().int().positive(),
        content: z.string().min(1).max(4000),
      }),
    )
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

      // V93 removal guards (Phase 0): a removed account can still READ its
      // history but never send; sending TO a removed account is refused with
      // the same neutral §8.9 line.
      if (ctx.user.removedAt) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: REMOVAL_NOTICE_TEXT,
        });
      }
      if (await isUserRemoved(context.peerId)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: REMOVAL_NOTICE_TEXT,
        });
      }

      const message = await insertMessage({
        conversationId: input.conversationId,
        senderId: ctx.user.id,
        kind: "text",
        content: input.content,
        expiresAt: expiryFor(context.conversation),
      });

      // Scam Shield (V93-P1): scan AFTER the message is stored, wrapped so a
      // detector failure NEVER blocks sending. Nothing here touches `message`
      // or `reply` — the send response is byte-identical and the sender never
      // learns anything. Any warning goes to the OTHER participant only.
      try {
        await runScamScan({
          conversationId: input.conversationId,
          senderId: ctx.user.id,
          peerId: context.peerId,
          messageId: message.id,
          content: input.content,
        });
      } catch (err) {
        console.error("[scam-shield] scan failed (send unaffected)", err);
      }

      // Seed users reply in the same call so the demo thread feels alive.
      let reply = null;
      if (context.peerProfile?.isSeed) {
        const total = await countMessages(input.conversationId);
        reply = await insertMessage({
          conversationId: input.conversationId,
          senderId: context.peerId,
          kind: "text",
          content: seedReply(context.peerProfile, input.content, total),
          expiresAt: expiryFor(context.conversation),
        });
      }

      return { message, reply };
    }),

  starters: authedQuery
    .input(
      z.object({
        conversationId: z.number().int().positive(),
        variant: z.number().int().min(0).max(20).default(0),
      }),
    )
    .query(async ({ ctx, input }) => {
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
      const peer = context.peerProfile;
      const name = firstName(peer);
      const prompt = peer?.prompts?.[0];
      const secondPrompt = peer?.prompts?.[1];
      const desire = peer?.desires?.[0];
      const city = peer?.city;

      // A larger deterministic pool — `variant` rotates which 3 are served,
      // so the refresh button cycles fresh suggestions.
      const pool = [
        prompt
          ? `Ask ${name} about their "${prompt.question}" answer — "${prompt.answer.slice(0, 60)}"`
          : `Ask ${name} what a perfect Sunday looks like for them`,
        desire
          ? `You both could bond over "${desire}" — suggest something low-key around it`
          : secondPrompt
            ? `Follow up on "${secondPrompt.question}" — bet them dinner on your guess`
            : `Share your own most controversial food opinion and ask theirs`,
        city
          ? `Suggest a first meet in ${city} tied to their profile — keep it specific and easy to say yes to`
          : `Offer two concrete times for a first drink this week`,
        `Ask ${name} what they're currently obsessed with — a show, a song, a rabbit hole`,
        `Play two truths and a lie — you go first with something unexpected`,
        `Ask ${name} what their friends would say their best quality is`,
        `Trade unpopular opinions — keep it playful, not political`,
        `Ask ${name} what a "green flag" on a first date looks like for them`,
        `Suggest a tiny challenge: each of you picks the other's first-date drink`,
      ];

      const start = ((input.variant * 3) % pool.length + pool.length) % pool.length;
      const starters = [0, 1, 2].map((i) => pool[(start + i) % pool.length]);

      return { starters };
    }),

  dateIdeas: authedQuery
    .input(z.object({ conversationId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
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
      const peer = context.peerProfile;
      const mine = context.myProfile;
      const city = peer?.city ?? mine?.city ?? "your city";

      const shared =
        (peer?.desires ?? []).filter((d) =>
          (mine?.desires ?? []).includes(d),
        )[0] ?? peer?.desires?.[0] ?? "good conversation";

      const ideas = [
        {
          title: "Natural wine & small plates",
          emoji: "🍷",
          description: `A relaxed first date built around "${shared}" — matches both your vibes.`,
          location: `Wine bar in ${city}`,
        },
        {
          title: "Golden-hour rooftop drink",
          emoji: "🌇",
          description: "Low pressure, great light, easy exit if the spark isn't there.",
          location: `Rooftop in ${city}`,
        },
        {
          title: "Sunday farmers-market stroll",
          emoji: "🧺",
          description: "Daylight, coffee, and tomatoes — the honest getting-to-know-you walk.",
          location: `Market in ${city}`,
        },
      ];

      return { ideas };
    }),

  proposeDate: authedQuery
    .input(
      z.object({
        conversationId: z.number().int().positive(),
        title: z.string().min(1).max(160),
        emoji: z.string().max(8).optional(),
        description: z.string().max(500).optional(),
        location: z.string().max(160).optional(),
        time: z.string().max(60).optional(),
      }),
    )
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
      const message = await insertMessage({
        conversationId: input.conversationId,
        senderId: ctx.user.id,
        kind: "date_idea",
        content: input.title,
        meta: {
          title: input.title,
          emoji: input.emoji,
          description: input.description,
          location: input.location,
          time: input.time,
          status: "proposed",
        },
        expiresAt: expiryFor(context.conversation),
      });
      return { message };
    }),

  respondDate: authedQuery
    .input(
      z.object({
        messageId: z.number().int().positive(),
        status: z.enum(["accepted", "declined"]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const target = await findMessageById(input.messageId);
      if (!target || target.kind !== "date_idea") {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Date idea not found",
        });
      }
      const context = await getConversationContext(
        target.conversationId,
        ctx.user.id,
      );
      if (!context) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Date idea not found",
        });
      }
      const message = await mergeMessageMeta(input.messageId, {
        status: input.status,
      });
      return { message };
    }),

  sendSystemEvent: authedQuery
    .input(
      z.object({
        conversationId: z.number().int().positive(),
        event: z.enum(["screenshot_warning"]),
      }),
    )
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
      const message = await insertMessage({
        conversationId: input.conversationId,
        senderId: ctx.user.id,
        kind: "system",
        content: "A screenshot may have been taken — stay kind.",
        meta: { event: input.event },
        expiresAt: expiryFor(context.conversation),
      });
      return { message };
    }),

  sendVideoNote: authedQuery
    .input(
      z.object({
        conversationId: z.number().int().positive(),
        data: z
          .string()
          .max(5_000_000)
          .refine((value) => value.startsWith("data:video/"), {
            message: "data must be a video data-URL",
          }),
        durationSec: z.number().int().min(1).max(15),
      }),
    )
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

      const note = await insertVideoNote({
        conversationId: input.conversationId,
        senderId: ctx.user.id,
        data: input.data,
        durationSec: input.durationSec,
      });

      const message = await insertMessage({
        conversationId: input.conversationId,
        senderId: ctx.user.id,
        kind: "video_note",
        content: "",
        meta: { noteId: note.id, durationSec: note.durationSec },
        expiresAt: expiryFor(context.conversation),
      });

      return { message };
    }),

  videoNote: authedQuery
    .input(z.object({ noteId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const note = await findVideoNoteById(input.noteId);
      if (!note) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Video note not found",
        });
      }
      const context = await getConversationContext(
        note.conversationId,
        ctx.user.id,
      );
      if (!context) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Video note not found",
        });
      }
      return {
        id: note.id,
        data: note.data,
        durationSec: note.durationSec,
        senderId: note.senderId,
        createdAt: note.createdAt,
      };
    }),

  setEphemeral: authedQuery
    .input(
      z.object({
        conversationId: z.number().int().positive(),
        ephemeral: z.boolean(),
      }),
    )
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
      const conversation = await setConversationEphemeral(
        input.conversationId,
        input.ephemeral,
      );
      return { conversation };
    }),
});
