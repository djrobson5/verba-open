'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { LiveClient, LiveClientCallbacks } from '@/lib/gemini/live-client';
import { AudioRecorder } from '@/lib/gemini/audio-recorder';
import { AudioPlayer } from '@/lib/gemini/audio-player';
import { createAvatarProvider, tokenEndpointFor } from '@/lib/avatar';
import { voiceForFace } from '@/config/avatars';
import { LiveWebRtcClient, type LiveUsageSnapshot } from '@/lib/openai/live-webrtc-client';
import { buildGreetingInstruction } from '@/lib/openai/live-prompts';
import {
  DEFAULT_OPENAI_BACKEND_MODEL,
  getLiveModel,
  type LiveProvider,
} from '@/config/models';
import type { Difficulty } from '@/config/scenarios';
import type { AvatarProvider, AvatarState, AvatarVendor } from '@/lib/avatar/types';
import { LiveClientState, LiveConfig, UsageMetadata } from '@/lib/gemini/types';
import { SessionTokenTotals, ZERO_TOKEN_TOTALS } from '@/config/pricing';
import { DAILY_REAL_SESSION_LIMIT, WEEKLY_PRACTICE_SECONDS } from '@/config/limits';
import type { EndSensitivity } from '@/config/voiceTiming';

export interface TranscriptEntry {
  role: 'user' | 'ai';
  text: string;
  timestamp: Date;
}

interface UseLiveSessionOptions {
  systemPrompt: string;
  model: string;
  /** Target language, needed by the OpenAI path to split voice vs backend
   *  prompts server-side and to word the opening greeting. */
  languageName?: string;
  difficulty?: Difficulty;
  transcribe?: boolean;
  /** Turn-taking tuning. When set, the AI waits `silenceDurationMs` of silence
   *  before responding, so it doesn't cut off a user who pauses mid-thought. */
  vad?: {
    silenceDurationMs: number;
    endOfSpeechSensitivity: EndSensitivity;
  };
  /** When set, the model's output audio is also streamed to the chosen avatar
   *  vendor to drive a lip-synced face. Null/undefined keeps the plain
   *  audio-only session. */
  avatar?: { vendor: AvatarVendor; faceId: string } | null;
}

const AVATAR_FALLBACK_MESSAGE = 'Video partner unavailable, continuing with audio only.';

/** Copy for a 429 from either start route, by its `reason`. */
function limitMessage(reason: unknown, fallback: string): string {
  if (reason === 'weekly-limit') {
    return `You've used this week's ${WEEKLY_PRACTICE_SECONDS / 60} minutes of practice. It resets Monday.`;
  }
  if (reason === 'daily-limit') {
    return `You've used all ${DAILY_REAL_SESSION_LIMIT} of today's practice sessions. Come back tomorrow.`;
  }
  if (reason === 'rate-limit') {
    return 'Too many session attempts today. Take a short break and try again later.';
  }
  return fallback;
}

/**
 * One session's weekly-budget bookkeeping. The reservation comes back from
 * the start route (null for admins and unlimited accounts); connected time is
 * measured here, from the provider's own state changes, because Gemini
 * reports no duration and the page's `elapsed` counter is display state.
 */
interface SessionBudget {
  reservationId: string | null;
  connectedMs: number;
  connectedSince: number | null;
}

function newSessionBudget(): SessionBudget {
  return { reservationId: null, connectedMs: 0, connectedSince: null };
}

function trackConnected(budget: SessionBudget, connected: boolean) {
  const now = Date.now();
  if (connected && budget.connectedSince === null) {
    budget.connectedSince = now;
  } else if (!connected && budget.connectedSince !== null) {
    budget.connectedMs += now - budget.connectedSince;
    budget.connectedSince = null;
  }
}

function connectedSecondsOf(budget: SessionBudget): number {
  const running = budget.connectedSince === null ? 0 : Date.now() - budget.connectedSince;
  return Math.floor((budget.connectedMs + running) / 1000);
}

/**
 * Settles the session's reservation: the server charges
 * min(connectedSeconds, reserved) and releases the rest; a second settle is a
 * no-op. Its own POST (not bundled with the token usage, which can take ~15 s
 * on GPT-Live) so the unused time is back before the student can restart.
 * keepalive lets it outlive the page when the hook unmounts.
 */
