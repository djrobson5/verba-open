import type {
  LiveConnectConfig,
  Modality,
  EndSensitivity as SdkEndSensitivity,
} from '@google/genai';
import type { LiveConfig } from './types';
import type { EndSensitivity } from '@/config/voiceTiming';

/** The knobs a client is allowed to ask for. Everything else about the session
 *  setup is decided here, server-side, so the shape can't be widened from the
 *  browser (no tools, no extra response modalities). */
export interface LiveSessionRequest {
  model: string;
  systemPrompt: string;
  voiceName?: string;
  transcribe?: boolean;
  vad?: {
    silenceDurationMs: number;
    endOfSpeechSensitivity: EndSensitivity;
  };
}

export const DEFAULT_VOICE = 'Aoede';

/** Builds the exact `setup` payload for the Live API socket.
 *
 *  This runs on the server, and the result is used twice: once as the
 *  `liveConnectConstraints` pinned into the ephemeral token, and once as the
 *  setup message the client sends over the socket. Both must be byte-identical
 *  or the server rejects the connection — which is the point. Building it in
 *  one place is what makes the pinning meaningful; if the client assembled its
 *  own copy, any drift would surface as an opaque socket close.
 */
/** The same session, expressed in the SDK's `LiveConnectConfig` shape for
 *  `authTokens.create`'s `liveConnectConstraints`.
 *
 *  Note the shape differs from the raw-socket `LiveConfig` above: the SDK
 *  flattens `responseModalities` and `speechConfig` up out of `generationConfig`.
 *  `tools: []` is set explicitly rather than omitted — an unset field isn't
 *  locked, so leaving it off would let a token holder declare their own tools.
 */
export function buildTokenConstraintConfig(req: LiveSessionRequest): LiveConnectConfig {
  return {
    responseModalities: ['AUDIO' as Modality],
    speechConfig: {
      voiceConfig: {
        prebuiltVoiceConfig: {
          voiceName: req.voiceName || DEFAULT_VOICE,
        },
      },
    },
    systemInstruction: {
      parts: [{ text: req.systemPrompt }],
    },
    tools: [],
    ...(req.transcribe
      ? {
          inputAudioTranscription: {},
          outputAudioTranscription: {},
        }
      : {}),
    ...(req.vad
      ? {
          realtimeInputConfig: {
            automaticActivityDetection: {
              silenceDurationMs: req.vad.silenceDurationMs,
              // Our EndSensitivity is a string union of the same wire values
              // the SDK models as an enum; identical on the wire.
              endOfSpeechSensitivity: req.vad
                .endOfSpeechSensitivity as SdkEndSensitivity,
            },
          },
        }
      : {}),
  };
}

export function buildLiveConfig(req: LiveSessionRequest): LiveConfig {
  return {
    model: req.model,
    generationConfig: {
      responseModalities: ['AUDIO'],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: {
            voiceName: req.voiceName || DEFAULT_VOICE,
          },
        },
      },
    },
    systemInstruction: {
      parts: [{ text: req.systemPrompt }],
    },
    ...(req.transcribe
      ? {
          inputAudioTranscription: {},
          outputAudioTranscription: {},
        }
      : {}),
    ...(req.vad
      ? {
          realtimeInputConfig: {
            automaticActivityDetection: {
              silenceDurationMs: req.vad.silenceDurationMs,
              endOfSpeechSensitivity: req.vad.endOfSpeechSensitivity,
            },
          },
        }
      : {}),
  };
}
