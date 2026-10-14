// Source: https://ai.google.dev/gemini-api/docs/pricing (verified 2026-05-06)
// Both currently-supported Gemini Live models price audio at the same rate
// ($3/M input, $12/M output). If they diverge later, swap to a model→rates map.
export const AUDIO_INPUT_USD_PER_M_TOKENS = 3;
export const AUDIO_OUTPUT_USD_PER_M_TOKENS = 12;
// Text tokens are typically negligible during a Live audio session, but Gemini
// still bills any text input/output. Same per-million rates here.
export const TEXT_INPUT_USD_PER_M_TOKENS = 3;
export const TEXT_OUTPUT_USD_PER_M_TOKENS = 12;

// OpenAI GPT-Live bills wall-clock audio per minute rather than per token.
// Source: https://developers.openai.com/api/docs/models/gpt-live-1 (verified 2026-09-14)
export const OPENAI_LIVE_USD_PER_MINUTE = 0.05;

/** Per-million-token rates for a delegated Responses backend model. */
export interface BackendTokenRates {
  inputUsdPerM: number;
  cachedInputUsdPerM: number;
  /** OpenAI: "Cache writes are billed at 1.25x the uncached input token rate." */
  cacheWriteUsdPerM: number;
  outputUsdPerM: number;
}

// The delegated Responses backend behind GPT-Live bills per token, on top of
// the per-minute Live audio. Standard tier, short context (≤272K input tokens;
// longer prompts are 2x input / 1.5x output for the whole request, which this
// estimate ignores — backend prompts are a scenario prompt plus a short chat).
// Sources (verified 2026-10-08):
//   https://developers.openai.com/api/docs/models/gpt-5.6-luna
//   https://developers.openai.com/api/docs/models/gpt-5.6-terra
//   https://developers.openai.com/api/docs/pricing
// A `null` entry means the model's rate is unverified: its tokens are still
// counted and stored, but it contributes $0 to the estimate.
export const OPENAI_BACKEND_RATES: Record<string, BackendTokenRates | null> = {
  'gpt-5.6-luna': {
    inputUsdPerM: 0.2,
    cachedInputUsdPerM: 0.02,
    cacheWriteUsdPerM: 0.25,
    outputUsdPerM: 1.2,
  },
  'gpt-5.6-terra': {
    inputUsdPerM: 2,
    cachedInputUsdPerM: 0.2,
    cacheWriteUsdPerM: 2.5,
    outputUsdPerM: 12,
  },
};

// Gemini token rates verified 2026-05-06; OpenAI Live per-minute rate
// 2026-09-14; OpenAI backend token rates 2026-10-08.
export const PRICING_VERIFIED_DATE = '2026-10-08';
export const PRICING_SOURCE_URL = 'https://ai.google.dev/gemini-api/docs/pricing';
export const OPENAI_PRICING_SOURCE_URL = 'https://developers.openai.com/api/docs/pricing';

export interface SessionTokenTotals {
  inputAudioTokens: number;
  outputAudioTokens: number;
  inputTextTokens: number;
  outputTextTokens: number;
  /** OpenAI GPT-Live only: cumulative Live audio seconds for the session.
   *  Gemini sessions leave this undefined and bill by token instead. */
  liveSeconds?: number;
  /** OpenAI GPT-Live only: delegated Responses backend tokens, summed across
   *  every `response.completed` in the session. `backendInputTokens` is the
   *  full input count; the cached and cache-write counts are subsets of it. */
  backendInputTokens?: number;
  backendCachedInputTokens?: number;
  backendCacheWriteTokens?: number;
  /** Includes reasoning tokens (billed as output). */
  backendOutputTokens?: number;
  /** Which Responses model produced the backend tokens (prices them). */
  backendModel?: string;
  /** Which voice provider produced these totals. */
  provider?: 'gemini' | 'openai';
}

export const ZERO_TOKEN_TOTALS: SessionTokenTotals = {
  inputAudioTokens: 0,
  outputAudioTokens: 0,
  inputTextTokens: 0,
  outputTextTokens: 0,
};

export interface CostBreakdown {
  /** Gemini Live token cost. */
  geminiUsd: number;
  /** GPT-Live per-minute audio cost. */
  openaiLiveUsd: number;
  /** GPT-Live delegated Responses backend token cost. */
  openaiBackendUsd: number;
  totalUsd: number;
}

function backendCostUsd(usage: SessionTokenTotals): number {
  const rates = usage.backendModel ? OPENAI_BACKEND_RATES[usage.backendModel] : null;
  if (!rates) return 0;
  const input = usage.backendInputTokens ?? 0;
  const cached = usage.backendCachedInputTokens ?? 0;
  const cacheWrite = usage.backendCacheWriteTokens ?? 0;
  const uncached = Math.max(input - cached - cacheWrite, 0);
  return (
    (uncached * rates.inputUsdPerM +
      cached * rates.cachedInputUsdPerM +
      cacheWrite * rates.cacheWriteUsdPerM +
      (usage.backendOutputTokens ?? 0) * rates.outputUsdPerM) /
    1_000_000
  );
}

/** Splits a session's cost by what produced it, independent of the
 *  `provider` tag: token fields are Gemini, seconds + backend are OpenAI. */
export function estimateCostBreakdown(usage: SessionTokenTotals): CostBreakdown {
  const geminiUsd =
    (usage.inputAudioTokens * AUDIO_INPUT_USD_PER_M_TOKENS +
      usage.outputAudioTokens * AUDIO_OUTPUT_USD_PER_M_TOKENS +
      usage.inputTextTokens * TEXT_INPUT_USD_PER_M_TOKENS +
      usage.outputTextTokens * TEXT_OUTPUT_USD_PER_M_TOKENS) /
    1_000_000;
  const openaiLiveUsd = ((usage.liveSeconds ?? 0) / 60) * OPENAI_LIVE_USD_PER_MINUTE;
  const openaiBackendUsd = backendCostUsd(usage);
  return {
    geminiUsd,
    openaiLiveUsd,
    openaiBackendUsd,
    totalUsd: openaiLiveUsd + openaiBackendUsd + geminiUsd,
  };
}

export function estimateCostUsd(usage: SessionTokenTotals): number {
  return estimateCostBreakdown(usage).totalUsd;
}

/** True when the totals carry anything worth recording. */
export function hasUsage(usage: SessionTokenTotals): boolean {
  return (
    usage.inputAudioTokens +
      usage.outputAudioTokens +
      usage.inputTextTokens +
      usage.outputTextTokens +
      (usage.liveSeconds ?? 0) +
      (usage.backendInputTokens ?? 0) +
      (usage.backendOutputTokens ?? 0) >
    0
  );
}
