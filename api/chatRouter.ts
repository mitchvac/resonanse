import { TRPCError } from "@trpc/server";
import { z } from "zod";
import type { Profile } from "@db/schema";
import { createRouter, authedQuery } from "./middleware";
import {
  countMessages,
  findVideoNoteById,
  getConversationContext,
  insertMessage,
  insertVideoNote,
  listMessages,
  setConversationEphemeral,
} from "./queries/chat";

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
      const messages = await listMessages(input.conversationId, 50);
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

      const message = await insertMessage({
        conversationId: input.conversationId,
        senderId: ctx.user.id,
        kind: "text",
        content: input.content,
      });

      // Seed users reply in the same call so the demo thread feels alive.
      let reply = null;
      if (context.peerProfile?.isSeed) {
        const total = await countMessages(input.conversationId);
        reply = await insertMessage({
          conversationId: input.conversationId,
          senderId: context.peerId,
          kind: "text",
          content: seedReply(context.peerProfile, input.content, total),
        });
      }

      return { message, reply };
    }),

  starters: authedQuery
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
      const name = firstName(peer);
      const prompt = peer?.prompts?.[0];
      const secondPrompt = peer?.prompts?.[1];
      const desire = peer?.desires?.[0];
      const city = peer?.city;

      const starters = [
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
      ];

      return { starters: starters.slice(0, 3) };
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