function settleBudget(budget: SessionBudget) {
  if (!budget.reservationId) return;
  const body = JSON.stringify({
    reservationId: budget.reservationId,
    connectedSeconds: connectedSecondsOf(budget),
  });
  budget.reservationId = null;
  fetch('/api/session-usage', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    keepalive: true,
  }).catch((err) => console.error('Practice-time settle failed:', err));
}

function readReservation(data: unknown): {
  reservationId: string | null;
  reservedSeconds: number | null;
} {
  const d = (data ?? {}) as { reservationId?: unknown; reservedSeconds?: unknown };
  return {
    reservationId: typeof d.reservationId === 'string' ? d.reservationId : null,
    reservedSeconds:
      typeof d.reservedSeconds === 'number' && Number.isFinite(d.reservedSeconds)
        ? d.reservedSeconds
        : null,
  };
}

export function useLiveSession({
  systemPrompt,
  model,
  languageName,
  difficulty = 'medium',
  transcribe = true,
  vad,
  avatar,
}: UseLiveSessionOptions) {
  const [state, setState] = useState<LiveClientState>('disconnected');
  const [error, setError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [userAnalyser, setUserAnalyser] = useState<AnalyserNode | null>(null);
  const [aiAnalyser, setAiAnalyser] = useState<AnalyserNode | null>(null);
  const [avatarState, setAvatarState] = useState<AvatarState>('idle');
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [avatarSpeaking, setAvatarSpeaking] = useState(false);
  // Weekly-budget seconds reserved for the current session, or null when
  // there is no budget (admin/unlimited) or no reservation yet.
  const [reservedSeconds, setReservedSeconds] = useState<number | null>(null);
  const [avatarElements, setAvatarElements] = useState<{
    video: HTMLVideoElement;
    audio: HTMLAudioElement;
  } | null>(null);

  const clientRef = useRef<LiveClient | null>(null);
  const openaiRef = useRef<LiveWebRtcClient | null>(null);
  const recorderRef = useRef<AudioRecorder | null>(null);
  const playerRef = useRef<AudioPlayer | null>(null);
  const avatarRef = useRef<AvatarProvider | null>(null);
  const beaconTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The current session's reservation and connected-time clock. Callbacks
  // capture the object itself; this ref only says which one is current.
  const budgetRef = useRef<SessionBudget | null>(null);
  // Tracks whose turn is currently being streamed so consecutive chunks merge
  // into one transcript bubble. Cleared on turnComplete or when the role flips.
  const openTurnRef = useRef<'user' | 'ai' | null>(null);
  // Live API emits usageMetadata as running per-session totals on each event,
  // so we just keep the latest snapshot and use it as the final tally on stop.
  const usageRef = useRef<SessionTokenTotals>({ ...ZERO_TOKEN_TOTALS });
  // GPT-Live: the Responses model the current session was created with, read
  // by stop() to label (and so price) that session's backend tokens.
  const openaiBackendModelRef = useRef<string | null>(null);

  const addTranscriptEntry = useCallback((role: 'user' | 'ai', text: string) => {
    if (!text) return;
    setTranscript((prev) => {
      const isContinuation =
        openTurnRef.current === role &&
        prev.length > 0 &&
        prev[prev.length - 1].role === role;
      if (isContinuation) {
        const last = prev[prev.length - 1];
        openTurnRef.current = role;
        return [...prev.slice(0, -1), { ...last, text: last.text + text }];
      }
      if (!text.trim()) return prev;
      openTurnRef.current = role;
      return [...prev, { role, text, timestamp: new Date() }];
    });
  }, []);

  const handleTurnComplete = useCallback(() => {
    // Vendors that need an explicit end-of-speech marker (LiveAvatar) flush
    // here; Simli's endUtterance is a no-op. Read off the ref so this stays a
    // stable callback.
    avatarRef.current?.endUtterance();
    openTurnRef.current = null;
    setTranscript((prev) => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      const trimmed = last.text.trim();
      if (trimmed === last.text) return prev;
      if (!trimmed) return prev.slice(0, -1);
      return [...prev.slice(0, -1), { ...last, text: trimmed }];
    });
  }, []);

  // Live API usageMetadata is cumulative for the session. Each emission is the
  // current running total, so we replace (not add) and bucket by modality.
  const handleUsageMetadata = useCallback((m: UsageMetadata) => {
    const totals: SessionTokenTotals = { ...ZERO_TOKEN_TOTALS };
    for (const d of m.promptTokensDetails ?? []) {
      const count = d.tokenCount ?? 0;
      if (d.modality === 'AUDIO') totals.inputAudioTokens += count;
      else totals.inputTextTokens += count;
    }
    for (const d of m.responseTokensDetails ?? []) {
      const count = d.tokenCount ?? 0;
      if (d.modality === 'AUDIO') totals.outputAudioTokens += count;
      else totals.outputTextTokens += count;
    }
    // Fallback for events that emit only the rolled-up counts: attribute them
    // to text so we don't lose data, but only if no modality breakdown arrived.
    if (
      totals.inputAudioTokens === 0 &&
      totals.inputTextTokens === 0 &&
      m.promptTokenCount
    ) {
      totals.inputTextTokens = m.promptTokenCount;
    }
    if (
      totals.outputAudioTokens === 0 &&
      totals.outputTextTokens === 0 &&
      m.responseTokenCount
    ) {
      totals.outputTextTokens = m.responseTokenCount;
    }
    usageRef.current = totals;
  }, []);

  // A session that ends on its own (socket closed, connect failed, network
  // drop) never goes through stop(), so settle its reservation here. Without
  // this, a confirmed session that dropped would be charged its whole
  // reservation, like a closed tab.
  const endBudgetOnState = useCallback((budget: SessionBudget, next: LiveClientState) => {
    trackConnected(budget, next === 'connected');
    if ((next === 'error' || next === 'disconnected') && budgetRef.current === budget) {
      budgetRef.current = null;
      settleBudget(budget);
    }
  }, []);

  // The 10-second "real session" ping: counts toward the daily cap and
  // confirms this session's weekly reservation. Fire-and-forget; a failure
  // only means the counter doesn't tick (and an unsettled reservation is
  // released rather than charged in full).
  const scheduleBeacon = useCallback((budget: SessionBudget) => {
    beaconTimerRef.current = setTimeout(() => {
      beaconTimerRef.current = null;
      fetch('/api/session-active', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reservationId: budget.reservationId }),
      }).catch((err) => {
        console.error('session-active beacon failed:', err);
      });
    }, 10_000);
  }, []);

  // ---------------------------------------------------------------- OpenAI
  // GPT-Live replaces the recorder/player/websocket trio with a single WebRTC
  // peer connection: the mic is a track, the model's voice is a remote track,
  // and control events ride the "oai-events" data channel. The avatar sink and
  // mute semantics move from AudioPlayer onto LiveWebRtcClient, so both avatar
  // vendors keep working unchanged.
  const startOpenAi = useCallback(
    async ({
      vendor,
      faceId,
      avatarTokenPromise,
      budget,
    }: {
      vendor: AvatarVendor;
      faceId: string | null;
      avatarTokenPromise: Promise<string | null>;
      budget: SessionBudget;
    }) => {
      const voiceName = faceId ? voiceForFace(vendor, faceId, 'openai') : undefined;
      // Usage for this session lives on the client instance itself (see
      // stop()), so nothing here writes the shared usageRef.
      const backendModel = DEFAULT_OPENAI_BACKEND_MODEL;

      // stop() detaches the client synchronously but its teardown (and the
      // final usage) arrives up to 15 s later. Once detached, its UI callbacks
      // must not touch state — a new session may already be running.
      const isCurrent = () => openaiRef.current === client;
      const client: LiveWebRtcClient = new LiveWebRtcClient({
        onInputTranscription: (text) => {
          if (isCurrent()) addTranscriptEntry('user', text);
        },
        onOutputTranscription: (text) => {
          if (isCurrent()) addTranscriptEntry('ai', text);
        },
        onStateChange: (next) => {
          endBudgetOnState(budget, next);
          if (isCurrent()) setState(next);
        },
        onError: (message) => {
          if (isCurrent()) setError(message);
        },
        onUsageSeconds: () => {
          // Tracked inside the client; read back via getUsage()/disconnect().
        },
        onDelegation: () => {
          // Logged inside the client; nothing to surface in the UI yet.
        },
        // GPT-Live has no turn-complete event, so end-of-turn is the falling
        // edge of the RMS speaking detector.
        onAiSpeakingChange: (speaking) => {
          if (!speaking && isCurrent()) handleTurnComplete();
        },
      });
      openaiRef.current = client;
      openaiBackendModelRef.current = backendModel;

      try {
        if (faceId) {
          const sessionToken = await avatarTokenPromise;
          if (!isCurrent()) return;
          if (sessionToken) {
            let av: AvatarProvider | null = null;
            try {
              av = createAvatarProvider(vendor, {
                onStateChange: (next) => {
                  setAvatarState(next);
                  if (next === 'error' || next === 'stopped') {
                    client.setSink(null);
                    client.setMuted(false);
                    if (next === 'error') setAvatarError(AVATAR_FALLBACK_MESSAGE);
                  }
                },
                onSpeakingChange: setAvatarSpeaking,
              });
              avatarRef.current = av;
              setAvatarElements({ video: av.videoElement, audio: av.audioElement });
              client.setMuted(true);
              const started = av;
              client.setSink({ push: (pcm) => started.pushPcm24k(pcm) });
              await av.start(sessionToken);
            } catch (err) {
              console.error('Avatar start failed:', err);
              av?.stop().catch(() => {});
              avatarRef.current = null;
              setAvatarElements(null);
              client.setMuted(false);
              client.setSink(null);
              setAvatarState('error');
              setAvatarError(AVATAR_FALLBACK_MESSAGE);
            }
          } else {
            setAvatarState('error');
            setAvatarError(AVATAR_FALLBACK_MESSAGE);
          }
        }

        // Ended while the avatar was coming up: don't open a billed session.
        if (!isCurrent()) return;

        await client.connect({
          greeting: buildGreetingInstruction(languageName ?? 'the target language'),
          fetchAnswer: async (sdp) => {
            const res = await fetch('/api/openai-live-session', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                sdp,
                systemPrompt,
                languageName,
                difficulty,
                voiceName,
                backendModel,
              }),
            });
            if (!res.ok) {
              if (res.status === 429) {
                const body = await res.json().catch(() => ({}));
                throw new Error(limitMessage(body?.reason, 'Failed to start GPT-Live session'));
              }
              throw new Error('Failed to start GPT-Live session');
            }
            const data = await res.json();
            const held = readReservation(data);
            budget.reservationId = held.reservationId;
            // Ended while the session was being created: hand the time back.
            if (budgetRef.current !== budget) settleBudget(budget);
            else setReservedSeconds(held.reservedSeconds);
            if (typeof data?.sdp !== 'string' || !data.sdp) {
              throw new Error('GPT-Live returned no SDP answer');
            }
            return { sessionId: String(data.sessionId ?? ''), sdp: data.sdp };
          },
        });

        if (!isCurrent()) return;
        setAiAnalyser(client.getAiAnalyser());
        setUserAnalyser(client.getUserAnalyser());

        scheduleBeacon(budget);
      } catch (err) {
        // Stopped mid-connect: stop() already cleaned up, and a newer session
        // may own the refs now.
        if (!isCurrent()) return;
        if (budgetRef.current === budget) {
          budgetRef.current = null;
          settleBudget(budget);
        }
        openaiRef.current = null;
        avatarRef.current?.stop().catch(() => {});
        avatarRef.current = null;
        setAvatarElements(null);
        setError(err instanceof Error ? err.message : 'Connection failed');
        setState('error');
      }
    },
    [
      systemPrompt,
      languageName,
      difficulty,
      addTranscriptEntry,
      handleTurnComplete,
      endBudgetOnState,
      scheduleBeacon,
    ],
  );

  const start = useCallback(async () => {
    setError(null);
    setTranscript([]);
    openTurnRef.current = null;
    usageRef.current = { ...ZERO_TOKEN_TOTALS };
    setReservedSeconds(null);
    const budget = newSessionBudget();
    budgetRef.current = budget;

    const vendor: AvatarVendor = avatar?.vendor ?? 'simli';
    const faceId = avatar?.faceId ?? null;
    // The voice is pinned into the Gemini token (and fixed at GPT-Live session
    // creation), so it has to be chosen here rather than after the session is up.
    const voiceName = faceId
      ? voiceForFace(vendor, faceId, getLiveModel(model)?.provider ?? 'gemini')
      : undefined;
    setAvatarError(null);
    setAvatarSpeaking(false);
    setAvatarElements(null);
    setAvatarState(faceId ? 'connecting' : 'idle');

    // Started before (not after) the Gemini token fetch so the two round-trips
    // overlap. It resolves to null on any failure — the avatar is optional and
    // must never be able to fail the voice session.
    const avatarTokenPromise: Promise<string | null> = faceId
      ? fetch(tokenEndpointFor(vendor), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          // Both routes read their own key; sending both spellings keeps this
          // one call site vendor-agnostic.
          body: JSON.stringify({ faceId, avatarId: faceId }),
        })
          .then((r) => (r.ok ? r.json() : null))
          .then((d) => (typeof d?.sessionToken === 'string' ? d.sessionToken : null))
          .catch(() => null)
      : Promise.resolve(null);

    const provider: LiveProvider = getLiveModel(model)?.provider ?? 'gemini';

    if (provider === 'openai') {
      await startOpenAi({ vendor, faceId, avatarTokenPromise, budget });
      return;
    }

    try {
      const res = await fetch('/api/gemini-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, systemPrompt, transcribe, vad, voiceName }),
      });
      if (!res.ok) {
        if (res.status === 429) {
          const body = await res.json().catch(() => ({}));
          throw new Error(limitMessage(body?.reason, 'Failed to get token'));
        }
        throw new Error('Failed to get token');
      }
      const data = await res.json();
      const held = readReservation(data);
      budget.reservationId = held.reservationId;
      // Ended while the token was being minted: hand the time back.
      if (budgetRef.current !== budget) {
        settleBudget(budget);
        return;
      }
      setReservedSeconds(held.reservedSeconds);
      const token = data.token;
      // The socket setup must match the config pinned into the token exactly,
      // so we use the server's copy rather than rebuilding it here.
      const config: LiveConfig = data.config;
      if (!token) throw new Error('Token is empty or undefined');
      if (!config) throw new Error('Session config missing from token response');

      const player = new AudioPlayer();
      player.ensureContext();
      playerRef.current = player;
      setAiAnalyser(player.getAnalyser());

      // Bring the avatar up before connecting the socket, so the very first
      // Gemini audio chunk already has somewhere to go.
      if (faceId) {
        const sessionToken = await avatarTokenPromise;
        if (sessionToken) {
          let av: AvatarProvider | null = null;
          try {
            av = createAvatarProvider(vendor, {
              onStateChange: (next) => {
                setAvatarState(next);
                // Losing the avatar must not take the voice with it: hand
                // playback back to the browser and keep the session running.
                if (next === 'error' || next === 'stopped') {
                  player.setSink(null);
                  player.setMuted(false);
                  if (next === 'error') setAvatarError(AVATAR_FALLBACK_MESSAGE);
                }
              },
              onSpeakingChange: setAvatarSpeaking,
            });
            avatarRef.current = av;
            setAvatarElements({ video: av.videoElement, audio: av.audioElement });
            player.setMuted(true);
            const started = av;
            player.setSink({ push: (pcm) => started.pushPcm24k(pcm) });
            await av.start(sessionToken);
          } catch (err) {
            console.error('Avatar start failed:', err);
            av?.stop().catch(() => {});
            avatarRef.current = null;
            setAvatarElements(null);
            player.setMuted(false);
            player.setSink(null);
            setAvatarState('error');
            setAvatarError(AVATAR_FALLBACK_MESSAGE);
          }
        } else {
          setAvatarState('error');
          setAvatarError(AVATAR_FALLBACK_MESSAGE);
        }
      }

      const callbacks: LiveClientCallbacks = {
        onAudioData: (data) => player.addData(data),
        onInputTranscription: (text) => addTranscriptEntry('user', text),
        onOutputTranscription: (text) => addTranscriptEntry('ai', text),
        onTurnComplete: handleTurnComplete,
        onInterrupted: () => {
          player.clearQueue();
          avatarRef.current?.interrupt();
        },
        onStateChange: (s) => {
          endBudgetOnState(budget, s);
          setState(s);
        },
        onError: (err) => setError(err),
        onUsageMetadata: handleUsageMetadata,
      };

      const client = new LiveClient(callbacks);
      clientRef.current = client;

      await client.connect(token, config);

      const recorder = new AudioRecorder();
      recorderRef.current = recorder;
      await recorder.start((data) => client.sendAudio(data));
      setUserAnalyser(recorder.getAnalyser());

      // Mark this as a "real" session after 10s of recording.
      scheduleBeacon(budget);
    } catch (err) {
      if (budgetRef.current === budget) {
        budgetRef.current = null;
        settleBudget(budget);
      }
      setError(err instanceof Error ? err.message : 'Connection failed');
      setState('error');
    }
  }, [
    systemPrompt,
    model,
    transcribe,
    vad,
    avatar?.vendor,
    avatar?.faceId,
    addTranscriptEntry,
    handleTurnComplete,
    handleUsageMetadata,
    startOpenAi,
    endBudgetOnState,
    scheduleBeacon,
  ]);

  /**
   * Tears the session down synchronously (the UI goes idle immediately) and
   * returns this session's usage as a promise. Gemini's usage is already final
   * and resolves at once; GPT-Live's resolves once `disconnect()` has seen
   * `session.closed` (final `usage.seconds` plus any late backend responses),
   * or after its 15 s timeout with the last known snapshot. The promise is
   * bound to this session's own client, so a new session started meanwhile
   * can't leak into it. It never rejects.
   *
   * It also settles the session's weekly-budget reservation right away with
   * the connected time measured so far (see settleBudget), so every way a
   * session ends through here, including unmount, hands unused time back.
   */
  const stop = useCallback((): { usage: Promise<SessionTokenTotals> } => {
    if (beaconTimerRef.current) {
      clearTimeout(beaconTimerRef.current);
      beaconTimerRef.current = null;
    }
    const budget = budgetRef.current;
    budgetRef.current = null;
    if (budget) {
      trackConnected(budget, false);
      settleBudget(budget);
    }
    recorderRef.current?.stop();
    clientRef.current?.disconnect();
    playerRef.current?.stop();

    let usage: Promise<SessionTokenTotals>;
    const openai = openaiRef.current;
    if (openai) {
      const backendModel = openaiBackendModelRef.current ?? undefined;
      const toTotals = (snap: LiveUsageSnapshot): SessionTokenTotals => ({
        ...ZERO_TOKEN_TOTALS,
        provider: 'openai',
        liveSeconds: snap.seconds ?? 0,
        backendInputTokens: snap.backend.inputTokens,
        backendCachedInputTokens: snap.backend.cachedInputTokens,
        backendCacheWriteTokens: snap.backend.cacheWriteTokens,
        backendOutputTokens: snap.backend.outputTokens,
        backendModel,
      });
      usage = openai.disconnect().then(toTotals, (err) => {
        console.error('GPT-Live disconnect failed:', err);
        return toTotals(openai.getUsage());
      });
      // The client's own 'disconnected' arrives only after teardown and is
      // ignored once detached, so flip the UI to idle now.
      setState('disconnected');
    } else {
      usage = Promise.resolve({ ...usageRef.current });
    }

    // Fire-and-forget: teardown is async but nothing downstream waits on it.
    avatarRef.current?.stop().catch((err) => console.error('Avatar stop failed:', err));
    recorderRef.current = null;
    clientRef.current = null;
    playerRef.current = null;
    openaiRef.current = null;
    openaiBackendModelRef.current = null;
    avatarRef.current = null;
    setUserAnalyser(null);
    setAiAnalyser(null);
    setAvatarElements(null);
    setAvatarState('idle');
    setAvatarSpeaking(false);
    setAvatarError(null);
    return { usage };
  }, []);

  // A session must not outlive the component: without this, a remount (route
  // change, Fast Refresh in dev) leaves the old socket, recorder and avatar
  // running with no way to stop them, and a second start() then produces two
  // partners answering the same microphone.
  const stopRef = useRef(stop);
  stopRef.current = stop;
  useEffect(() => () => {
    if (
      clientRef.current ||
      recorderRef.current ||
      openaiRef.current ||
      avatarRef.current ||
      // Still fetching the token: stop() detaches the session so its
      // reservation is handed back when the response lands.
      budgetRef.current
    ) {
      stopRef.current();
    }
  }, []);

  return {
    state,
    error,
    transcript,
    start,
    stop,
    userAnalyser,
    aiAnalyser,
    avatarState,
    avatarError,
    avatarElements,
    avatarSpeaking,
    avatarVendor: avatar?.vendor ?? null,
    reservedSeconds,
  };
}
