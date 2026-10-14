import { SimliAvatar } from './simli-avatar';
import { LiveAvatarAvatar } from './liveavatar-avatar';
import type { AvatarCallbacks, AvatarProvider, AvatarVendor } from './types';

export type { AvatarCallbacks, AvatarProvider, AvatarState, AvatarVendor } from './types';
export { SimliAvatar } from './simli-avatar';
export { LiveAvatarAvatar } from './liveavatar-avatar';

export function createAvatarProvider(
  vendor: AvatarVendor,
  callbacks: AvatarCallbacks,
): AvatarProvider {
  return vendor === 'liveavatar'
    ? new LiveAvatarAvatar(callbacks)
    : new SimliAvatar(callbacks);
}

/** Every vendor mints its session token server-side; this maps to that route. */
export function tokenEndpointFor(vendor: AvatarVendor): string {
  return vendor === 'liveavatar' ? '/api/liveavatar-token' : '/api/simli-token';
}
