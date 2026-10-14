import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getTokens } from 'next-firebase-auth-edge/next/tokens';
import { confirmReservation, isLimitExempt, recordRealSession } from '@/lib/usage';
import { authConfig } from '@/lib/firebase/auth-config';

export const runtime = 'nodejs';

/**
 * The 10-second "real session" ping. Counts toward the daily realSessions cap
 * and confirms the session's weekly-budget reservation, after which an
 * unsettled reservation is charged in full rather than released.
 */
export async function POST(request: Request) {
  try {
    const tokens = await getTokens(await cookies(), authConfig());
    if (!tokens) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!isLimitExempt(tokens.decodedToken)) {
      const body = await request.json().catch(() => ({}));
      const uid = tokens.decodedToken.uid;
      await Promise.all([
        recordRealSession(uid),
        confirmReservation(uid, body?.reservationId),
      ]);
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('session-active error:', error);
    return NextResponse.json({ error: 'Failed to record session' }, { status: 500 });
  }
}
