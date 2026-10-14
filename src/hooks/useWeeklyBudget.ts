'use client';

import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase/client';
import { useAuthContext } from '@/providers/AuthProvider';
import {
  weekStartKey,
  weeklyRemainingSeconds,
  type WeekDoc,
} from '@/lib/weekly-budget';

export type WeeklyBudget =
  | { status: 'loading' }
  /** Admin or `unlimited` claim: no weekly budget and no daily caps. */
  | { status: 'exempt' }
  | { status: 'ready'; remainingSeconds: number };

// Open reservations turn into "released" two minutes after they're made
// without anyone writing the doc, so the client re-evaluates on a clock too.
const TICK_MS = 30_000;

/**
 * Live view of the signed-in student's weekly practice budget. Reads
 * users/{uid}/weeks/{weekStartKey} (owner read) and applies the same lazy
 * rules as the server via the shared helper in src/lib/weekly-budget.ts.
 * Advisory only: the server decides at start.
 */
export function useWeeklyBudget(): WeeklyBudget {
  const { user, loading } = useAuthContext();
  const [exempt, setExempt] = useState<boolean | null>(null);
  const [week, setWeek] = useState<{ key: string; data: WeekDoc | null } | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (loading || !user) return;
    let cancelled = false;
    user
      .getIdTokenResult()
      .then((res) => {
        if (!cancelled) setExempt(res.claims.admin === true || res.claims.unlimited === true);
      })
      .catch(() => {
        if (!cancelled) setExempt(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user, loading]);

  // Recomputed from the clock, so the subscription moves to the new doc when
  // Monday arrives while the page is open.
  const weekKey = weekStartKey(now);

  useEffect(() => {
    if (loading || !user) return;
    const ref = doc(db, 'users', user.uid, 'weeks', weekKey);
    return onSnapshot(
      ref,
      (snap) => setWeek({ key: weekKey, data: (snap.data() as WeekDoc | undefined) ?? null }),
      // Same fallback as the daily counter: a failed read shows a full week
      // rather than nothing. The server still enforces the real number.
      () => setWeek({ key: weekKey, data: null }),
    );
  }, [user, loading, weekKey]);

  if (exempt === true) return { status: 'exempt' };
  if (exempt === null || !week || week.key !== weekKey) return { status: 'loading' };
  return { status: 'ready', remainingSeconds: weeklyRemainingSeconds(week.data, now) };
}
