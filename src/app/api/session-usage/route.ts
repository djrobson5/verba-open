import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getTokens } from 'next-firebase-auth-edge/next/tokens';
import { recordSessionUsage, settleReservation } from '@/lib/usage';
import { hasUsage, type SessionTokenTotals } from '@/config/pricing';
import { OPENAI_BACKEND_MODELS } from '@/config/models';
import { authConfig } from '@/lib/firebase/auth-config';

export const runtime = 'nodejs';

const MAX_TOKENS_PER_FIELD = 100_000_000; // sanity cap to reject malicious inputs
const MAX_LIVE_SECONDS = 4 * 60 * 60; // 4 hours

function sanitize(value: unknown, cap: number = MAX_TOKENS_PER_FIELD): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return 0;
  return Math.min(Math.floor(value), cap);
}

export async function POST(req: NextRequest) {
  try {
    const tokens = await getTokens(await cookies(), authConfig());
    if (!tokens) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const uid = tokens.decodedToken.uid;

    // Weekly budget: settle this session's reservation with the
    // client-measured connected time (charged = min(reported, reserved), the
    // rest released). Idempotent, and independent of the token fields below:
    // a settle-only POST (End before any usage, a failed connect, leaving the
    // page) carries just these two fields. Malformed ids are ignored.
    let chargedSeconds: number | null = null;
    if (body.reservationId !== undefined) {
      chargedSeconds = await settleReservation(
        uid,
        body.reservationId,
        sanitize(body.connectedSeconds, MAX_LIVE_SECONDS),
      );
    }

    const backendInputTokens = sanitize(body.backendInputTokens);
    const totals: SessionTokenTotals = {
      inputAudioTokens: sanitize(body.inputAudioTokens),
      outputAudioTokens: sanitize(body.outputAudioTokens),
      inputTextTokens: sanitize(body.inputTextTokens),
      outputTextTokens: sanitize(body.outputTextTokens),
      liveSeconds: sanitize(body.liveSeconds, MAX_LIVE_SECONDS),
      backendInputTokens,
      // Cached and cache-write tokens are subsets of the input count.
      backendCachedInputTokens: sanitize(body.backendCachedInputTokens, backendInputTokens),
      backendCacheWriteTokens: sanitize(body.backendCacheWriteTokens, backendInputTokens),
      backendOutputTokens: sanitize(body.backendOutputTokens),
      // Only a model the session route would accept can price backend tokens;
      // anything else is stored as counts with no cost.
      backendModel: (OPENAI_BACKEND_MODELS as readonly string[]).includes(body.backendModel)
        ? body.backendModel
        : undefined,
      provider: body.provider === 'openai' ? 'openai' : 'gemini',
    };

    if (!hasUsage(totals)) {
      return NextResponse.json({ ok: true, costUsd: 0, chargedSeconds });
    }

    const costUsd = await recordSessionUsage(uid, totals);
    return NextResponse.json({ ok: true, costUsd, chargedSeconds });
  } catch (error) {
    console.error('session-usage error:', error);
    return NextResponse.json({ error: 'Failed to record usage' }, { status: 500 });
  }
}
