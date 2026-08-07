# Resonance — Self-Hosted Translation Stack

Free, private, self-hosted translation for Resonance: text translation,
voice-note transcription (STT), and spoken translations (TTS). No API keys,
no per-request cost — everything runs on your own host.

## Services

| Service          | Image                                    | Port | Purpose                                   |
| ---------------- | ---------------------------------------- | ---- | ----------------------------------------- |
| LibreTranslate   | `libretranslate/libretranslate:v1.6.2`   | 5000 | Text translation + language detection     |
| faster-whisper   | `fedirz/faster-whisper-server:latest-cpu`| 8000 | Speech-to-text (OpenAI-compatible API)    |
| Piper HTTP       | `ollycox/piper-http:v1.0.1`              | 5500 | Text-to-speech (returns `audio/wav`)      |

## Quick start

```sh
docker compose -f translate/docker-compose.yml up -d
```

First start downloads models (LibreTranslate language packs ~100–300 MB each,
whisper-small ~460 MB, Piper voice ~60 MB). After that the stack is fully
offline — block outbound traffic if you like.

Wire the app to the services via env (all optional; empty = feature disabled):

```sh
LIBRETRANSLATE_URL=http://localhost:5000
WHISPER_URL=http://localhost:8000
PIPER_URL=http://localhost:5500
```

If the app itself runs in a container on the same Docker network, use the
service names instead (e.g. `http://libretranslate:5000`) and attach the app
container to this compose network.

## Verifying

```sh
curl http://localhost:5000/languages
curl -X POST http://localhost:5000/translate \
  -H 'Content-Type: application/json' \
  -d '{"q":"hello","source":"en","target":"es","format":"text"}'

curl -X POST http://localhost:8000/v1/audio/transcriptions \
  -F file=@sample.webm -F model=Systran/faster-whisper-small -F response_format=json

curl -X POST http://localhost:5500/ --data 'Hola, ¿cómo estás?' --output out.wav
# Some Piper builds use /synthesize instead of / — the app tries both.
```

The app's `translate.health` tRPC endpoint probes all three services with a
2.5s timeout and reports `{text, stt, tts, languages}` — it never throws, so
it's safe to poll from the UI to show feature availability.

## Resource notes

Sizing for a 4-core / 8 GB host (all three services together):

- **LibreTranslate** — with `LT_LOAD_ONLY=en,es,fr,de,pt,ja,zh` it idles around
  1.5–2.5 GB RAM. Loading *all* languages needs 6 GB+, so keep the list tight.
- **faster-whisper (CPU)** — `whisper-small` uses ~1 GB RAM; a 15 s voice note
  transcribes in ~5–15 s on 4 cores. Drop to `-base` for lower RAM/latency,
  or use the `-cuda` image on GPU hosts.
- **Piper** — ~200–400 MB RAM; synthesis is effectively real-time on CPU.

Total steady-state: roughly 3–4 GB RAM, leaving headroom for the app and DB
on an 8 GB box. All services are CPU-bound under load — scale by adding cores
or running replicas behind a load balancer, not by raising memory.

## Offline / air-gapped operation

1. On a machine with internet: `docker compose pull`, then
   `docker compose up -d` once so models download into the named volumes.
2. Export: `docker save -o images.tar libretranslate/libretranslate:v1.6.2 fedirz/faster-whisper-server:latest-cpu ollycox/piper-http:v1.0.1`
   and copy the named volumes (`whisper-models`, `piper-voices`) plus the
   LibreTranslate model cache.
3. On the offline host: `docker load -i images.tar`, restore the volumes,
   `docker compose up -d`.

## Behavior notes (app side)

- Text translation: LibreTranslate `POST /translate`, 10 s timeout.
- Voice notes ("video notes" in chat): server fetches the stored audio bytes,
  transcribes via whisper (60 s timeout), translates the transcript, then
  best-effort synthesizes the translation with Piper. TTS is skipped for
  translations longer than 600 characters, and any TTS failure just returns
  `audioDataUrl: null` — it never fails the request.
- Piper route differences: the app tries `POST /` first, then
  `POST /synthesize`, so both common piper-http builds work.
