export interface LiveConfig {
  model: string;
  generationConfig?: {
    responseModalities: string[];
    speechConfig?: {
      voiceConfig?: {
        prebuiltVoiceConfig?: {
          voiceName: string;
        };
      };
    };
  };
  systemInstruction?: {
    parts: { text: string }[];
  };
  inputAudioTranscription?: object;
  outputAudioTranscription?: object;
  tools?: object[];
  realtimeInputConfig?: RealtimeInputConfig;
}

export interface AutomaticActivityDetection {
  disabled?: boolean;
  startOfSpeechSensitivity?: 'START_SENSITIVITY_LOW' | 'START_SENSITIVITY_HIGH';
  endOfSpeechSensitivity?: 'END_SENSITIVITY_LOW' | 'END_SENSITIVITY_HIGH';
  prefixPaddingMs?: number;
  /** Silence after speech before the turn is treated as over. Higher = the
   *  model waits longer, so it won't cut off a user who pauses to think. */
  silenceDurationMs?: number;
}

export interface RealtimeInputConfig {
  automaticActivityDetection?: AutomaticActivityDetection;
}

export interface SetupMessage {
  setup: LiveConfig;
}

export interface RealtimeInputMessage {
  realtimeInput: {
    audio: {
      mimeType: string;
      data: string;
    };
  };
}

export interface UsageMetadata {
  promptTokenCount?: number;
  responseTokenCount?: number;
  totalTokenCount?: number;
  promptTokensDetails?: { modality?: string; tokenCount?: number }[];
  responseTokensDetails?: { modality?: string; tokenCount?: number }[];
}

export interface ServerContentMessage {
  serverContent?: {
    modelTurn?: {
      parts?: {
        inlineData?: {
          mimeType: string;
          data: string;
        };
        text?: string;
      }[];
    };
    turnComplete?: boolean;
    interrupted?: boolean;
    inputTranscription?: {
      text: string;
    };
    outputTranscription?: {
      text: string;
    };
  };
  // Live API may emit usageMetadata on its own or alongside other server fields.
  usageMetadata?: UsageMetadata;
  setupComplete?: object;
}

export type LiveClientState = 'disconnected' | 'connecting' | 'connected' | 'error';
