import type { Difficulty } from '@/config/scenarios';

/**
 * Gemini Live end-of-speech sensitivity. LOW makes the model more conservative
 * about deciding the speaker is done — it waits longer before responding; HIGH
 * is more eager. Learners, who pause mid-thought, benefit from LOW.
 */
export type EndSensitivity = 'END_SENSITIVITY_LOW' | 'END_SENSITIVITY_HIGH';

export interface VoiceTiming {
  /**
   * Silence (ms) after the user stops speaking before the AI takes its turn,
   * keyed by difficulty. Higher = more room to pause and collect thoughts, at
   * the cost of more lag when the user has genuinely finished a turn.
   */
  silenceMs: Record<Difficulty, number>;
  endSensitivity: EndSensitivity;
}

/**
 * Defaults tuned for language learners, who pause far more than native speakers
 * — retrieving vocabulary, conjugating, composing a sentence. Beginners get the
 * most room; advanced speakers get near-natural responsiveness. These are
 * starting points; adjust them against real sessions.
 *
 * Kept as a standalone config so it can later become the fallback for an
 * admin-editable Firestore doc without changing any call sites.
 */
export const DEFAULT_VOICE_TIMING: VoiceTiming = {
  silenceMs: { easy: 1500, medium: 1000, hard: 600 },
  endSensitivity: 'END_SENSITIVITY_LOW',
};

/** Per-difficulty timing, falling back to medium for unexpected values. */
export function silenceMsFor(difficulty: Difficulty): number {
  return DEFAULT_VOICE_TIMING.silenceMs[difficulty] ?? DEFAULT_VOICE_TIMING.silenceMs.medium;
}
