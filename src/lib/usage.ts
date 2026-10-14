import { randomBytes } from 'node:crypto';
import { getAdminFirestore } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import {
  DAILY_REAL_SESSION_LIMIT,
  DAILY_TOKEN_ISSUANCE_LIMIT,
  SESSION_MAX_SECONDS,
  WEEKLY_MIN_START_SECONDS,
} from '@/config/limits';
import { estimateCostBreakdown, type SessionTokenTotals } from '@/config/pricing';
import {
  makeReservationId,
  parseReservationId,
  weekStartKey,
  weeklyRemainingSeconds,
  type WeekDoc,
  type WeekReservation,
} from '@/lib/weekly-budget';

export { DAILY_REAL_SESSION_LIMIT, DAILY_TOKEN_ISSUANCE_LIMIT };

export type DenyReason = 'weekly-limit' | 'daily-limit' | 'rate-limit';

export type IssuanceResult =
  | { allowed: true; reservationId: string; reservedSeconds: number }
  | { allowed: false; reason: DenyReason };

/** 4 hours. The seconds figure comes from the browser, so it gets a cap. */
const MAX_LIVE_SECONDS = 4 * 60 * 60;

/**
 * Admins and accounts with the `unlimited` custom claim skip the daily caps
 * and the weekly practice budget. Takes the decoded ID token.
 */
export function isLimitExempt(decodedToken: Record<string, unknown>): boolean {
  return decodedToken.admin === true || decodedToken.unlimited === true;
}

