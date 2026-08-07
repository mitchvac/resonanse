import { TRPCError } from "@trpc/server";
import { env } from "../env";

/**
 * Thin client for the self-hosted translation sidecars. All three services
 * are optional and configured purely by env:
 *   LIBRETRANSLATE_URL — text translation + language detection
 *   WHISPER_URL        — faster-whisper-server (OpenAI-compatible STT)
 *   PIPER_URL          — Piper HTTP TTS
 *
 * Error discipline:
 *  - translateText / transcribeAudio throw TRPCError(PRECONDITION_FAILED) when
 *    their service is unconfigured and TRPCError(INTERNAL_SERVER_ERROR) with a
 *    safe (upstream-detail-free) message on any failure.
 *  - synthesizeSpeech never throws — TTS is best-effort and returns null.
 *  - translateHealth never throws — it reports what is reachable.
 */

export interface TranslateLanguage {
  code: string;
  name: string;
}

export interface TranslateHealth {
  text: boolean;
  stt: boolean;
  tts: boolean;
  languages: TranslateLanguage[];
}

/** Fallback catalogue shown when LibreTranslate is unreachable. */
const FALLBACK_LANGUAGES: TranslateLanguage[] = [
  { code: "en", name: "English" },
  { code: "es", name: "Spanish" },
  { code: "fr", name: "French" },
  { code: "de", name: "German" },
  { code: "pt", name: "Portuguese" },
  { code: "ja", name: "Japanese" },
  { code: "zh", name: "Chinese" },
];

const HEALTH_TIMEOUT_MS = 2_500;
const TRANSLATE_TIMEOUT_MS = 10_000;
const TRANSCRIBE_TIMEOUT_MS = 60_000;
const SYNTHESIZE_TIMEOUT_MS = 30_000;

/** fetch() with a hard timeout; rejects with an Error on timeout. */
async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function serviceNotConfigured(name: string): TRPCError {
  return new TRPCError({
    code: "PRECONDITION_FAILED",
    message: `${name} service is not configured`,
  });
}

function upstreamFailed(name: string): TRPCError {
  return new TRPCError({
    code: "INTERNAL_SERVER_ERROR",
    message: `${name} service request failed`,
  });
}

async function fetchLanguages(): Promise<TranslateLanguage[]> {
  if (!env.libreTranslateUrl) return FALLBACK_LANGUAGES;
  try {
    const res = await fetchWithTimeout(
      `${env.libreTranslateUrl}/languages`,
      { method: "GET" },
      HEALTH_TIMEOUT_MS,
    );
    if (!res.ok) return FALLBACK_LANGUAGES;
    const body = (await res.json()) as Array<{ code?: unknown; name?: unknown }>;
    if (!Array.isArray(body)) return FALLBACK_LANGUAGES;
    const languages = body
      .filter(
        (entry): entry is { code: string; name: string } =>
          typeof entry?.code === "string" && typeof entry?.name === "string",
      )
      .map(({ code, name }) => ({ code, name }));
    return languages.length > 0 ? languages : FALLBACK_LANGUAGES;
  } catch {
    return FALLBACK_LANGUAGES;
  }
}

async function probe(url: string, init: RequestInit): Promise<boolean> {
  try {
    const res = await fetchWithTimeout(url, init, HEALTH_TIMEOUT_MS);
    return res.ok;
  } catch {
    return false;
  }
}

/** Probe the configured sidecars. Never throws. */
export async function translateHealth(): Promise<TranslateHealth> {
  const [languages, text, stt, tts] = await Promise.all([
    fetchLanguages(),
    env.libreTranslateUrl
      ? probe(`${env.libreTranslateUrl}/languages`, { method: "GET" })
      : Promise.resolve(false),
    // faster-whisper-server exposes a small GET endpoint for liveness.
    env.whisperUrl
      ? probe(`${env.whisperUrl}/health`, { method: "GET" }).then((ok) =>
          ok ? ok : probe(`${env.whisperUrl}/docs`, { method: "GET" }),
        )
      : Promise.resolve(false),
    // Piper has no universal liveness route; a tiny synth is the real probe.
    env.piperUrl
      ? (async () => {
          try {
            const audio = await synthesizeWithPiper("ok", HEALTH_TIMEOUT_MS);
            return audio !== null;
          } catch {
            return false;
          }
        })()
      : Promise.resolve(false),
  ]);
  return { text, stt, tts, languages };
}

