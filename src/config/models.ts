export type LiveProvider = 'gemini' | 'openai';

export interface LiveModel {
  id: string;
  label: string;
  description: string;
  /** Which vendor's realtime API backs this model. Gemini models go through
   *  /api/gemini-token + a raw websocket; OpenAI models go through
   *  /api/openai-live-session + WebRTC. */
  provider: LiveProvider;
}

export const LIVE_MODELS: LiveModel[] = [
  {
    id: 'models/gemini-2.5-flash-native-audio-preview-12-2025',
    label: 'Gemini 2.5 Flash',
    description: 'Fast and responsive',
    provider: 'gemini',
  },
  {
    id: 'models/gemini-3.1-flash-live-preview',
    label: 'Gemini 3.1 Live',
    description: 'Latest model with improved quality',
    provider: 'gemini',
  },
  {
    id: 'gpt-live-1',
    label: 'GPT-Live (OpenAI)',
    description: 'Full-duplex voice with a separate reasoning backend',
    provider: 'openai',
  },
];

export const DEFAULT_MODEL = LIVE_MODELS[0].id;

export function getLiveModel(id: string): LiveModel | undefined {
  return LIVE_MODELS.find((m) => m.id === id);
}

/** Responses model that does the pedagogy behind GPT-Live. `gpt-5.6-terra` is
 *  the higher-capability alternative; luna is the cost-sensitive default. */
export const DEFAULT_OPENAI_BACKEND_MODEL = 'gpt-5.6-luna';
export const OPENAI_BACKEND_MODELS = ['gpt-5.6-luna', 'gpt-5.6-terra'] as const;
