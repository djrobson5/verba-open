import type { AvatarVendor } from '@/lib/avatar/types';
import type { LiveProvider } from '@/config/models';

export interface AvatarFace {
  id: string;
  label: string;
  /** Gemini prebuilt voice to pair with this face, so a male face doesn't
   *  speak with the session default (Aoede, female). Valid names: Puck,
   *  Charon, Fenrir, Orus (male); Aoede, Kore, Leda, Zephyr (female). */
  voice: string;
  /** OpenAI GPT-Live built-in voice for the same face. Fixed at session
   *  creation, so it has to be chosen before the SDP offer goes out. */
  openaiVoice: string;
}

export interface AvatarVendorInfo {
  id: AvatarVendor;
  label: string;
  note: string;
}

export const AVATAR_VENDORS: AvatarVendorInfo[] = [
  { id: 'simli', label: 'Simli', note: 'Fast, low cost, lower fidelity' },
  {
    id: 'liveavatar',
    label: 'LiveAvatar',
    note: 'HeyGen, higher fidelity, 10 free min/month',
  },
];

// Preset faces per vendor. The browser picks one of these by id and the
// vendor's token route validates the choice server-side, so an arbitrary id
// can never be minted against our API keys.
export const AVATAR_FACES: Record<AvatarVendor, AvatarFace[]> = {
  simli: [
    { id: 'cace3ef7-a4c4-425d-a8cf-a5358eb0c427', label: 'Tina', voice: 'Aoede', openaiVoice: 'gleam' },
    { id: '804c347a-26c9-4dcf-bb49-13df4bed61e8', label: 'Mark', voice: 'Puck', openaiVoice: 'meridian' },
    { id: 'f0ba4efe-7946-45de-9955-c04a04c367b9', label: 'Doctor', voice: 'Charon', openaiVoice: 'vesper' },
  ],
  // Fetched from GET https://api.liveavatar.com/v1/avatars/public — all
  // ACTIVE and usable. The public catalogue currently exposes only
  // `type: VIDEO` avatars, so none of these are IMAGE-type.
  liveavatar: [
    {
      id: 'c72a9099-84b9-4d5d-98f4-a19ba131e654',
      label: 'Judy (teacher)',
      voice: 'Leda',
      openaiVoice: 'gleam',
    },
    {
      id: '7b888024-f8c9-4205-95e1-78ce01497bda',
      label: 'Shawn (therapist)',
      voice: 'Puck',
      openaiVoice: 'meridian',
    },
    {
      id: 'e9844e6d-847e-4964-a92b-7ecd066f69df',
      label: 'Graham',
      voice: 'Charon',
      openaiVoice: 'meridian',
    },
    {
      id: '40b4f000-f783-4bba-a327-ea58b1a6fdf2',
      label: 'Amina',
      voice: 'Kore',
      openaiVoice: 'gleam',
    },
  ],
};

export const DEFAULT_FACE: Record<AvatarVendor, string> = {
  simli: AVATAR_FACES.simli[0].id,
  liveavatar: AVATAR_FACES.liveavatar[0].id,
};

export const DEFAULT_VENDOR: AvatarVendor = 'simli';

export function isAvatarVendor(value: unknown): value is AvatarVendor {
  return value === 'simli' || value === 'liveavatar';
}

/** The provider-specific voice paired with a face, or undefined to keep the
 *  session default. */
export function voiceForFace(
  vendor: AvatarVendor,
  faceId: string,
  provider: LiveProvider = 'gemini',
): string | undefined {
  const face = AVATAR_FACES[vendor].find((f) => f.id === faceId);
  if (!face) return undefined;
  return provider === 'openai' ? face.openaiVoice : face.voice;
}
