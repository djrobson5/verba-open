# Session save resilience

Plan for making transcript save **and** daily usage roll-up survive tab close, refresh, navigation, and mid-session crashes / network drops. Today both only fire from the explicit **End** button in `src/app/(app)/session/[scenarioId]/page.tsx` (`handleStop`), so any other exit silently loses the conversation and undercounts cost.

## Goals

1. Transcript appears in `/history` even if the user closes the tab, refreshes, or loses network mid-call.
2. Daily usage roll-up at `/admin/usage` reflects token spend for sessions that didn't end cleanly.
3. No new double-counting risk for the daily counter (which uses `FieldValue.increment`).
4. No regression for the happy path (clean End click).

## Non-goals

- Offline-first / queued-when-online. If the user is fully offline at the moment of unload, we accept losing whatever happened since the last in-session checkpoint.
- Resuming a session after reload. We're saving what happened, not letting the user continue.
- Splitting dev/prod Firebase. Out of scope; same project for now.

## Design — three layers

### Layer 1 — Move transcript save to a server route

Today `useTranscript.saveTranscript` calls `addDoc` directly from the client. That can't survive `pagehide`, because `sendBeacon` only sends to a URL — it doesn't know how to talk to Firestore. So:

- New route: `POST /api/session-transcript` (Node runtime, mirrors `/api/session-usage`'s auth pattern using `next-firebase-auth-edge`'s `getTokens`).
- Body: `{ sessionId, scenarioId, scenarioTitle, languageCode, languageName, difficulty, model, messages[], tokens?, status: 'in-progress' | 'completed' }`.
- Server uses Firebase Admin to `users/{uid}/conversations/{sessionId}`.set(payload, { merge: true })`. `sessionId` is the doc id, so repeat calls are an idempotent upsert.
- Tighten `firestore.rules` for `users/{uid}/conversations/{conversationId}`: `allow read: ...; allow write: if false;` once writes go through Admin. (Consequence: existing client-side `addDoc` paths must all migrate first — there's only one.)

### Layer 2 — `pagehide` + `visibilitychange` + `sendBeacon`

Hook into the browser unload-ish events from `useLiveSession` (or a small companion hook used only on the session page):

- Register on mount-of-active-session: `pagehide` (covers tab close, navigation, refresh in most browsers) and `visibilitychange → hidden` (covers iOS Safari which often skips pagehide on background).
- Handler:
  1. Stop recorder/client/player (same teardown as `stop()`).
  2. `navigator.sendBeacon('/api/session-transcript', blob)` with current transcript + `usageRef.current` + `status: 'completed'`.
  3. `navigator.sendBeacon('/api/session-usage', blob)` with the latest `usageRef.current` snapshot (see Layer 3 for delta vs cumulative).
- Use `Blob([json], { type: 'application/json' })` so the API routes can `req.json()` unchanged.
- Don't fire if the session never connected (no usage, no transcript).
- If the explicit End handler already ran, don't double-fire — gate on a `hasFinalizedRef`.

### Layer 3 — Periodic in-session checkpoint

`pagehide` doesn't fire on a hard crash, OS kill, or sudden power loss. Add a simple timer while `state === 'connected'`:

- Every ~20s **and** every N completed turns (whichever first), POST a checkpoint with `status: 'in-progress'`.
- Same two endpoints as Layer 2.
- The transcript route just upserts; cheap.
- The usage route needs delta semantics (next section).

This caps worst-case loss at one checkpoint interval.

## Usage idempotency — the load-bearing detail

`/api/session-usage` currently calls `recordSessionUsage()` which does `FieldValue.increment(...)` on the daily doc. If we POST cumulative totals on every checkpoint, the daily counter explodes.

Two options:

- **(A) Server-side delta tracking.** New collection `users/{uid}/sessions/{sessionId}` holds the *last seen cumulative totals* for that session. On each POST, server computes `delta = incoming - stored`, applies `FieldValue.increment(delta)` to the daily doc, and overwrites the per-session doc with the new cumulative. Idempotent, robust to retries, doesn't trust the client to remember what it sent.
- **(B) Client-side delta tracking.** Client keeps a "last sent" snapshot, sends only the delta. Simpler server, but a tab close between "compute delta" and "send" loses that delta forever; a duplicate beacon double-counts.

Pick **(A)**. The per-session doc is cheap (one Firestore write/read per checkpoint) and gives us a real "session log" for free, useful later for debugging "where did this user's tokens actually go." It also means crash → reload → fresh `sessionId` doesn't re-bill earlier work.

## Concrete file changes

| File | Change |
|---|---|
| `src/app/api/session-transcript/route.ts` | **new** — server-side transcript upsert via Admin |
| `src/app/api/session-usage/route.ts` | accept `sessionId`; switch to delta-via-stored-cumulative approach |
| `src/lib/usage.ts` | add `recordSessionUsageDelta(uid, sessionId, totals)` that does the read/diff/increment dance in a transaction |
| `src/hooks/useLiveSession.ts` | generate `sessionId` (crypto.randomUUID) at `start()`; expose it; add periodic checkpoint timer; expose a `finalize({ status })` that posts both endpoints |
| `src/hooks/useTranscript.ts` | replace direct `addDoc` with `fetch('/api/session-transcript', …)` |
| `src/app/(app)/session/[scenarioId]/page.tsx` | wire up `pagehide` / `visibilitychange` listeners; call `finalize({ status: 'completed' })` on End and on hide; gate on `hasFinalizedRef` |
| `firestore.rules` | tighten `conversations/{id}` to server-only writes once migration is complete |
| `src/app/(app)/history/page.tsx` | (verify) no client-side writes; reads only — should already be fine |

## Open questions for later

1. **Checkpoint cadence.** 20s feels right for a few-minute call; could go to 30s if write volume bothers us. Daily cap is 5 sessions × ~5 min ÷ 20s ≈ 75 writes/user/day max — well within Spark.
2. **In-progress conversations in `/history`.** Show them, hide them, or show with an "interrupted" badge? Recommend show + badge so the student isn't confused when their crashed session shows up.
3. **`sendBeacon` size limit** is ~64 KB in most browsers. A long transcript could approach this. If we hit it, fall back to `fetch(..., { keepalive: true })` which has a higher cap and similar unload semantics.
4. **`firestore.rules` migration order.** Tightening write rules before the new server route ships will break the app. Land the route + client switch first, then the rules change in a follow-up commit.

## Test plan

- Click End normally → transcript and usage appear (regression check).
- Start a session, speak a few turns, close the tab → transcript present, usage incremented (manual).
- Start a session, speak, refresh mid-call → transcript present with `in-progress` until next checkpoint or End.
- Start a session, kill the browser via Task Manager → transcript reflects last checkpoint.
- Start two sessions back-to-back, close-and-end variants → daily counter increments by exactly the sum, no double-counting (the load-bearing scenario for the delta logic).
- Offline at moment of close → expect data loss only since last successful checkpoint; verify nothing crashes or re-fires repeatedly.
