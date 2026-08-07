import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createRouter, authedQuery } from "./middleware";
import {
  findMessageById,
  findVideoNoteById,
  getConversationContext,
} from "./queries/chat";
import {
  synthesizeSpeech,
  transcribeAudio,
  translateHealth,
  translateText,
} from "./lib/translate/translator";

/** Skip TTS for translations longer than this — long synth is slow and heavy. */
const TTS_MAX_CHARS = 600;

interface AudioPayload {
  buf: Buffer;
  contentType: string;
}

/** Parse a `data:<mime>;base64,...` (or percent-encoded) data URL into bytes. */
function parseDataUrl(data: string): AudioPayload | null {
  const match = /^data:([^;,]+)?((?:;[a-z0-9-]+=[^;,]+)*)(;base64)?,(.*)$/is.exec(
    data,
  );
  if (!match) return null;
  const contentType = match[1] ?? "application/octet-stream";
  const isBase64 = Boolean(match[3]);
  const payload = match[4] ?? "";
  try {
    const buf = isBase64
      ? Buffer.from(payload, "base64")
      : Buffer.from(decodeURIComponent(payload), "utf8");
    return buf.length > 0 ? { buf, contentType } : null;
  } catch {
    return null;
  }
}

/**
 * Resolve a video note's stored representation into raw bytes. Notes are
 * stored as data URLs (longtext) today; handle http(s) blob URLs defensively
 * in case storage moves to object storage later.
 */
async function fetchNoteAudio(data: string): Promise<AudioPayload | null> {
  if (data.startsWith("data:")) {
    return parseDataUrl(data);
  }
  if (data.startsWith("http://") || data.startsWith("https://")) {
    try {
      const res = await fetch(data, { signal: AbortSignal.timeout(15_000) });
      if (!res.ok) return null;
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length === 0) return null;
      return {
        buf,
        contentType: res.headers.get("content-type") ?? "video/webm",
      };
    } catch {
      return null;
    }
  }
  return null;
}

export const translateRouter = createRouter({
  health: authedQuery.query(() => translateHealth()),

  text: authedQuery
    .input(
      z.object({
        text: z.string().min(1).max(2000),
        target: z.string().length(2),
        source: z.string().length(2).optional(),
      }),
    )
    .query(async ({ input }) => {
      const { translation, detectedSource } = await translateText(
        input.text,
        input.target,
        input.source ?? "auto",
      );
      return { translation, detectedSource };
    }),

  voice: authedQuery
    .input(
      z.object({
        messageId: z.number().int().positive(),
        target: z.string().length(2),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Same participant guard as the rest of chat: the message must exist,
      // be a video note, and belong to a conversation the caller is part of.
      const message = await findMessageById(input.messageId);
      if (!message || message.kind !== "video_note") {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Voice note not found",
        });
      }
      const context = await getConversationContext(
        message.conversationId,
        ctx.user.id,
      );
      if (!context) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Voice note not found",
        });
      }

      const noteId = (message.meta as Record<string, unknown> | null)?.noteId;
      const note =
        typeof noteId === "number" ? await findVideoNoteById(noteId) : undefined;
      if (!note || note.conversationId !== message.conversationId) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Voice note not found",
        });
      }

      const audio = await fetchNoteAudio(note.data);
      if (!audio) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Could not read voice note audio",
        });
      }

      const transcript = await transcribeAudio(audio.buf, audio.contentType);
      const { translation, detectedSource } = await translateText(
        transcript,
        input.target,
      );

      let audioDataUrl: string | null = null;
      if (translation.length > 0 && translation.length <= TTS_MAX_CHARS) {
        const speech = await synthesizeSpeech(translation, input.target);
        if (speech) {
          audioDataUrl = `data:audio/wav;base64,${speech.toString("base64")}`;
        }
      }

      return { transcript, translation, detectedSource, audioDataUrl };
    }),
});
