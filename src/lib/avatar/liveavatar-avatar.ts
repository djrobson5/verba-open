import type { Room, RemoteTrack, RemoteTrackPublication, RemoteParticipant } from 'livekit-client';
import type { AvatarCallbacks, AvatarProvider, AvatarState } from './types';

const START_URL = 'https://api.liveavatar.com/v1/sessions/start';
/** The remote LiveKit participant that publishes the rendered avatar. */
const AVATAR_IDENTITY = 'heygen';
/** Gemini emits PCM16 mono @ 24 kHz and LiveAvatar consumes exactly that, so
 *  unlike the Simli path there is no resampling — this is a passthrough. */
const SAMPLE_RATE = 24000;
/** ~250 ms per WS frame. Docs suggest 400 ms–1 s chunks; 250 ms keeps latency
 *  down while still batching our 40 ms Gemini frames ~6:1. */
const CHUNK_SAMPLES = SAMPLE_RATE / 4;
const KEEP_ALIVE_MS = 60_000;
const START_TIMEOUT_MS = 15_000;
/** btoa on a huge string via String.fromCharCode(...arr) blows the arg limit. */
const B64_SLICE = 8192;

interface SessionStartResponse {
  session_id?: string;
  livekit_url?: string;
  livekit_client_token?: string;
  ws_url?: string;
}

interface IncomingFrame {
  type?: string;
  state?: string;
  message?: string;
  code?: string;
  // Some error frames nest the detail instead of flattening it.
  error?: { code?: string; message?: string };
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += B64_SLICE) {
    binary += String.fromCharCode(...bytes.subarray(i, i + B64_SLICE));
  }
  return btoa(binary);
}

