# Gemini Live Model Integration

## Overview

This app connects to Gemini's Live API via raw WebSocket for real-time audio conversations. Both supported models use the **same** API version, endpoint, auth method, and message format — `src/lib/gemini/live-client.ts` has exactly one code path, and any new model has to fit it.

## Model Compatibility Matrix

| | Gemini 2.5 Flash | Gemini 3.1 Live |
|---|---|---|
| **Model string** | `models/gemini-2.5-flash-native-audio-preview-12-2025` | `models/gemini-3.1-flash-live-preview` |
| **API version** | `v1beta` | `v1beta` |
| **WebSocket endpoint** | `BidiGenerateContentConstrained` | `BidiGenerateContentConstrained` |
| **Auth method** | Ephemeral token (`access_token=`) | Ephemeral token (`access_token=`) |
| **Audio input format** | `realtimeInput.audio` (single object) | `realtimeInput.audio` (single object) |

The 2.5 model is `LIVE_MODELS[0]` and therefore `DEFAULT_MODEL` in `src/config/models.ts`.

## WebSocket URL

One URL for both models — only the model string in the setup message differs:

```
wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained?access_token=<ephemeral token>
```

There is no `v1alpha` path and no `key=<API key>` path. Both were removed; the raw `GEMINI_API_KEY` never reaches the browser.

## Audio Input Format

`realtimeInput.audio`, one object per chunk — this is the only shape `live-client.ts` sends:

```json
{
  "realtimeInput": {
    "audio": {
      "mimeType": "audio/pcm;rate=16000",
      "data": "<base64>"
    }
  }
}
```

The older `realtimeInput.mediaChunks` array form is rejected on `v1beta` for **both** models — the socket closes with code `1007` and reason `realtime_input.media_chunks is deprecated`.

## How Auth Works

**Ephemeral tokens only.** Tokens are created server-side via the `@google/genai` SDK (`client.authTokens.create()`). They start with `auth_tokens/`, are single-use and expire in 5 minutes, and are the only credential the browser ever sees — the `GEMINI_API_KEY` stays on the server. They're used with the `BidiGenerateContentConstrained` endpoint on `v1beta`.

There is no API-key path. `/api/gemini-token` returns 400 for any model not listed in `EPHEMERAL_TOKEN_MODELS` in `route.ts`.

Tokens are minted with `liveConnectConstraints`, which pins the model, system instruction, voice, transcription, and VAD settings, and locks `tools` to `[]`. Without that, a token in someone's Network tab is a 5-minute general-purpose Gemini credential.

## Key Files

- `src/config/models.ts` — model definitions and default
- `src/lib/gemini/live-client.ts` — WebSocket client
- `src/lib/gemini/build-live-config.ts` — builds the setup config and the matching token constraint
- `src/lib/gemini/types.ts` — message type definitions
- `src/app/api/gemini-token/route.ts` — mints the constrained token, returns it with the setup config
- `src/hooks/useLiveSession.ts` — connects everything; sends session params up, uses the returned config verbatim

## Adding a New Model

1. Confirm the model supports ephemeral tokens. If it doesn't, it can't ship — adding it would mean reintroducing the raw-key path.
2. Add the model to `LIVE_MODELS` in `src/config/models.ts` **and** to `EPHEMERAL_TOKEN_MODELS` in the token route.
3. Check if the new model changes the message format (audio input, server response structure). The close code `1007` with a descriptive reason is how Google signals format incompatibilities.
4. Check the required API version — everything currently assumes `v1beta`.

## Debugging Tips

- **WebSocket closes immediately after connect:** Check the close code and reason in the console (`WebSocket closed: <code> <reason>`). Code `1007` usually means a message format issue.
- **Token route returns 200 but connection fails:** Verify the API version in the WebSocket URL matches what the model expects.
- **"realtime_input.media_chunks is deprecated":** Close code `1007`. `v1beta` rejects `realtimeInput.mediaChunks` for both current models; `realtimeInput.audio` is the only accepted shape and is what `live-client.ts` sends.