/**
 * Translate text via LibreTranslate.
 * @returns translation and the detected source language (null when the
 *          caller supplied an explicit source).
 */
export async function translateText(
  q: string,
  target: string,
  source: string = "auto",
): Promise<{ translation: string; detectedSource: string | null }> {
  if (!env.libreTranslateUrl) throw serviceNotConfigured("Translation");
  let res: Response;
  try {
    res = await fetchWithTimeout(
      `${env.libreTranslateUrl}/translate`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ q, source, target, format: "text" }),
      },
      TRANSLATE_TIMEOUT_MS,
    );
  } catch {
    throw upstreamFailed("Translation");
  }
  if (!res.ok) throw upstreamFailed("Translation");
  let body: { translatedText?: unknown; detectedLanguage?: unknown };
  try {
    body = (await res.json()) as typeof body;
  } catch {
    throw upstreamFailed("Translation");
  }
  if (typeof body.translatedText !== "string") throw upstreamFailed("Translation");
  return {
    translation: body.translatedText,
    detectedSource:
      typeof body.detectedLanguage === "string"
        ? body.detectedLanguage
        : typeof body.detectedLanguage === "object" &&
            body.detectedLanguage !== null &&
            typeof (body.detectedLanguage as { language?: unknown }).language ===
              "string"
          ? ((body.detectedLanguage as { language: string }).language as string)
          : null,
  };
}

/** Transcribe an audio buffer via faster-whisper-server (OpenAI-compatible). */
export async function transcribeAudio(
  buf: Buffer,
  contentType: string,
): Promise<string> {
  if (!env.whisperUrl) throw serviceNotConfigured("Transcription");
  const ext =
    contentType.includes("webm") ? "webm"
    : contentType.includes("mp4") ? "mp4"
    : contentType.includes("ogg") ? "ogg"
    : contentType.includes("wav") ? "wav"
    : contentType.includes("mpeg") ? "mp3"
    : "bin";
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(buf)], { type: contentType }), `note.${ext}`);
  form.append("model", "Systran/faster-whisper-small");
  form.append("response_format", "json");

  let res: Response;
  try {
    res = await fetchWithTimeout(
      `${env.whisperUrl}/v1/audio/transcriptions`,
      { method: "POST", body: form },
      TRANSCRIBE_TIMEOUT_MS,
    );
  } catch {
    throw upstreamFailed("Transcription");
  }
  if (!res.ok) throw upstreamFailed("Transcription");
  let body: { text?: unknown };
  try {
    body = (await res.json()) as typeof body;
  } catch {
    throw upstreamFailed("Transcription");
  }
  if (typeof body.text !== "string") throw upstreamFailed("Transcription");
  return body.text.trim();
}

/**
 * Piper builds differ on the synthesis route: some accept POST / with a plain
 * text body, others use POST /synthesize. Try / first, then /synthesize.
 */
async function synthesizeWithPiper(
  text: string,
  timeoutMs: number,
): Promise<Buffer | null> {
  for (const path of ["/", "/synthesize"]) {
    try {
      const res = await fetchWithTimeout(
        `${env.piperUrl}${path}`,
        {
          method: "POST",
          headers: { "Content-Type": "text/plain" },
          body: text,
        },
        timeoutMs,
      );
      if (!res.ok) continue;
      const bytes = Buffer.from(await res.arrayBuffer());
      if (bytes.length > 0) return bytes;
    } catch {
      // Try the next route variant.
    }
  }
  return null;
}

/**
 * Best-effort TTS. Returns null (never throws) when Piper is unconfigured,
 * unreachable, or fails. `lang` is accepted for forward compatibility (voice
 * selection is server-side in current Piper builds).
 */
export async function synthesizeSpeech(
  text: string,
  _lang: string,
): Promise<Buffer | null> {
  if (!env.piperUrl) return null;
  return synthesizeWithPiper(text, SYNTHESIZE_TIMEOUT_MS);
}
