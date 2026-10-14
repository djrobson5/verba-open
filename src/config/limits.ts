export const DAILY_REAL_SESSION_LIMIT = 10;
export const DAILY_TOKEN_ISSUANCE_LIMIT = 30;

// Per-session limits, enforced client-side in useSessionLimits. The daily caps
// above bound how many sessions a student starts, not how long each one runs.
// GPT-Live bills wall-clock connected time ($0.05/min), so without these a
// forgotten tab keeps costing money until someone closes it.

/** Hard ceiling on connected time for one session. */
export const SESSION_MAX_SECONDS = 20 * 60;
/** How long before the hard ceiling the "minutes left" warning appears. */
export const SESSION_TIME_WARNING_SECONDS = 2 * 60;
/** End the session after this long with no detected speech from the student. */
export const SESSION_IDLE_TIMEOUT_SECONDS = 3 * 60;
/** How long before the idle timeout the "still there?" warning appears. */
export const SESSION_IDLE_WARNING_SECONDS = 30;

// Weekly practice budget, enforced server-side in reserveTokenIssuance
// (src/lib/usage.ts). The daily caps above bound how many sessions start and
// the per-session limits bound one session, but neither bounds total
// connected time: 10 sessions x 20 minutes is 200 minutes a day. GPT-Live
// bills $0.05 per connected minute, so this caps each student at a known
// weekly cost (30 min x $0.05 = $1.50 a week on GPT-Live). Admins and
// accounts with the `unlimited` custom claim skip it.

/** Connected practice time per student per week (Monday 00:00 Pacific). */
export const WEEKLY_PRACTICE_SECONDS = 30 * 60;
/** A start is refused when less than this is left: a shorter session isn't
 *  worth a connect (and GPT-Live bills 15 s just to initialize one). */
export const WEEKLY_MIN_START_SECONDS = 60;
/** A reservation the client never confirmed (the 10-second /api/session-active
 *  ping) is treated as a failed connect and released after this long. */
export const RESERVATION_CONFIRM_WINDOW_SECONDS = 2 * 60;
/** Below this much weekly time left, the session page warns before starting. */
export const WEEKLY_LOW_WARNING_SECONDS = 5 * 60;
