import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getTokens } from 'next-firebase-auth-edge/next/tokens';
import { authConfig } from '@/lib/firebase/auth-config';
import { AVATAR_FACES, DEFAULT_FACE } from '@/config/avatars';

export const runtime = 'nodejs';

const LIVEAVATAR_TOKEN_URL = 'https://api.liveavatar.com/v1/sessions/token';
const REQUEST_TIMEOUT_MS = 10_000;

function resolveDefaultAvatarId(): string {
  return process.env.LIVEAVATAR_DEFAULT_AVATAR_ID || DEFAULT_FACE.liveavatar;
}

/** Lets the client fall back to a server-configured avatar when the preset
 *  list in `src/config/avatars.ts` doesn't apply. */
export async function GET() {
  const tokens = await getTokens(await cookies(), authConfig());
  if (!tokens) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return NextResponse.json({ defaultAvatarId: resolveDefaultAvatarId() });
}

export async function POST(request: Request) {
  try {
    const apiKey = process.env.LIVEAVATAR_API_KEY;
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
    const requested: string = typeof body.avatarId === 'string' ? body.avatarId : '';
    const envOverride = process.env.LIVEAVATAR_DEFAULT_AVATAR_ID;
    const avatarId = requested || envOverride || DEFAULT_FACE.liveavatar;

    const isKnown =
      AVATAR_FACES.liveavatar.some((f) => f.id === avatarId) ||
      (!!envOverride && avatarId === envOverride);
    if (!isKnown) {
      return NextResponse.json({ error: 'Unknown avatar' }, { status: 400 });
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(LIVEAVATAR_TOKEN_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-KEY': apiKey,
        },
        body: JSON.stringify({
          mode: 'LITE',
          avatar_id: avatarId,
          video_settings: { quality: 'high', encoding: 'H264' },
        }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.error('LiveAvatar token request failed:', res.status, text.slice(0, 500));
      return NextResponse.json({ error: 'Avatar service unavailable' }, { status: 502 });
    }

    const data = await res.json();
    const sessionToken = data?.data?.session_token;
    const sessionId = data?.data?.session_id;
    if (typeof sessionToken !== 'string' || !sessionToken) {
      console.error('LiveAvatar token response missing session_token');
      return NextResponse.json({ error: 'Avatar service unavailable' }, { status: 502 });
    }

    return NextResponse.json({
      sessionToken,
      sessionId: typeof sessionId === 'string' ? sessionId : null,
      avatarId,
    });
  } catch (error) {
    console.error('LiveAvatar token generation error:', error);
    return NextResponse.json({ error: 'Avatar service unavailable' }, { status: 502 });
  }
}
