'use client';

import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase/client';
import { useAuthContext } from '@/providers/AuthProvider';
import {
  DAILY_REAL_SESSION_LIMIT,
  WEEKLY_LOW_WARNING_SECONDS,
  WEEKLY_MIN_START_SECONDS,
  WEEKLY_PRACTICE_SECONDS,
} from '@/config/limits';
import { useWeeklyBudget } from '@/hooks/useWeeklyBudget';

function todayKey(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

/**
 * Dashboard meter. Primary line: weekly practice minutes left (the budget
 * that actually runs out). Secondary line: today's sessions left.
 */
export function SessionsRemaining() {
  const { user, loading } = useAuthContext();
  const budget = useWeeklyBudget();
  const [usedToday, setUsedToday] = useState<number | null>(null);

  useEffect(() => {
    if (loading || !user) return;
    const ref = doc(db, 'users', user.uid, 'usage', todayKey());
    return onSnapshot(
      ref,
      (snap) => setUsedToday((snap.data()?.realSessions as number | undefined) ?? 0),
      () => setUsedToday(0),
    );
  }, [user, loading]);

  if (budget.status === 'exempt') {
    return <p className="mt-4 text-sm text-ink-soft">No practice limit.</p>;
  }
  if (budget.status === 'loading' || usedToday === null) return null;

  const totalMinutes = WEEKLY_PRACTICE_SECONDS / 60;
  // Floor, so the meter never promises a minute the server won't start:
  // under WEEKLY_MIN_START_SECONDS left reads as 0.
  const minutesLeft =
    budget.remainingSeconds < WEEKLY_MIN_START_SECONDS
      ? 0
      : Math.floor(budget.remainingSeconds / 60);
  const weekOut = minutesLeft === 0;
  const weekLow = !weekOut && budget.remainingSeconds < WEEKLY_LOW_WARNING_SECONDS;

  // Remaining minutes are the brand color; used ones drop to the rule color. Low time
  // switches the meter and copy to warn, and none left to bad.
  const fill = weekOut ? 'bg-bad' : weekLow ? 'bg-warn' : 'bg-brand';

  const weekText = weekOut ? (
    <span className="text-bad font-semibold">
      You&apos;ve used this week&apos;s {totalMinutes} minutes of practice. Your time resets
      Monday.
    </span>
  ) : (
    <span className={weekLow ? 'text-warn font-semibold' : 'text-ink-soft'}>
      <strong
        className={`font-mono tabular-nums font-semibold ${weekLow ? '' : 'text-ink'}`}
      >
        {minutesLeft} of {totalMinutes}
      </strong>{' '}
      practice minutes left this week
    </span>
  );

  const dailyLimit = DAILY_REAL_SESSION_LIMIT;
  const sessionsLeft = Math.max(0, dailyLimit - usedToday);
  const dailyText =
    sessionsLeft === 0 ? (
      <span className="text-bad font-semibold">
        You&apos;ve used today&apos;s {dailyLimit} sessions. Come back tomorrow.
      </span>
    ) : (
      <span>
        <span className="font-mono tabular-nums">
          {sessionsLeft} of {dailyLimit}
        </span>{' '}
        sessions left today
      </span>
    );

  return (
    <div className="mt-5 text-[15px]">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="flex gap-[2px]" aria-hidden>
          {Array.from({ length: totalMinutes }, (_, i) => (
            <span
              key={i}
              className={`w-[7px] h-[14px] rounded-[1px] ${
                i < minutesLeft ? fill : weekOut ? 'bg-bad/25' : 'bg-rule'
              }`}
            />
          ))}
        </div>
        <p>{weekText}</p>
      </div>
      {!weekOut && <p className="mt-1.5 text-sm text-mute">{dailyText}</p>}
    </div>
  );
}
