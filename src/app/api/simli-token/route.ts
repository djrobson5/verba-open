import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getTokens } from 'next-firebase-auth-edge/next/tokens';
import { authConfig } from '@/lib/firebase/auth-config';
import { AVATAR_FACES, DEFAULT_FACE } from '@/config/avatars';

export const runtime = 'nodejs';

const SIMLI_TOKEN_URL = 'https://api.simli.ai/compose/token';
const REQUEST_TIMEOUT_MS = 10_000;

export async function POST(request: Request) {
  try {
    const apiKey = process.env.SIMLI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'Avatar not configured' }, { status: 500 });
    }

    const tokens = await getTokens(await cookies(), authConfig());
    if (!tokens) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // No daily-cap check here: /api/gemini-token already gates the session, and
    // an avatar token is worthless without a Live session to drive it.

    const body = await request.json().catch(() => ({}));
    const requested: string = typeof body.faceId === 'string' ? body.faceId : '';
    const envOverride = process.env.SIMLI_DEFAULT_FACE_ID;
    const faceId = requested || envOverride || DEFAULT_FACE.simli;

    const isKnown =
      AVATAR_FACES.simli.some((f) => f.id === faceId) || (!!envOverride && faceId === envOverride);
    if (!isKnown) {
      return NextResponse.json({ error: 'Unknown face' }, { status: 400 });
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(SIMLI_TOKEN_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-simli-api-key': apiKey,
        },
        body: JSON.stringify({
          faceId,
          apiVersion: 'v2',
          handleSilence: true,
          maxSessionLength: 3600,
          maxIdleTime: 300,
          audioInputFormat: 'pcm16',
        }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      console.error('Simli token request failed:', res.status);
      return NextResponse.json({ error: 'Avatar service unavailable' }, { status: 502 });
    }

    const data = await res.json();
    const sessionToken = data?.session_token;
    if (typeof sessionToken !== 'string' || !sessionToken) {
      console.error('Simli token response missing session_token');
      return NextResponse.json({ error: 'Avatar service unavailable' }, { status: 502 });
    }

    return NextResponse.json({ sessionToken, faceId });
  } catch (error) {
    console.error('Simli token generation error:', error);
    return NextResponse.json({ error: 'Avatar service unavailable' }, { status: 502 });
  }
}
