'use client';

import { useCallback } from 'react';
import { addDoc, Timestamp } from 'firebase/firestore';
import { getUserConversationsRef } from '@/config/firestore';
import { useAuthContext } from '@/providers/AuthProvider';
import type { Difficulty } from '@/config/scenarios';
import { estimateCostUsd, type SessionTokenTotals } from '@/config/pricing';

interface TranscriptMessage {
  role: 'user' | 'ai';
  text: string;
  timestamp: Date;
}

interface SaveTranscriptParams {
  scenarioId: string;
  scenarioTitle: string;
  languageCode: string;
  languageName: string;
  difficulty: Difficulty;
  messages: TranscriptMessage[];
  model?: string;
  tokens?: SessionTokenTotals;
}

export function useTranscript() {
  const { user } = useAuthContext();

  const saveTranscript = useCallback(
    async (params: SaveTranscriptParams) => {
      if (!user) return;

      const ref = getUserConversationsRef(user.uid);
      const tokens = params.tokens;
      await addDoc(ref, {
        scenarioId: params.scenarioId,
        scenarioTitle: params.scenarioTitle,
        languageCode: params.languageCode,
        languageName: params.languageName,
        difficulty: params.difficulty,
        startedAt: Timestamp.fromDate(params.messages[0]?.timestamp || new Date()),
        endedAt: Timestamp.fromDate(new Date()),
        messages: params.messages.map((m) => ({
          role: m.role,
          text: m.text,
          timestamp: Timestamp.fromDate(m.timestamp),
        })),
        ...(params.model ? { model: params.model } : {}),
        ...(tokens
          ? {
              inputAudioTokens: tokens.inputAudioTokens,
              outputAudioTokens: tokens.outputAudioTokens,
              inputTextTokens: tokens.inputTextTokens,
              outputTextTokens: tokens.outputTextTokens,
              // GPT-Live only; omitted for Gemini so those docs are unchanged.
              ...(tokens.provider === 'openai'
                ? {
                    liveSeconds: tokens.liveSeconds ?? 0,
                    backendInputTokens: tokens.backendInputTokens ?? 0,
                    backendCachedInputTokens: tokens.backendCachedInputTokens ?? 0,
                    backendOutputTokens: tokens.backendOutputTokens ?? 0,
                    ...(tokens.backendModel ? { backendModel: tokens.backendModel } : {}),
                  }
                : {}),
              estimatedCostUsd: estimateCostUsd(tokens),
            }
          : {}),
      });
    },
    [user],
  );

  return { saveTranscript };
}
