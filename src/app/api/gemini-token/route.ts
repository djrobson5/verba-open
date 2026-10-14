import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { GoogleGenAI } from '@google/genai';
import { getTokens } from 'next-firebase-auth-edge/next/tokens';
import { isLimitExempt, reserveTokenIssuance, settleReservation } from '@/lib/usage';
import { buildLiveConfig, buildTokenConstraintConfig } from '@/lib/gemini/build-live-config';
import { authConfig } from '@/lib/firebase/auth-config';

export const runtime = 'nodejs';

// Every model we ship must be ephemeral-capable: the raw GEMINI_API_KEY is
// never sent to the browser. A model that can't do ephemeral tokens doesn't
// belong in src/config/models.ts.
const EPHEMERAL_TOKEN_MODELS = [
  'models/gemini-2.5-flash-native-audio-preview-12-2025',
  'models/gemini-3.1-flash-live-preview',
];

// Gemini Live prebuilt voices we allow the browser to request.
const GEMINI_VOICES = ['Puck', 'Charon', 'Kore', 'Fenrir', 'Aoede', 'Leda', 'Orus', 'Zephyr'];

export async function POST(request: Request) {
  // Set once the weekly budget has been reserved, so a failure after that
  // point hands the seconds straight back instead of holding them for the
  // two-minute confirm window.
  let held: { uid: string; reservationId: string } | null = null;
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'API key not configured' }, { status: 500 });
    }

    const tokens = await getTokens(await cookies(), authConfig());
    if (!tokens) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const uid = tokens.decodedToken.uid;

    const body = await request.json().catch(() => ({}));
    const model: string = body.model || '';

    if (!EPHEMERAL_TOKEN_MODELS.includes(model)) {
      return NextResponse.json(
        { error: 'Unsupported model' },
        { status: 400 },
      );
    }

    if (typeof body.systemPrompt !== 'string' || !body.systemPrompt.trim()) {
      return NextResponse.json(
        { error: 'Missing system prompt' },
        { status: 400 },
      );
    }

    // The voice is pinned into the token constraint, so an unexpected name
    // would surface as an opaque socket close rather than a useful error.
    if (body.voiceName !== undefined && !GEMINI_VOICES.includes(body.voiceName)) {
      return NextResponse.json({ error: 'Unsupported voice' }, { status: 400 });
    }

    // Daily caps and the weekly budget, after validation so a malformed
    // request neither counts nor holds practice time.
    let reservedSeconds: number | null = null;
    if (!isLimitExempt(tokens.decodedToken)) {
      const reservation = await reserveTokenIssuance(uid);
      if (!reservation.allowed) {
        return NextResponse.json(
          { error: 'Session limit reached', reason: reservation.reason },
          { status: 429 },
        );
      }
      held = { uid, reservationId: reservation.reservationId };
      reservedSeconds = reservation.reservedSeconds;
    }

    const sessionRequest = {
      model,
      systemPrompt: body.systemPrompt as string,
      voiceName: body.voiceName,
      transcribe: body.transcribe !== false,
      vad: body.vad,
    };
    const config = buildLiveConfig(sessionRequest);

    const client = new GoogleGenAI({
      apiKey,
      httpOptions: { apiVersion: 'v1beta' },
    });
    // liveConnectConstraints pins the session setup to this exact config. An
    // unconstrained token is a 5-minute general-purpose Gemini key — whoever
    // holds it can connect with their own system instruction and tools. With
    // the constraint, a stolen token can only run the session we authorized.
    const token = await client.authTokens.create({
      config: {
        uses: 1,
        expireTime: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
        liveConnectConstraints: {
          model,
          config: buildTokenConstraintConfig(sessionRequest),
        },
      },
    });

    return NextResponse.json({
      token: token.name,
      config,
      // Null for admins and unlimited accounts (no weekly budget).
      reservationId: held?.reservationId ?? null,
      reservedSeconds,
    });
  } catch (error) {
    console.error('Token generation error:', error);
    if (held) {
      await settleReservation(held.uid, held.reservationId, 0).catch((err) =>
        console.error('Reservation release failed:', err),
      );
    }
    return NextResponse.json({ error: 'Failed to generate token' }, { status: 500 });
  }
}
