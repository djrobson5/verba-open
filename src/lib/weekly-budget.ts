// Pure weekly-budget accounting, shared by the server (src/lib/usage.ts,
// inside Firestore transactions) and the client (useWeeklyBudget, which reads
// the same doc with an owner read). No Firebase imports, so both sides can use
// it and they always agree on what "remaining" means.
//
// Doc: users/{uid}/weeks/{weekStartKey}, where weekStartKey is the Monday of
// the Pacific-time week as YYYY-MM-DD.
//   usedSeconds   sum of chargedSeconds over settled reservations
//   reservations  { [rid]: WeekReservation }
// Bounded per week by the daily token-issuance cap (30/day x 7 = 210 entries,
// roughly 100 bytes each), well under Firestore's 1 MiB doc limit.

import {
  RESERVATION_CONFIRM_WINDOW_SECONDS,
  WEEKLY_PRACTICE_SECONDS,
} from '@/config/limits';

export interface WeekReservation {
  /** Seconds held for this session at start: min(SESSION_MAX_SECONDS, remaining). */
  seconds: number;
  /** Server clock, ms since epoch. */
  createdAtMs: number;
  /** Set by /api/session-active (10 s into a connected session). */
  confirmed: boolean;
  /** Set once by /api/session-usage; settling again is a no-op. */
  settled: boolean;
  /** min(reported connected seconds, seconds). Meaningful only when settled. */
  chargedSeconds: number;
  /** Server clock when settled, ms since epoch. Informational only. */
  settledAtMs?: number;
}

export interface WeekDoc {
  usedSeconds?: number;
  reservations?: Record<string, Partial<WeekReservation>>;
}

function num(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;
}

/**
 * What one reservation currently counts against the week:
 * - settled: what End reported, capped at the reservation;
 * - confirmed but never settled: the whole reservation (the tab closed, or
 *   the session is still running);
 * - unconfirmed and older than the confirm window: 0 (the connect failed);
 * - unconfirmed and younger: the whole reservation (still connecting).
 */
export function reservationCharge(r: Partial<WeekReservation>, nowMs: number): number {
  if (r.settled === true) return num(r.chargedSeconds);
  if (r.confirmed === true) return num(r.seconds);
  if (nowMs - num(r.createdAtMs) >= RESERVATION_CONFIRM_WINDOW_SECONDS * 1000) return 0;
  return num(r.seconds);
}

/** Seconds used or held this week. Settled charges live in usedSeconds; the
 *  open reservations are added by the lazy rules above. */
export function weeklyUsedSeconds(doc: WeekDoc | null | undefined, nowMs: number): number {
  if (!doc) return 0;
  let used = num(doc.usedSeconds);
  for (const r of Object.values(doc.reservations ?? {})) {
    if (r && r.settled !== true) used += reservationCharge(r, nowMs);
  }
  return used;
}

export function weeklyRemainingSeconds(doc: WeekDoc | null | undefined, nowMs: number): number {
  return Math.max(0, WEEKLY_PRACTICE_SECONDS - weeklyUsedSeconds(doc, nowMs));
}

const WEEKDAY_OFFSET: Record<string, number> = {
  Mon: 0,
  Tue: 1,
  Wed: 2,
  Thu: 3,
  Fri: 4,
  Sat: 5,
  Sun: 6,
};

/** The Monday that starts the Pacific-time week containing `nowMs`, as
 *  YYYY-MM-DD. Same time zone as the daily usage dateKey. */
export function weekStartKey(nowMs: number): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
  }).formatToParts(new Date(nowMs));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  const offset = WEEKDAY_OFFSET[get('weekday')] ?? 0;
  // Date arithmetic on the Pacific calendar date only, in UTC so no DST hour
  // can shift it across a day boundary.
  const monday = new Date(
    Date.UTC(Number(get('year')), Number(get('month')) - 1, Number(get('day')) - offset),
  );
  return monday.toISOString().slice(0, 10);
}

// The reservation id handed to the client carries its week, so a session that
// starts Sunday night and ends Monday settles in the week it was reserved in.
const RESERVATION_ID_RE = /^(\d{4}-\d{2}-\d{2})_([0-9a-f]{24})$/;

export function makeReservationId(weekKey: string, rid: string): string {
  return `${weekKey}_${rid}`;
}

export function parseReservationId(
  value: unknown,
): { weekKey: string; rid: string } | null {
  if (typeof value !== 'string') return null;
  const m = RESERVATION_ID_RE.exec(value);
  return m ? { weekKey: m[1], rid: m[2] } : null;
}
