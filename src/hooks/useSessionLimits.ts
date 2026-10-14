'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  SESSION_IDLE_TIMEOUT_SECONDS,
  SESSION_IDLE_WARNING_SECONDS,
  SESSION_MAX_SECONDS,
  SESSION_TIME_WARNING_SECONDS,
} from '@/config/limits';

export type SessionLimitReason = 'time' | 'idle';

interface UseSessionLimitsOptions {
  /** True only while the session is connected and not already being ended.
   *  Every clock resets when this flips back to true. */
  active: boolean;
  /** Connected seconds, ticking only while connected (the page's timer). */
  elapsedSeconds: number;
  /** Hard cap for this session: min(SESSION_MAX_SECONDS, the weekly budget
   *  reserved for it). Defaults to SESSION_MAX_SECONDS. */
  maxSeconds?: number;
  /** Student mic analyser from useLiveSession. Primary speech signal. */
  userAnalyser: AnalyserNode | null;
  /** Secondary speech signal: user transcript text growing. Empty when
   *  transcription is off, which is why the analyser comes first. */
  transcript: ReadonlyArray<{ role: 'user' | 'ai'; text: string }>;
  /** Called at most once per activation. */
  onLimitReached: (reason: SessionLimitReason) => void;
}

const SAMPLE_INTERVAL_MS = 250;
// RMS of the analyser's float time-domain window (range -1..1). The mic runs
// with noiseSuppression + autoGainControl on both providers, so room noise
// sits well under this and normal speech well over it.
const SPEECH_RMS_THRESHOLD = 0.02;
// Two consecutive hot samples (~500 ms) so a single click or bump doesn't
// count as the student speaking.
const SPEECH_MIN_CONSECUTIVE = 2;

/**
 * Client-side per-session limits: a hard cap on connected time and an idle
 * timeout when the student stops speaking. Pure timing and detection — the
 * caller decides how to end the session (it must go through the page's
 * handleStop so usage and the transcript are saved).
 */
export function useSessionLimits({
  active,
  elapsedSeconds,
  maxSeconds = SESSION_MAX_SECONDS,
  userAnalyser,
  transcript,
  onLimitReached,
}: UseSessionLimitsOptions) {
  const [idleSecondsLeft, setIdleSecondsLeft] = useState<number | null>(null);

  const lastActivityRef = useRef(0);
  const firedRef = useRef(false);
  const onLimitRef = useRef(onLimitReached);
  const analyserRef = useRef(userAnalyser);
  const userCharsRef = useRef(0);

  useEffect(() => {
    onLimitRef.current = onLimitReached;
  });

  // Kept in a ref so the sampling interval below doesn't restart (and reset
  // the idle clock) when the analyser arrives a moment after `connected`.
  useEffect(() => {
    analyserRef.current = userAnalyser;
  }, [userAnalyser]);

  const fire = useCallback((reason: SessionLimitReason) => {
    if (firedRef.current) return;
    firedRef.current = true;
    setIdleSecondsLeft(null);
    onLimitRef.current(reason);
  }, []);

  // Idle clock: starts when the session becomes active, sampled every 250 ms.
  useEffect(() => {
    if (!active) return;
    firedRef.current = false;
    lastActivityRef.current = Date.now();
    let buf = new Float32Array(0);
    let streak = 0;

    const id = setInterval(() => {
      if (firedRef.current) return;
      const analyser = analyserRef.current;
      if (analyser) {
        if (buf.length !== analyser.fftSize) buf = new Float32Array(analyser.fftSize);
        analyser.getFloatTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
        const rms = Math.sqrt(sum / buf.length);
        streak = rms > SPEECH_RMS_THRESHOLD ? streak + 1 : 0;
        if (streak >= SPEECH_MIN_CONSECUTIVE) lastActivityRef.current = Date.now();
      }

      const remainingMs =
        SESSION_IDLE_TIMEOUT_SECONDS * 1000 - (Date.now() - lastActivityRef.current);
      if (remainingMs <= 0) {
        fire('idle');
        return;
      }
      setIdleSecondsLeft(
        remainingMs <= SESSION_IDLE_WARNING_SECONDS * 1000 ? Math.ceil(remainingMs / 1000) : null,
      );
    }, SAMPLE_INTERVAL_MS);

    return () => {
      clearInterval(id);
      setIdleSecondsLeft(null);
    };
  }, [active, fire]);

  // A new or growing user transcript entry also counts as speech. Only the
  // ref is touched; the next sample tick clears any visible warning.
  useEffect(() => {
    let chars = 0;
    for (const entry of transcript) if (entry.role === 'user') chars += entry.text.length;
    if (active && chars > userCharsRef.current) lastActivityRef.current = Date.now();
    userCharsRef.current = chars;
  }, [transcript, active]);

  // Hard limit, driven by the page's connected-time counter.
  useEffect(() => {
    if (active && elapsedSeconds >= maxSeconds) fire('time');
  }, [active, elapsedSeconds, maxSeconds, fire]);

  const keepAlive = useCallback(() => {
    lastActivityRef.current = Date.now();
    setIdleSecondsLeft(null);
  }, []);

  const timeLeft = maxSeconds - elapsedSeconds;
  return {
    /** Seconds until the idle timeout, or null when no warning is due. */
    idleSecondsLeft: active ? idleSecondsLeft : null,
    /** Seconds until the hard limit, or null when no warning is due. */
    timeSecondsLeft:
      active && timeLeft <= SESSION_TIME_WARNING_SECONDS ? Math.max(0, timeLeft) : null,
    keepAlive,
  };
}
