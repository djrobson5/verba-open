'use client';

import { use, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { getLanguage } from '@/config/languages';
import { buildSystemPrompt, Difficulty, Scenario } from '@/config/scenarios';
import { DEFAULT_VOICE_TIMING, silenceMsFor } from '@/config/voiceTiming';
import { fetchScenario } from '@/lib/scenarios/store';
import {
  DEFAULT_MODEL,
  DEFAULT_OPENAI_BACKEND_MODEL,
  getLiveModel,
  LIVE_MODELS,
} from '@/config/models';
import {
  AVATAR_FACES,
  AVATAR_VENDORS,
  DEFAULT_FACE,
  DEFAULT_VENDOR,
  isAvatarVendor,
} from '@/config/avatars';
import type { AvatarVendor } from '@/lib/avatar/types';
import { useLiveSession } from '@/hooks/useLiveSession';
import { useTranscript } from '@/hooks/useTranscript';
import { hasUsage } from '@/config/pricing';
import { useSessionLimits, type SessionLimitReason } from '@/hooks/useSessionLimits';
import { useWeeklyBudget } from '@/hooks/useWeeklyBudget';
import {
  SESSION_IDLE_TIMEOUT_SECONDS,
  SESSION_IDLE_WARNING_SECONDS,
  SESSION_MAX_SECONDS,
  SESSION_TIME_WARNING_SECONDS,
  WEEKLY_LOW_WARNING_SECONDS,
  WEEKLY_MIN_START_SECONDS,
  WEEKLY_PRACTICE_SECONDS,
} from '@/config/limits';
import { ConversationView } from '@/components/session/ConversationView';
import { AudioVisualizer } from '@/components/session/AudioVisualizer';
import { AvatarStage } from '@/components/session/AvatarStage';
import type { LiveClientState } from '@/lib/gemini/types';
import { ScenarioIcon, resolveScenarioIconKey } from '@/config/scenarioIcons';

const AVATAR_PREFS_KEY = 'verba.avatar';

const SELECT_CLASS =
  'shrink-0 rounded-ui bg-white border border-control-border px-3 py-1.5 text-sm text-ink font-medium hover:border-ink-soft transition-colors disabled:opacity-50 cursor-pointer';

interface AvatarPrefs {
  on: boolean;
  vendor: AvatarVendor;
  faceId: string;
}

function readAvatarPrefs(): AvatarPrefs | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(AVATAR_PREFS_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const { on, vendor, faceId } = parsed as {
      on?: unknown;
      vendor?: unknown;
      faceId?: unknown;
    };
    // Migration: the pre-vendor shape stored only { on, faceId } and always
    // meant Simli, so an absent/unknown vendor falls back to the default and a
    // faceId that doesn't belong to that vendor is dropped rather than carried.
    const resolvedVendor: AvatarVendor = isAvatarVendor(vendor) ? vendor : DEFAULT_VENDOR;
    return {
      on: on === true,
      vendor: resolvedVendor,
      faceId:
        typeof faceId === 'string' &&
        AVATAR_FACES[resolvedVendor].some((f) => f.id === faceId)
          ? faceId
          : DEFAULT_FACE[resolvedVendor],
    };
  } catch {
    return null;
  }
}

function MicIcon({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M12 14a3 3 0 003-3V5a3 3 0 10-6 0v6a3 3 0 003 3z" />
      <path d="M19 11a1 1 0 10-2 0 5 5 0 01-10 0 1 1 0 10-2 0 7 7 0 006 6.93V20H8a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07A7 7 0 0019 11z" />
    </svg>
  );
}

function StopIcon({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <rect x="6" y="6" width="12" height="12" rx="2" />
    </svg>
  );
}

const WARNING_STRIP_CLASS =
  'bg-accent-soft border border-[#d9a536] rounded-ui shadow-float flex items-center gap-3 px-4 py-2.5';