function todayKey(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function usageDocRef(uid: string) {
  return getAdminFirestore()
    .collection('users')
    .doc(uid)
    .collection('usage')
    .doc(todayKey());
}

function weekDocRef(uid: string, weekKey: string) {
  return getAdminFirestore()
    .collection('users')
    .doc(uid)
    .collection('weeks')
    .doc(weekKey);
}

/**
 * Gate for every session start (/api/gemini-token, /api/openai-live-session).
 * One transaction reads today's usage doc and this week's budget doc, then
 * either refuses or counts a token issuance and reserves
 * min(SESSION_MAX_SECONDS, remaining) seconds of the weekly budget. The
 * weekly check runs first: when the week is spent, "come back tomorrow"
 * would be wrong.
 */
export async function reserveTokenIssuance(uid: string): Promise<IssuanceResult> {
  const nowMs = Date.now();
  const weekKey = weekStartKey(nowMs);
  const dayRef = usageDocRef(uid);
  const weekRef = weekDocRef(uid, weekKey);
  return getAdminFirestore().runTransaction(async (tx) => {
    const [daySnap, weekSnap] = await tx.getAll(dayRef, weekRef);
    const day = daySnap.data() ?? {};
    const realSessions = (day.realSessions as number | undefined) ?? 0;
    const tokenIssuances = (day.tokenIssuances as number | undefined) ?? 0;

    const remaining = weeklyRemainingSeconds(weekSnap.data() as WeekDoc | undefined, nowMs);
    if (remaining < WEEKLY_MIN_START_SECONDS) {
      return { allowed: false as const, reason: 'weekly-limit' as const };
    }
    if (realSessions >= DAILY_REAL_SESSION_LIMIT) {
      return { allowed: false as const, reason: 'daily-limit' as const };
    }
    if (tokenIssuances >= DAILY_TOKEN_ISSUANCE_LIMIT) {
      return { allowed: false as const, reason: 'rate-limit' as const };
    }

    const reservedSeconds = Math.min(SESSION_MAX_SECONDS, Math.floor(remaining));
    const rid = randomBytes(12).toString('hex');
    const reservation: WeekReservation = {
      seconds: reservedSeconds,
      createdAtMs: nowMs,
      confirmed: false,
      settled: false,
      chargedSeconds: 0,
    };

    tx.set(
      dayRef,
      {
        tokenIssuances: FieldValue.increment(1),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    tx.set(
      weekRef,
      {
        weekStart: weekKey,
        usedSeconds: FieldValue.increment(0),
        reservations: { [rid]: reservation },
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    return {
      allowed: true as const,
      reservationId: makeReservationId(weekKey, rid),
      reservedSeconds,
    };
  });
}

/**
 * Marks a reservation as a real session (the 10-second ping). From then on an
 * unsettled reservation is charged in full instead of being released. No-op
 * for an unknown, already-confirmed or already-settled reservation.
 */
export async function confirmReservation(uid: string, reservationId: unknown): Promise<void> {
  const parsed = parseReservationId(reservationId);
  if (!parsed) return;
  const ref = weekDocRef(uid, parsed.weekKey);
  await getAdminFirestore().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const r = (snap.data() as WeekDoc | undefined)?.reservations?.[parsed.rid];
    if (!r || r.settled === true || r.confirmed === true) return;
    tx.set(
      ref,
      {
        reservations: { [parsed.rid]: { confirmed: true } },
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  });
}

/**
 * Settles a reservation with the client-measured connected seconds: charges
 * min(reported, reserved) and releases the rest. Settling twice does nothing
 * (the second call returns null). Reporting 0 is a release, which the routes
 * use when a connect fails after the reservation was made. Returns the
 * seconds charged, or null when nothing changed.
 */
export async function settleReservation(
  uid: string,
  reservationId: unknown,
  reportedSeconds: number,
): Promise<number | null> {
  const parsed = parseReservationId(reservationId);
  if (!parsed) return null;
  const ref = weekDocRef(uid, parsed.weekKey);
  return getAdminFirestore().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const r = (snap.data() as WeekDoc | undefined)?.reservations?.[parsed.rid];
    if (!r || r.settled === true) return null;
    const reserved = typeof r.seconds === 'number' && r.seconds > 0 ? Math.floor(r.seconds) : 0;
    const reported =
      Number.isFinite(reportedSeconds) && reportedSeconds > 0 ? Math.floor(reportedSeconds) : 0;
    const charged = Math.min(reported, reserved);
    tx.set(
      ref,
      {
        usedSeconds: FieldValue.increment(charged),
        reservations: {
          [parsed.rid]: { settled: true, chargedSeconds: charged, settledAtMs: Date.now() },
        },
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    return charged;
  });
}

export async function recordRealSession(uid: string): Promise<void> {
  const ref = usageDocRef(uid);
  await getAdminFirestore().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.data() ?? {};
    const realSessions = (data.realSessions as number | undefined) ?? 0;
    if (realSessions >= DAILY_REAL_SESSION_LIMIT) return;

    tx.set(
      ref,
      {
        realSessions: FieldValue.increment(1),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  });
}

export async function recordSessionUsage(
  uid: string,
  totals: SessionTokenTotals,
): Promise<number> {
  const ref = usageDocRef(uid);
  // OpenAI GPT-Live bills by wall-clock audio seconds, so that counter lives
  // alongside the Gemini token counters in the same daily doc.
  const liveSeconds = Math.min(
    Math.max(Math.floor(totals.liveSeconds ?? 0), 0),
    MAX_LIVE_SECONDS,
  );
  const capped: SessionTokenTotals = { ...totals, liveSeconds };
  const { geminiUsd, openaiLiveUsd, openaiBackendUsd, totalUsd } =
    estimateCostBreakdown(capped);
  const openaiUsd = openaiLiveUsd + openaiBackendUsd;
  const provider = totals.provider === 'openai' ? 'openai' : 'gemini';
  await ref.set(
    {
      inputAudioTokens: FieldValue.increment(totals.inputAudioTokens),
      outputAudioTokens: FieldValue.increment(totals.outputAudioTokens),
      inputTextTokens: FieldValue.increment(totals.inputTextTokens),
      outputTextTokens: FieldValue.increment(totals.outputTextTokens),
      liveSeconds: FieldValue.increment(liveSeconds),
      backendInputTokens: FieldValue.increment(totals.backendInputTokens ?? 0),
      backendCachedInputTokens: FieldValue.increment(totals.backendCachedInputTokens ?? 0),
      backendCacheWriteTokens: FieldValue.increment(totals.backendCacheWriteTokens ?? 0),
      backendOutputTokens: FieldValue.increment(totals.backendOutputTokens ?? 0),
      // Total across providers; older docs carry only this field, so readers
      // treat (total − gemini − openai) as unattributed.
      estimatedCostUsd: FieldValue.increment(totalUsd),
      geminiCostUsd: FieldValue.increment(geminiUsd),
      openaiCostUsd: FieldValue.increment(openaiUsd),
      // Subset of openaiCostUsd: the delegated Responses model's tokens.
      openaiBackendCostUsd: FieldValue.increment(openaiBackendUsd),
      // Sessions that POSTed usage, per provider (unlike realSessions, which
      // is the 10-second beacon that drives the daily cap).
      [provider === 'openai' ? 'openaiUsageSessions' : 'geminiUsageSessions']:
        FieldValue.increment(1),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
  return totalUsd;
}
