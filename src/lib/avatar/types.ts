/** Which lip-sync vendor renders the video partner. */
export type AvatarVendor = 'simli' | 'liveavatar';

export type AvatarState = 'idle' | 'connecting' | 'ready' | 'error' | 'stopped';

export interface AvatarCallbacks {
  onStateChange: (state: AvatarState) => void;
  onSpeakingChange?: (speaking: boolean) => void;
}

/**
 * The contract `useLiveSession` drives, regardless of vendor. Implementations
 * own their own <video>/<audio> elements (WebRTC attaches tracks to them
 * directly) and are deliberately React-free.
 */
export interface AvatarProvider {
  readonly videoElement: HTMLVideoElement;
  readonly audioElement: HTMLAudioElement;
  /** Connects the session. Resolves once video is live, rejects on failure. */
  start(sessionToken: string): Promise<void>;
  /** Gemini output audio: PCM16 mono @ 24 kHz. */
  pushPcm24k(int16: Int16Array): void;
  /** Called on turnComplete. Vendors that need an explicit end-of-speech
   *  marker flush here; vendors that detect silence themselves no-op. */
  endUtterance(): void;
  /** Barge-in: drop everything buffered, stop talking now. */
  interrupt(): void;
  /** Idempotent teardown. */
  stop(): Promise<void>;
  getState(): AvatarState;
}