function newEventId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `ev-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Owns a HeyGen LiveAvatar (LITE mode) session: a LiveKit room for the
 * rendered video/audio down-link and a WebSocket for the PCM up-link.
 * Deliberately React-free so the hook can create/destroy it imperatively.
 */
export class LiveAvatarAvatar implements AvatarProvider {
  readonly videoElement: HTMLVideoElement;
  readonly audioElement: HTMLAudioElement;

  private state: AvatarState = 'idle';
  private readonly callbacks: AvatarCallbacks;

  private room: Room | null = null;
  private socket: WebSocket | null = null;
  private keepAliveTimer: ReturnType<typeof setInterval> | null = null;
  private attachedTracks: RemoteTrack[] = [];

  /** Pending PCM samples not yet big enough to fill a chunk. */
  private pending: number[] = [];
  /** False until the first chunk of the current utterance has been sent, so
   *  `agent.stop_listening` is emitted exactly once per utterance. */
  private utteranceOpen = false;

  private socketConnected = false;
  private videoAttached = false;
  private resolveReady: (() => void) | null = null;

  constructor(callbacks: AvatarCallbacks) {
    this.callbacks = callbacks;

    const video = document.createElement('video');
    video.autoplay = true;
    video.playsInline = true;
    // The voice arrives on the separate audio element; a muted video element
    // is what lets it autoplay without a user gesture.
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
      const res = await fetch(START_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sessionToken}`,
        },
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`LiveAvatar session start failed (${res.status}): ${text.slice(0, 200)}`);
      }
      // The token endpoint wraps its payload in { code, data }; the start
      // endpoint is documented flat but has been seen wrapped too, so accept
      // either and surface the real shape (minus secrets) if neither matches.
      const raw: unknown = await res.json();
      const envelope = raw as { data?: SessionStartResponse } & SessionStartResponse;
      const data: SessionStartResponse =
        envelope.data && typeof envelope.data === 'object' ? envelope.data : envelope;
      const { livekit_url: livekitUrl, livekit_client_token: clientToken, ws_url: wsUrl } = data;
      if (!livekitUrl || !clientToken || !wsUrl) {
        const keys = raw && typeof raw === 'object' ? Object.keys(raw as object).join(',') : typeof raw;
        const innerKeys =
          envelope.data && typeof envelope.data === 'object'
            ? Object.keys(envelope.data as object).join(',')
            : '';
        throw new Error(
          `LiveAvatar session start response missing connection details (keys: ${keys}${innerKeys ? `; data: ${innerKeys}` : ''})`,
        );
      }

      const ready = new Promise<void>((resolve, reject) => {
        this.resolveReady = resolve;
        setTimeout(() => {
          if (this.state !== 'ready') reject(new Error('LiveAvatar connection timed out'));
        }, START_TIMEOUT_MS);
      });
      // If the room/socket setup throws first we never await `ready`, and its
      // later timeout rejection would surface as an unhandled rejection.
      ready.catch(() => {});

      await this.connectRoom(livekitUrl, clientToken);
      this.openSocket(wsUrl);
      await ready;
    } catch (err) {
      this.setState('error');
      // Best-effort cleanup so a failed start can't leak a room or socket —
      // and, more importantly, can't leave a session burning free minutes.
      await this.stop().catch(() => {});
      this.setState('error');
      throw err;
    }
  }

  private async connectRoom(url: string, token: string): Promise<void> {
    const { Room: LkRoom, RoomEvent, Track } = await import('livekit-client');
    const room = new LkRoom();
    this.room = room;

    room.on(
      RoomEvent.TrackSubscribed,
      (
        track: RemoteTrack,
        _publication: RemoteTrackPublication,
        participant: RemoteParticipant,
      ) => {
        if (participant.identity !== AVATAR_IDENTITY) {
          // Attach anyway: LITE mode only ever has one publisher, and an
          // identity rename upstream shouldn't blank the stage.
          console.warn(
            `LiveAvatar: unexpected publisher identity "${participant.identity}", attaching anyway`,
          );
        }
        if (track.kind === Track.Kind.Video) {
          track.attach(this.videoElement);
          this.attachedTracks.push(track);
          this.videoAttached = true;
          this.maybeReady();
        } else if (track.kind === Track.Kind.Audio) {
          track.attach(this.audioElement);
          this.attachedTracks.push(track);
        }
      },
    );

    room.on(RoomEvent.Disconnected, () => {
      this.callbacks.onSpeakingChange?.(false);
      this.setState('stopped');
    });

    await room.connect(url, token);
  }

  private openSocket(wsUrl: string): void {
    const socket = new WebSocket(wsUrl);
    this.socket = socket;

    socket.onmessage = (event) => {
      if (typeof event.data !== 'string') return;
      let frame: IncomingFrame;
      try {
        frame = JSON.parse(event.data) as IncomingFrame;
      } catch {
        return;
      }
      this.handleFrame(frame);
    };

    socket.onerror = () => {
      console.error('LiveAvatar websocket error');
      if (this.state === 'ready' || this.state === 'connecting') this.setState('error');
    };

    socket.onclose = () => {
      this.socketConnected = false;
      if (this.state === 'ready') this.setState('stopped');
    };
  }

  private handleFrame(frame: IncomingFrame): void {
    switch (frame.type) {
      case 'session.state_updated':
        if (frame.state === 'connected') {
          this.socketConnected = true;
          this.startKeepAlive();
          this.maybeReady();
        } else if (frame.state === 'disconnected') {
          this.setState('stopped');
        }
        break;
      case 'agent.state_updated':
        this.callbacks.onSpeakingChange?.(frame.state === 'talking');
        break;
      case 'agent.speak_started':
        this.callbacks.onSpeakingChange?.(true);
        break;
      case 'agent.speak_ended':
        this.callbacks.onSpeakingChange?.(false);
        break;
      case 'error': {
        const code = frame.code ?? frame.error?.code ?? '';
        const message = frame.message ?? frame.error?.message ?? '';
        // `video_starvation` means we under-fed the audio buffer; the session
        // recovers on its own, so it must not tear the avatar down.
        if (code === 'video_starvation') {
          console.warn('LiveAvatar warning:', code, message);
        } else {
          console.error('LiveAvatar error:', code, message);
          this.setState('error');
        }
        break;
      }
      default:
        break;
    }
  }

  private maybeReady(): void {
    if (this.state === 'ready') return;
    if (!this.socketConnected || !this.videoAttached) return;
    this.setState('ready');
    this.resolveReady?.();
    this.resolveReady = null;
  }

  private startKeepAlive(): void {
    if (this.keepAliveTimer) return;
    this.keepAliveTimer = setInterval(() => {
      this.send({ type: 'session.keep_alive', event_id: newEventId() });
    }, KEEP_ALIVE_MS);
  }

  private send(payload: Record<string, string>): void {
    const socket = this.socket;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    socket.send(JSON.stringify(payload));
  }

  /** Gemini hands us PCM16 mono @ 24 kHz, which is what LiveAvatar wants. */
  pushPcm24k(int16: Int16Array): void {
    if (this.state !== 'ready' || int16.length === 0) return;
    for (let i = 0; i < int16.length; i += 1) this.pending.push(int16[i]);
    while (this.pending.length >= CHUNK_SAMPLES) {
      this.flushChunk(this.pending.splice(0, CHUNK_SAMPLES));
    }
  }

  private flushChunk(samples: number[]): void {
    if (samples.length === 0) return;
    if (!this.utteranceOpen) {
      // Leave the idle "listening" pose before the first audio of a turn.
      this.send({ type: 'agent.stop_listening', event_id: newEventId() });
      this.utteranceOpen = true;
    }
    const pcm = Int16Array.from(samples);
    const bytes = new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength);
    this.send({
      type: 'agent.speak',
      event_id: newEventId(),
      audio: toBase64(bytes),
    });
  }

  endUtterance(): void {
    if (this.state !== 'ready') {
      this.pending = [];
      return;
    }
    if (this.pending.length > 0) {
      this.flushChunk(this.pending);
      this.pending = [];
    }
    if (!this.utteranceOpen) return;
    this.send({ type: 'agent.speak_end', event_id: newEventId() });
    this.send({ type: 'agent.start_listening', event_id: newEventId() });
    this.utteranceOpen = false;
  }

  interrupt(): void {
    this.pending = [];
    this.utteranceOpen = false;
    this.send({ type: 'agent.interrupt', event_id: newEventId() });
    this.callbacks.onSpeakingChange?.(false);
  }

  async stop(): Promise<void> {
    if (this.keepAliveTimer) {
      clearInterval(this.keepAliveTimer);
      this.keepAliveTimer = null;
    }
    this.pending = [];
    this.utteranceOpen = false;
    this.resolveReady = null;
    this.socketConnected = false;
    this.videoAttached = false;

    const socket = this.socket;
    this.socket = null;
    if (socket) {
      socket.onmessage = null;
      socket.onerror = null;
      socket.onclose = null;
      try {
        socket.close();
      } catch (err) {
        console.error('LiveAvatar websocket close failed:', err);
      }
    }

    for (const track of this.attachedTracks) {
      try {
        track.detach();
      } catch (err) {
        console.error('LiveAvatar track detach failed:', err);
      }
    }
    this.attachedTracks = [];

    const room = this.room;
    this.room = null;
    if (room) {
      try {
        // Free-tier minutes only stop burning once the room is gone, so this
        // is awaited rather than fired and forgotten.
        await room.disconnect();
      } catch (err) {
        console.error('LiveAvatar room disconnect failed:', err);
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
