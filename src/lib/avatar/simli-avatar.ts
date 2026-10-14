// Imported from the subpath rather than the package root: simli-client 3.0.2's
// dist/index.js does `require('./Client')` while the file on disk is
// `client.js`, which resolves on Windows/macOS but fails on a case-sensitive
// filesystem (i.e. the production build). The subpath casing is consistent.
import type { SimliClient } from 'simli-client/dist/client';
import type { AvatarCallbacks, AvatarProvider, AvatarState } from './types';

const GEMINI_SAMPLE_RATE = 24000;
const SIMLI_SAMPLE_RATE = 16000;
const RESAMPLE_RATIO = GEMINI_SAMPLE_RATE / SIMLI_SAMPLE_RATE;

/**
 * Owns a Simli WebRTC session and the media elements it renders into.
 * Deliberately React-free so the hook can create/destroy it imperatively.
 */
export class SimliAvatar implements AvatarProvider {
  readonly videoElement: HTMLVideoElement;
  readonly audioElement: HTMLAudioElement;

  private client: SimliClient | null = null;
  private state: AvatarState = 'idle';
  private readonly callbacks: AvatarCallbacks;

  // Resampler carry-over. Keeping the fractional read position and the final
  // sample of the previous chunk means interpolation spans chunk boundaries,
  // which is what stops the 24k→16k conversion from clicking every frame.
  private readPosition = 0;
  private lastSample = 0;

  private handleStart = () => this.setState('ready');
  private handleStop = () => this.setState('stopped');
  private handleError = (detail: string) => {
    console.error('Simli error:', detail);
    this.setState('error');
  };
  private handleStartupError = (message: string) => {
    console.error('Simli startup error:', message);
    this.setState('error');
  };
  private handleSpeaking = () => this.callbacks.onSpeakingChange?.(true);
  private handleSilent = () => this.callbacks.onSpeakingChange?.(false);

  constructor(callbacks: AvatarCallbacks) {
    this.callbacks = callbacks;

    const video = document.createElement('video');
    video.autoplay = true;
    video.playsInline = true;
    // Simli's audio arrives on the separate audio element; muting the video
    // element is what lets it autoplay without a user gesture.
    video.muted = true;
    this.videoElement = video;

    const audio = document.createElement('audio');
    audio.autoplay = true;
    this.audioElement = audio;
  }

  getState(): AvatarState {
    return this.state;
  }

  async start(sessionToken: string): Promise<void> {
    this.setState('connecting');
    try {
      const { SimliClient: Client } = await import('simli-client/dist/client');
      const { LogLevel } = await import('simli-client/dist/Logger');
      // The default transport is p2p, which throws unless ICE servers are
      // supplied. LiveKit mode is relayed through Simli's own infrastructure,
      // so it needs no STUN/TURN configuration on our side.
      const client = new Client(
        sessionToken,
        this.videoElement,
        this.audioElement,
        null,
        LogLevel.ERROR,
        'livekit',
      );
      this.client = client;
      client.on('start', this.handleStart);
      client.on('stop', this.handleStop);
      client.on('error', this.handleError);
      client.on('startup_error', this.handleStartupError);
      client.on('speaking', this.handleSpeaking);
      client.on('silent', this.handleSilent);
      await client.start();
      this.setState('ready');
    } catch (err) {
      this.setState('error');
      throw err;
    }
  }

  /** Gemini hands us PCM16 mono @ 24 kHz; Simli wants PCM16 mono @ 16 kHz. */
  pushPcm24k(int16: Int16Array): void {
    if (this.state !== 'ready' || !this.client || int16.length === 0) return;

    const n = int16.length;
    const out: number[] = [];
    let position = this.readPosition;
    // Index -1 addresses the carried sample from the previous chunk, so a run
    // needs floor(position) <= n - 2 for both interpolation taps to exist.
    while (Math.floor(position) <= n - 2) {
      const index = Math.floor(position);
      const frac = position - index;
      const a = index < 0 ? this.lastSample : int16[index];
      const b = int16[index + 1];
      out.push(Math.round(a + (b - a) * frac));
      position += RESAMPLE_RATIO;
    }

    this.lastSample = int16[n - 1];
    // Rebase into the next chunk's coordinates, where this chunk's final
    // sample becomes index -1.
    this.readPosition = position - n;

    if (out.length === 0) return;
    const resampled = Int16Array.from(out);
    this.client.sendAudioData(
      new Uint8Array(resampled.buffer, resampled.byteOffset, resampled.byteLength),
    );
  }

  /** No-op: Simli's `handleSilence` detects end-of-speech from the stream
   *  itself, so there is nothing to flush or signal at turn boundaries. */
  endUtterance(): void {}

  interrupt(): void {
    if (!this.client) return;
    try {
      this.client.ClearBuffer();
    } catch (err) {
      console.error('Simli ClearBuffer failed:', err);
    }
  }

  async stop(): Promise<void> {
    const client = this.client;
    this.client = null;
    if (client) {
      client.off('start', this.handleStart);
      client.off('stop', this.handleStop);
      client.off('error', this.handleError);
      client.off('startup_error', this.handleStartupError);
      client.off('speaking', this.handleSpeaking);
      client.off('silent', this.handleSilent);
      try {
        await client.stop();
      } catch (err) {
        console.error('Simli stop failed:', err);
      }
    }
    this.videoElement.pause();
    this.videoElement.srcObject = null;
    this.audioElement.pause();
    this.audioElement.srcObject = null;
    this.setState('stopped');
  }

  private setState(next: AvatarState): void {
    if (this.state === next) return;
    this.state = next;
    this.callbacks.onStateChange(next);
  }
}
