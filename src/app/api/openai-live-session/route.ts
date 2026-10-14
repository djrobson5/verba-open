import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import OpenAI from 'openai';
import { getTokens } from 'next-firebase-auth-edge/next/tokens';
import { isLimitExempt, reserveTokenIssuance, settleReservation } from '@/lib/usage';
import { authConfig } from '@/lib/firebase/auth-config';
import { buildLivePrompts } from '@/lib/openai/live-prompts';
import { DEFAULT_OPENAI_BACKEND_MODEL, OPENAI_BACKEND_MODELS } from '@/config/models';
import type { Difficulty } from '@/config/scenarios';

export const runtime = 'nodejs';

const LIVE_MODEL = 'gpt-live-1';

// Voice is fixed at session creation, so an unknown name would surface as a
// 400 from OpenAI after the browser has already built its offer.
const OPENAI_VOICES = [
  'marin',
  'gleam',
  'meridian',
  'quartz',
  'ripple',
  'vesper',
  'willow',
  'stone',
  'delta',
  'cinder',
  'bossa',
  'tempo',
  'beacon',
];
const DEFAULT_VOICE = 'marin';

const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard'];

// Creating a WebRTC session bills 15 s of initialization (credited once the
// session runs), so this is not a free round-trip — it is capped like the
// Gemini token route.
const CREATE_TIMEOUT_MS = 20_000;

export async function POST(request: Request) {
  // Set once the weekly budget has been reserved, so a failed create hands
  // the seconds straight back instead of holding them for the two-minute
  // confirm window.
  let held: { uid: string; reservationId: string } | null = null;
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'GPT-Live not configured' }, { status: 500 });
    }

    const tokens = await getTokens(await cookies(), authConfig());
    if (!tokens) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const uid = tokens.decodedToken.uid;

    const body = await request.json().catch(() => ({}));

    const sdp: unknown = body.sdp;
    if (typeof sdp !== 'string' || !sdp.trim()) {
      return NextResponse.json({ error: 'Missing SDP offer' }, { status: 400 });
    }

    const systemPrompt: unknown = body.systemPrompt;
    if (typeof systemPrompt !== 'string' || !systemPrompt.trim()) {
      return NextResponse.json({ error: 'Missing system prompt' }, { status: 400 });
    }

    const languageName: string =
      typeof body.languageName === 'string' && body.languageName.trim()
        ? body.languageName.trim()
        : 'the target language';

    const difficulty: Difficulty = DIFFICULTIES.includes(body.difficulty as Difficulty)
      ? (body.difficulty as Difficulty)
      : 'medium';

    if (body.voiceName !== undefined && !OPENAI_VOICES.includes(body.voiceName)) {
      return NextResponse.json({ error: 'Unsupported voice' }, { status: 400 });
    }
    const voice: string = (body.voiceName as string | undefined) ?? DEFAULT_VOICE;

    if (
      body.backendModel !== undefined &&
      !(OPENAI_BACKEND_MODELS as readonly string[]).includes(body.backendModel)
    ) {
      return NextResponse.json({ error: 'Unsupported backend model' }, { status: 400 });
    }
    const backendModel: string =
      (body.backendModel as string | undefined) ?? DEFAULT_OPENAI_BACKEND_MODEL;

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

    const { voiceInstructions, backendInstructions } = buildLivePrompts({
      systemPrompt,
      languageName,
      difficulty,
    });

    const client = new OpenAI({ apiKey, timeout: CREATE_TIMEOUT_MS, maxRetries: 0 });

    // Note: no audio.format here — WebRTC negotiates the media format via SDP
    // and the API rejects an explicit format for this transport.
    const live = await client.live.create({
      session: {
        model: LIVE_MODEL,
        instructions: voiceInstructions,
        audio: { output: { voice } },
        delegation: {
          type: 'responses',
          responses: {
            model: backendModel,
            instructions: backendInstructions,
            reasoning: { effort: 'low' },
          },
        },
      },
      transport: { type: 'webrtc', sdp },
    });

    return NextResponse.json({
      sessionId: live.session.id,
      sdp: live.transport.sdp,
      // Null for admins and unlimited accounts (no weekly budget).
      reservationId: held?.reservationId ?? null,
      reservedSeconds,
    });
  } catch (error) {
    if (held) {
      await settleReservation(held.uid, held.reservationId, 0).catch((err) =>
        console.error('Reservation release failed:', err),
      );
    }
    if (error instanceof OpenAI.APIError) {
      console.error(
        'GPT-Live session creation failed:',
        error.status,
        String(error.message ?? '').slice(0, 500),
      );
    } else {
      console.error('GPT-Live session creation failed:', error);
    }
    return NextResponse.json(
      { error: 'GPT-Live session creation failed' },
      { status: 502 },
    );
  }
}