function formatDuration(secs: number) {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/** Why a session auto-ended. 'budget' is the hard limit when it was set by
 *  the weekly budget rather than SESSION_MAX_SECONDS. */
type EndReason = SessionLimitReason | 'budget';

function endNoticeText(reason: EndReason, saved: boolean) {
  const ended =
    reason === 'budget'
      ? `You've used this week's ${WEEKLY_PRACTICE_SECONDS / 60} minutes of practice. Your time resets Monday.`
      : reason === 'time'
        ? `Session ended after ${SESSION_MAX_SECONDS / 60} minutes.`
        : `Session ended because you hadn't spoken for ${SESSION_IDLE_TIMEOUT_SECONDS / 60} minutes.`;
  return saved ? `${ended} Your conversation was saved.` : ended;
}

/** Pre-start note on the idle screen when little or no weekly time is left. */
function weeklyStartNote(
  remainingSeconds: number,
): { tone: 'warn' | 'bad'; text: string } | null {
  if (remainingSeconds < WEEKLY_MIN_START_SECONDS) {
    return {
      tone: 'bad',
      text: `You've used this week's ${WEEKLY_PRACTICE_SECONDS / 60} minutes of practice. It resets Monday.`,
    };
  }
  if (remainingSeconds < WEEKLY_LOW_WARNING_SECONDS) {
    const minutes = Math.floor(remainingSeconds / 60);
    return {
      tone: 'warn',
      text: `${minutes} ${minutes === 1 ? 'minute' : 'minutes'} of practice left this week.`,
    };
  }
  return null;
}

const CHIP_BASE =
  'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-[11px] font-semibold uppercase tracking-[0.16em]';

function StatusChip({ state }: { state: LiveClientState }) {
  if (state === 'disconnected') {
    return (
      <span className={`${CHIP_BASE} bg-surface text-mute border border-rule-soft`}>
        <span className="w-1.5 h-1.5 rounded-full bg-control-border" />
        Ready
      </span>
    );
  }
  if (state === 'connecting') {
    return (
      <span className={`${CHIP_BASE} bg-surface text-ink-soft border border-rule`}>
        <span className="w-1.5 h-1.5 rounded-full bg-mute animate-pulse" />
        Connecting
      </span>
    );
  }
  if (state === 'connected') {
    return (
      <span className={`${CHIP_BASE} bg-brand text-accent border border-brand`}>
        <span className="relative flex w-1.5 h-1.5">
          <span className="absolute inset-0 rounded-full bg-accent animate-ping opacity-75" />
          <span className="relative w-1.5 h-1.5 rounded-full bg-accent" />
        </span>
        Live
      </span>
    );
  }
  return (
    <span className={`${CHIP_BASE} bg-white text-bad border border-bad/40`}>
      <span className="w-1.5 h-1.5 rounded-full bg-bad" />
      Error
    </span>
  );
}

export default function SessionPage({ params }: { params: Promise<{ scenarioId: string }> }) {
  const { scenarioId } = use(params);
  const searchParams = useSearchParams();
  const langCode = searchParams.get('lang') || 'es';
  const difficulty = (searchParams.get('difficulty') || 'medium') as Difficulty;

  const [selectedModel, setSelectedModel] = useState(DEFAULT_MODEL);
  const [transcribe, setTranscribe] = useState(true);
  const [avatarOn, setAvatarOn] = useState(false);
  const [avatarVendor, setAvatarVendor] = useState<AvatarVendor>(DEFAULT_VENDOR);
  const [faceId, setFaceId] = useState(DEFAULT_FACE[DEFAULT_VENDOR]);
  const [elapsed, setElapsed] = useState(0);
  const [scenario, setScenario] = useState<Scenario | null | undefined>(undefined);

  // Read once on mount rather than in useState's initializer: localStorage
  // isn't available during the server render.
  useEffect(() => {
    const prefs = readAvatarPrefs();
    if (!prefs) return;
    setAvatarOn(prefs.on);
    setAvatarVendor(prefs.vendor);
    setFaceId(prefs.faceId);
  }, []);

  // Faces are vendor-specific, so switching vendor resets to that vendor's
  // default rather than leaving an id the token route would reject.
  const handleVendorChange = useCallback((next: AvatarVendor) => {
    setAvatarVendor(next);
    setFaceId(DEFAULT_FACE[next]);
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        AVATAR_PREFS_KEY,
        JSON.stringify({ on: avatarOn, vendor: avatarVendor, faceId }),
      );
    } catch {
      // Private-mode / quota failures are not worth surfacing.
    }
  }, [avatarOn, avatarVendor, faceId]);

  const language = getLanguage(langCode);

  useEffect(() => {
    let cancelled = false;
    fetchScenario(scenarioId).then((s) => {
      if (cancelled) return;
      setScenario(s ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [scenarioId]);

  const systemPrompt =
    language && scenario ? buildSystemPrompt(scenario, difficulty, language.name) : '';

  // Give learners room to pause before the AI takes its turn — more for easier
  // (slower) levels. Memoized so it doesn't churn the session's start callback.
  const vad = useMemo(
    () => ({
      silenceDurationMs: silenceMsFor(difficulty),
      endOfSpeechSensitivity: DEFAULT_VOICE_TIMING.endSensitivity,
    }),
    [difficulty],
  );

  const avatar = useMemo(
    () => (avatarOn ? { vendor: avatarVendor, faceId } : null),
    [avatarOn, avatarVendor, faceId],
  );

  const {
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
    reservedSeconds,
  } = useLiveSession({
    systemPrompt,
    model: selectedModel,
    languageName: language?.name,
    difficulty,
    transcribe,
    vad,
    avatar,
  });
  const { saveTranscript } = useTranscript();
  const weeklyBudget = useWeeklyBudget();

  useEffect(() => {
    if (state !== 'connected') return;
    const id = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(id);
  }, [state]);

  // Also reset on 'connecting': a session that ended in 'error' never passes
  // through 'disconnected', and the hard time limit reads this counter.
  useEffect(() => {
    if (state === 'disconnected' || state === 'connecting') setElapsed(0);
  }, [state]);

  // Set synchronously at the top of handleStop so a limit firing at the same
  // moment as a click on End can't stop (and save) twice. The state copy
  // drives the UI and switches the limit clocks off; both reset on start.
  const endingRef = useRef(false);
  const [ending, setEnding] = useState(false);
  const [endNotice, setEndNotice] = useState<{
    reason: EndReason;
    saved: boolean;
  } | null>(null);

  // The session's hard cap is whatever the server reserved from the weekly
  // budget, never more than SESSION_MAX_SECONDS. No reservation (admin,
  // unlimited, or not back yet) means the plain session maximum.
  const maxSeconds = Math.min(SESSION_MAX_SECONDS, reservedSeconds ?? SESSION_MAX_SECONDS);
  const budgetLimited = maxSeconds < SESSION_MAX_SECONDS;
  const budgetLimitedRef = useRef(budgetLimited);
  useEffect(() => {
    budgetLimitedRef.current = budgetLimited;
  }, [budgetLimited]);

  // handleStop is defined below the early returns and closes over the latest
  // transcript, so the auto-end path reaches it through this ref.
  const handleStopRef = useRef<(() => Promise<boolean>) | null>(null);

  // Bumped on every start. Saving after End can take ~15 s (GPT-Live waits
  // for its final usage), so a notice from a session the student has already
  // moved on from must not land on the next one.
  const sessionGenRef = useRef(0);

  const handleLimitReached = useCallback(async (limit: SessionLimitReason) => {
    const stopFn = handleStopRef.current;
    if (!stopFn || endingRef.current) return;
    const reason: EndReason = limit === 'time' && budgetLimitedRef.current ? 'budget' : limit;
    const gen = sessionGenRef.current;
    let saved = false;
    try {
      saved = await stopFn();
    } catch (err) {
      console.error('Auto-end save failed:', err);
    }
    if (sessionGenRef.current === gen) setEndNotice({ reason, saved });
  }, []);

  const { idleSecondsLeft, timeSecondsLeft, keepAlive } = useSessionLimits({
    active: state === 'connected' && !ending,
    elapsedSeconds: elapsed,
    maxSeconds,
    userAnalyser,
    transcript,
    onLimitReached: handleLimitReached,
  });

  const handleStart = useCallback(() => {
    sessionGenRef.current += 1;
    endingRef.current = false;
    setEnding(false);
    setEndNotice(null);
    void start();
  }, [start]);

  if (!language || scenario === null) {
    return (
      <div className="py-24 text-center">
        <p className="text-mute">Session not found.</p>
        <Link
          href="/dashboard"
          className="inline-block mt-3 font-semibold text-brand hover:text-brand-deep hover:underline"
        >
          Back to dashboard →
        </Link>
      </div>
    );
  }

  if (scenario === undefined) {
    return (
      <div className="flex items-center gap-3 py-32 justify-center text-mute">
        <span className="w-5 h-5 rounded-full border-2 border-rule border-t-brand animate-spin" />
        <span className="text-sm font-medium">Loading scenario…</span>
      </div>
    );
  }

  /**
   * Resolves true when a transcript was saved. stop() tears the session down
   * (and the page goes idle) synchronously; this then waits for that
   * session's final usage — up to ~15 s for GPT-Live — before POSTing it and
   * saving the transcript, which stores the same totals. Everything it saves
   * is captured from this render, so a new session started meanwhile can't
   * mix into it.
   */
  async function handleStop(): Promise<boolean> {
    if (endingRef.current) return false;
    endingRef.current = true;
    setEnding(true);
    const { usage } = stop();
    const messages = transcript;
    const saveMeta = {
      scenarioId: scenario!.id,
      scenarioTitle: scenario!.title,
      languageCode: langCode,
      languageName: language!.name,
      difficulty,
      model: selectedModel,
    };

    const tokens = await usage;
    const hasTokenData = hasUsage(tokens);

    if (hasTokenData) {
      // Fire-and-forget. Failure here only means today's cost roll-up undercounts;
      // it must not block transcript save or the user navigating away.
      fetch('/api/session-usage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(tokens),
      }).catch((err) => console.error('session-usage POST failed:', err));
    }

    if (messages.length > 0) {
      await saveTranscript({
        ...saveMeta,
        messages,
        tokens: hasTokenData ? tokens : undefined,
      });
      return true;
    }
    return false;
  }
  handleStopRef.current = handleStop;

  const isIdle = state === 'disconnected' || state === 'error';

  return (
    <div className="flex flex-col min-h-[calc(100vh-10rem)]">
      {/* Scenario bar */}
      <div className="flex items-center justify-between gap-4 mb-6 pb-5 border-b border-rule">
        <Link
          href={`/language/${langCode}`}
          className="group inline-flex items-center gap-1.5 text-sm font-semibold text-brand hover:text-brand-deep transition-colors shrink-0"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.8}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
            className="w-4 h-4 transition-transform group-hover:-translate-x-0.5"
          >
            <path d="M19 12H5M11 6l-6 6 6 6" />
          </svg>
          <span className="sr-only sm:not-sr-only">Back</span>
        </Link>
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-ui bg-surface-2 text-ink flex items-center justify-center shrink-0">
            <ScenarioIcon iconKey={resolveScenarioIconKey(scenario)} className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <p className="text-[15px] font-bold text-ink leading-tight truncate">
              {scenario.title}
            </p>
            <p className="text-xs text-mute mt-0.5">
              {language.nativeName}
              <span className="mx-1.5" aria-hidden>
                ·
              </span>
              {difficulty.charAt(0).toUpperCase() + difficulty.slice(1)} pace
            </p>
          </div>
        </div>
        <div className="ml-auto shrink-0">
          <StatusChip state={state} />
        </div>
      </div>

      {error && (
        <div className="mb-6 rounded-ui bg-bad/5 border border-bad/30 border-l-4 border-l-bad px-4 py-3 text-sm text-ink">
          <span className="font-semibold text-bad">Couldn&apos;t start.</span>{' '}
          <span className="text-ink-soft">{error}</span>
        </div>
      )}

      {endNotice && isIdle && (
        <div
          role="status"
          className="mb-6 rounded-ui bg-surface border border-rule px-4 py-3 text-sm text-ink"
        >
          {endNoticeText(endNotice.reason, endNotice.saved)}
        </div>
      )}

      {isIdle ? (
        <IdleHero
          scenario={scenario}
          languageNative={language.nativeName}
          languageName={language.name}
          difficulty={difficulty}
          selectedModel={selectedModel}
          onModelChange={setSelectedModel}
          transcribe={transcribe}
          onTranscribeChange={setTranscribe}
          avatarOn={avatarOn}
          onAvatarOnChange={setAvatarOn}
          avatarVendor={avatarVendor}
          onAvatarVendorChange={handleVendorChange}
          faceId={faceId}
          onFaceIdChange={setFaceId}
          onStart={handleStart}
          state={state}
          weeklyNote={
            weeklyBudget.status === 'ready'
              ? weeklyStartNote(weeklyBudget.remainingSeconds)
              : null
          }
        />
      ) : (
        <>
          {avatarOn && (avatarElements || avatarState === 'connecting' || avatarState === 'error') && (
            <AvatarStage
              elements={avatarElements}
              state={avatarState}
              error={avatarError}
              speaking={avatarSpeaking}
              vendor={avatarVendor}
            />
          )}
          <ConversationView messages={transcript} languageName={language.name} />
          <div className="sticky bottom-4 mt-6 z-10">
            {(idleSecondsLeft !== null || timeSecondsLeft !== null) && (
              <div className="max-w-3xl mx-auto mb-2 space-y-2">
                {idleSecondsLeft !== null && (
                  <div role="alert" className={WARNING_STRIP_CLASS}>
                    <p className="flex-1 text-sm text-ink">
                      <span aria-hidden>
                        <strong className="font-bold">Still there?</strong> This session will end
                        in {idleSecondsLeft} seconds unless you speak.
                      </span>
                      <span className="sr-only">
                        Still there? This session will end in {SESSION_IDLE_WARNING_SECONDS} seconds unless
                        you speak.
                      </span>
                    </p>
                    <button
                      onClick={keepAlive}
                      className="bg-brand text-white rounded-ui px-4 py-2 text-sm font-semibold shrink-0 hover:bg-brand-deep transition-colors"
                    >
                      I&apos;m still here
                    </button>
                  </div>
                )}
                {timeSecondsLeft !== null && (
                  <div role="status" className={WARNING_STRIP_CLASS}>
                    <p className="flex-1 text-sm text-ink">
                      <span aria-hidden>
                        <strong className="font-bold font-mono tabular-nums">
                          {formatDuration(timeSecondsLeft)}
                        </strong>{' '}
                        {budgetLimited
                          ? "left of this week's practice time."
                          : 'left in this session.'}
                      </span>
                      <span className="sr-only">
                        Less than {Math.ceil(Math.min(SESSION_TIME_WARNING_SECONDS, maxSeconds) / 60)}{' '}
                        minutes left{' '}
                        {budgetLimited ? "of this week's practice time." : 'in this session.'}
                      </span>
                    </p>
                  </div>
                )}
              </div>
            )}
            <div className="bg-surface border border-rule rounded-ui shadow-float flex items-center gap-3 p-2 pr-3 max-w-3xl mx-auto">
              <div className="relative w-12 h-12 rounded-full bg-brand text-accent flex items-center justify-center shrink-0">
                {state === 'connected' && (
                  <span className="absolute inset-0 rounded-full bg-brand animate-ping-slow" />
                )}
                <MicIcon className="relative w-5 h-5" />
              </div>
              <AudioVisualizer
                active={state === 'connected'}
                userAnalyser={userAnalyser}
                aiAnalyser={aiAnalyser}
              />
              <span className="font-mono text-sm tabular-nums text-ink-soft shrink-0 w-12 text-right">
                {formatDuration(elapsed)}
              </span>
              <button
                onClick={handleStop}
                disabled={ending}
                className="disabled:opacity-60 disabled:cursor-wait inline-flex items-center gap-1.5 bg-ink text-white rounded-ui px-4 py-2.5 font-semibold hover:bg-bad transition-colors text-sm shrink-0"
              >
                <StopIcon className="w-3 h-3" />
                End
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

interface IdleHeroProps {
  scenario: Scenario;
  languageNative: string;
  languageName: string;
  difficulty: Difficulty;
  selectedModel: string;
  onModelChange: (id: string) => void;
  transcribe: boolean;
  onTranscribeChange: (v: boolean) => void;
  avatarOn: boolean;
  onAvatarOnChange: (v: boolean) => void;
  avatarVendor: AvatarVendor;
  onAvatarVendorChange: (v: AvatarVendor) => void;
  faceId: string;
  onFaceIdChange: (id: string) => void;
  onStart: () => void;
  state: LiveClientState;
  /** Shown above the start button when weekly time is low or gone. */
  weeklyNote: { tone: 'warn' | 'bad'; text: string } | null;
}

function ToggleSwitch({
  on,
  onChange,
  disabled,
  ariaLabel,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  ariaLabel: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={ariaLabel}
      onClick={() => onChange(!on)}
      disabled={disabled}
      className={`relative w-11 h-6 rounded-full border transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0 ${
        on ? 'bg-brand border-brand' : 'bg-surface-2 border-control-border'
      }`}
    >
      <span
        className={`absolute top-[3px] w-4 h-4 rounded-full transition-[left,background-color] duration-200 ${
          on ? 'left-[23px] bg-accent' : 'left-[3px] bg-mute'
        }`}
      />
    </button>
  );
}

function SettingLabel({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="flex flex-col items-start text-left min-w-0">
      <span className="text-sm text-ink font-semibold">{title}</span>
      <span className="text-xs text-mute">{hint}</span>
    </div>
  );
}

function IdleHero({
  scenario,
  languageNative,
  languageName,
  difficulty,
  selectedModel,
  onModelChange,
  transcribe,
  onTranscribeChange,
  avatarOn,
  onAvatarOnChange,
  avatarVendor,
  onAvatarVendorChange,
  faceId,
  onFaceIdChange,
  onStart,
  state,
  weeklyNote,
}: IdleHeroProps) {
  const isConnecting = state === 'connecting';
  const vendorInfo = AVATAR_VENDORS.find((v) => v.id === avatarVendor);
  const isOpenAiModel = getLiveModel(selectedModel)?.provider === 'openai';
  return (
    <div className="flex flex-col items-center text-center pt-4 pb-12">
      <h2
        className="font-extrabold text-ink leading-[1.02] tracking-[-0.04em] mb-3"
        style={{ fontSize: 'clamp(2rem, 4.5vw, 3.25rem)' }}
      >
        Speak <span className="text-brand">{languageNative}</span>
      </h2>
      <p className="text-base md:text-lg text-ink-soft mb-10 max-w-lg">
        {scenario.description} Partner speaks only in {languageName} at{' '}
        <span className="text-ink font-semibold">{difficulty} pace</span>.
      </p>

      {weeklyNote && (
        <p
          role="status"
          className={`-mt-4 mb-8 text-sm font-semibold ${
            weeklyNote.tone === 'bad' ? 'text-bad' : 'text-warn'
          }`}
        >
          {weeklyNote.text}
        </p>
      )}

      <button
        onClick={onStart}
        disabled={isConnecting}
        aria-label={isConnecting ? 'Connecting' : `Start speaking ${languageName}`}
        className="relative w-32 h-32 rounded-full bg-brand text-accent flex items-center justify-center shadow-[0_0_0_8px_rgba(252,199,74,0.35),0_20px_44px_-14px_rgba(55,48,163,0.55)] transition-all hover:bg-brand-deep hover:scale-[1.04] active:scale-[0.98] disabled:opacity-60 disabled:cursor-wait"
      >
        {!isConnecting && (
          <span aria-hidden className="absolute inset-0 rounded-full pulse-ring" />
        )}
        <MicIcon className="relative w-10 h-10" />
      </button>
      <p className="mt-5 font-mono text-[12px] uppercase tracking-[0.16em] text-mute">
        {isConnecting ? 'Connecting…' : 'Tap to start'}
      </p>

      <div className="mt-8 w-full max-w-sm bg-surface border border-rule rounded-ui divide-y divide-rule-soft text-left">
        <div className="px-4 py-3">
          <div className="flex items-center justify-between gap-4">
            <SettingLabel title="Voice model" hint="Which AI voice you'll hear" />
            <select
              value={selectedModel}
              onChange={(e) => onModelChange(e.target.value)}
              disabled={isConnecting}
              aria-label="Voice model"
              className={SELECT_CLASS}
            >
              {LIVE_MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
          {isOpenAiModel && (
            <p className="mt-2 text-xs text-mute text-right">
              GPT-Live · backend {DEFAULT_OPENAI_BACKEND_MODEL}
            </p>
          )}
        </div>

        <div className="flex items-center justify-between gap-4 px-4 py-3">
          <SettingLabel
            title="Save transcript"
            hint={
              transcribe
                ? 'This session will be added to your history'
                : 'This session will not be saved'
            }
          />
          <ToggleSwitch
            on={transcribe}
            onChange={onTranscribeChange}
            disabled={isConnecting}
            ariaLabel="Save transcript to history"
          />
        </div>

        <div className="px-4 py-3">
          <div className="flex items-center justify-between gap-4">
            <SettingLabel
              title="Video partner"
              hint={avatarOn ? 'See a lip-synced face as you talk' : 'Audio only'}
            />
            <ToggleSwitch
              on={avatarOn}
              onChange={onAvatarOnChange}
              disabled={isConnecting}
              ariaLabel="Show a video partner"
            />
          </div>
          {/* The provider and face pickers get their own full-width row: inline
              beside the label they squeezed it into a one-word column. */}
          {avatarOn && (
            <div className="mt-3 grid grid-cols-2 gap-2">
              <select
                value={avatarVendor}
                onChange={(e) => onAvatarVendorChange(e.target.value as AvatarVendor)}
                disabled={isConnecting}
                aria-label="Video partner provider"
                className={`${SELECT_CLASS} w-full min-w-0`}
              >
                {AVATAR_VENDORS.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.label}
                  </option>
                ))}
              </select>
              <select
                value={faceId}
                onChange={(e) => onFaceIdChange(e.target.value)}
                disabled={isConnecting}
                aria-label="Video partner face"
                className={`${SELECT_CLASS} w-full min-w-0`}
              >
                {AVATAR_FACES[avatarVendor].map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.label}
                  </option>
                ))}
              </select>
            </div>
          )}
          {avatarOn && vendorInfo && (
            <p className="mt-2 text-xs text-mute">{vendorInfo.note}</p>
          )}
        </div>
      </div>

      <p className="mt-6 text-xs text-mute max-w-sm">
        Your mic will activate when you tap. Audio is streamed to{' '}
        {isOpenAiModel ? 'OpenAI' : 'Google Gemini'} and never used for training. With the video
        partner on, the AI&apos;s voice audio is also streamed to the selected avatar provider to
        animate the face.
      </p>
    </div>
  );
}
