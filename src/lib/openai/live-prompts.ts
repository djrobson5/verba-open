import type { Difficulty } from '@/config/scenarios';

export interface LivePromptInput {
  /** The scenario system prompt built by buildSystemPrompt() — the pedagogy. */
  systemPrompt: string;
  languageName: string;
  difficulty: Difficulty;
}

export interface LivePrompts {
  /** Frontend (voice) instructions for gpt-live-1. Short by design. */
  voiceInstructions: string;
  /** Backend instructions for the delegated Responses model. */
  backendInstructions: string;
}

const PACE_BY_DIFFICULTY: Record<Difficulty, string> = {
  easy: 'a slow, clear pace with simple vocabulary',
  medium: 'a natural but unhurried pace',
  hard: 'a natural native pace',
};

// OpenAI's recommended preamble for a Responses backend that is being fed
// speech transcripts rather than typed text.
const VOICE_CONTEXT_PREAMBLE = `Voice conversation context.
You are the reasoning backend for a live voice conversation. The text you receive
comes from speech transcription and may be imperfect, mis-segmented, or missing
punctuation — infer intent rather than objecting to wording. Always act on the
most recent context. Answer concisely: return the facts, the correction, or the
next step to take, in a form the voice model can speak in one or two sentences.
Do not write stage directions, markdown, or lists.`;

export function buildLivePrompts({
  systemPrompt,
  languageName,
  difficulty,
}: LivePromptInput): LivePrompts {
  const pace = PACE_BY_DIFFICULTY[difficulty] ?? PACE_BY_DIFFICULTY.medium;

  const backendInstructions = `${VOICE_CONTEXT_PREAMBLE}\n\n${systemPrompt.trim()}`;

  // The voice model needs the scene and its role, or it opens and talks as a
  // generic tutor (the backend alone knowing the scenario isn't enough: the
  // greeting and every short reply come from the voice model). Corrections and
  // explanations still go to the backend per the delegation rules below.
  const voiceInstructions = `You are role-playing a scene to help a student practice ${languageName}. Stay in character for the whole conversation.

Scene and your role:
${systemPrompt.trim()}

Speech rules:
- Speak only in ${languageName}. Never switch to English unless the backend explicitly tells you to.
- Keep every reply to one or two short sentences.
- Speak at ${pace}.
- After each reply, stop and wait for the student. Do not fill silence with extra talk.
- If the student interrupts you, stop speaking immediately and listen.

Delegation rules:
- Delegate to the backend whenever the student needs a correction, an explanation,
  a vocabulary or grammar answer, or whenever you need the next step of the scenario.
- While waiting for the backend, you may say a short natural filler in ${languageName},
  but never invent pedagogical content yourself.
- Speak the backend's answer in ${languageName}, rephrased naturally and briefly.`;

  return { voiceInstructions, backendInstructions };
}

/** Sent once via session.instructions.append after session.started, because the
 *  model otherwise waits for the student to speak first. */
export function buildGreetingInstruction(languageName: string): string {
  return `Start the scene now, in character and in ${languageName}: say the first line your character would naturally say to open this situation (one short sentence, ending with a simple question that invites the student to respond), then wait.`;
}
