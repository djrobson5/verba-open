import type { AudioSink } from '@/lib/gemini/audio-player';
import type { LiveClientState } from '@/lib/gemini/types';

/** Metadata for a delegation the Live model handed to the Responses backend. */
export interface DelegationInfo {
  delegationId: string;
  target: string;
  responseId?: string;
}

/** Delegated Responses backend tokens, summed across every response in the
 *  session (each `response.completed` is its own usage record). */
export interface BackendUsage {
  inputTokens: number;
  /** Subset of inputTokens served from the prompt cache. */
  cachedInputTokens: number;
  /** Subset of inputTokens written to the prompt cache, when reported. */
  cacheWriteTokens: number;
  /** Includes reasoning tokens. */
  outputTokens: number;
  responses: number;
}

/** Everything billable the client has seen so far for this session. */
export interface LiveUsageSnapshot {
  /** Cumulative Live audio seconds; null if no usage event ever arrived. */
  seconds: number | null;
  backend: BackendUsage;
}

function nonNegative(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;
}

export interface LiveWebRtcCallbacks {
  onInputTranscription: (text: string) => void;
  onOutputTranscription: (text: string) => void;
  onStateChange: (state: LiveClientState) => void;
  onError: (message: string) => void;
  /** Cumulative Live audio seconds, as reported by session.usage.updated. */
  onUsageSeconds: (seconds: number) => void;
  onDelegation: (info: DelegationInfo) => void;
  /** GPT-Live has no turn-complete event, so this is derived from output RMS. */
  onAiSpeakingChange: (speaking: boolean) => void;
}

export interface ConnectOptions {
  fetchAnswer: (sdp: string) => Promise<{ sessionId: string; sdp: string }>;
  /** Sent once via session.instructions.append after session.started. */
  greeting: string;
}

const ICE_GATHERING_TIMEOUT_MS = 10_000;
const SESSION_STARTED_TIMEOUT_MS = 30_000;
const SESSION_CLOSED_TIMEOUT_MS = 15_000;
/** Output RMS above this counts as speech. */
const SPEAKING_RMS_THRESHOLD = 0.01;
/** How long the output must stay quiet before a turn is considered over. */
const SPEAKING_SILENCE_MS = 600;

interface LiveServerEvent {
  type?: string;
  session?: { id?: string };
  delta?: string;
  usage?: { seconds?: number };
  reason?: string;
  delegation?: { id?: string; target?: string; response_id?: string };
  event?: { type?: string; [key: string]: unknown };
  delegation_id?: string | null;
  error?: { type?: string; code?: string; message?: string; client_event_id?: string };
}

function randomEventId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `evt_${crypto.randomUUID()}`;
  }
  return `evt_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

/**
 * Browser half of the GPT-Live (OpenAI) voice provider.
 *
 * The HTTP POST of the SDP offer *is* what starts the session — there is no
 * `session.start` on the data channel for WebRTC. Remote audio plays through a
 * muted <audio> element (Chrome refuses to deliver remote WebRTC audio into Web
 * Audio unless the track is also attached to a media element) while a parallel
 * Web Audio graph drives the visualizer, the mute gain, and the avatar sink.
 */
export class LiveWebRtcClient {
  private callbacks: LiveWebRtcCallbacks;

  private pc: RTCPeerConnection | null = null;
  private dc: RTCDataChannel | null = null;
  private micStream: MediaStream | null = null;
  private remoteAudioEl: HTMLAudioElement | null = null;

  private audioContext: AudioContext | null = null;
  private aiAnalyser: AnalyserNode | null = null;
  private userAnalyser: AnalyserNode | null = null;
  private gain: GainNode | null = null;
  private worklet: AudioWorkletNode | null = null;

  private sink: AudioSink | null = null;
  private muted = false;

  private sessionId: string | null = null;
  private lastSeconds: number | null = null;
  private backendUsage: BackendUsage = {
    inputTokens: 0,
    cachedInputTokens: 0,
    cacheWriteTokens: 0,
    outputTokens: 0,
    responses: 0,
  };
  private countedResponseIds = new Set<string>();

  private speaking = false;
  private silenceTimer: ReturnType<typeof setTimeout> | null = null;

  private onStarted: (() => void) | null = null;
  private onStartFailed: ((err: Error) => void) | null = null;
  private onClosed: (() => void) | null = null;

  private disconnecting: Promise<LiveUsageSnapshot> | null = null;
  private stopped = false;

  constructor(callbacks: LiveWebRtcCallbacks) {
    this.callbacks = callbacks;
  }

  getAiAnalyser(): AnalyserNode | null {
    return this.aiAnalyser;
  }

  getUserAnalyser(): AnalyserNode | null {
    return this.userAnalyser;
  }

  getSessionId(): string | null {
    return this.sessionId;
  }

  /** The usage seen so far. disconnect() resolves with the final one. */
  getUsage(): LiveUsageSnapshot {
    return { seconds: this.lastSeconds, backend: { ...this.backendUsage } };
  }

  /** Silences local playback (the avatar carries the voice instead). The gain
   *  sits after the analyser, so the visualizer keeps working either way. */
  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.gain) this.gain.gain.value = muted ? 0 : 1;
  }

  setSink(sink: AudioSink | null): void {
    this.sink = sink;
  }

  async connect({ fetchAnswer, greeting }: ConnectOptions): Promise<void> {
    if (typeof window === 'undefined') throw new Error('GPT-Live requires a browser');
    this.callbacks.onStateChange('connecting');

    try {
      this.micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      const pc = new RTCPeerConnection();
      this.pc = pc;

      pc.addEventListener('track', (ev) => {
        const [stream] = ev.streams;
        if (stream) this.attachRemoteStream(stream);
      });

      pc.addEventListener('connectionstatechange', () => {
        if (this.stopped) return;
        if (pc.connectionState === 'failed') {
          this.callbacks.onError('Voice connection lost');
          this.callbacks.onStateChange('error');
        }
      });

      for (const track of this.micStream.getAudioTracks()) {
        pc.addTrack(track, this.micStream);
      }

      // The data channel must exist before createOffer() so it is negotiated
      // in the very first SDP exchange.
      const dc = pc.createDataChannel('oai-events');
      this.dc = dc;
      dc.addEventListener('message', (ev: MessageEvent) => this.handleMessage(ev));

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await this.waitForIceGathering(pc);

      const localSdp = pc.localDescription?.sdp ?? offer.sdp;
      if (!localSdp) throw new Error('Failed to build a WebRTC offer');

      const started = new Promise<void>((resolve, reject) => {
        this.onStarted = resolve;
        this.onStartFailed = reject;
      });

      const answer = await fetchAnswer(localSdp);
      this.sessionId = answer.sessionId;
      await pc.setRemoteDescription({ type: 'answer', sdp: answer.sdp });

      await this.withTimeout(
        started,
        SESSION_STARTED_TIMEOUT_MS,
        'Timed out waiting for the GPT-Live session to start',
      );

      this.callbacks.onStateChange('connected');
      this.sendEvent({
        type: 'session.instructions.append',
        event_id: randomEventId(),
        delegation_id: null,
        content: greeting,
      });
    } catch (err) {
      this.callbacks.onStateChange('error');
      await this.teardown();
      throw err instanceof Error ? err : new Error('GPT-Live connection failed');
    }
  }

  /** Closes the session and resolves with the final usage: the seconds from
   *  `session.closed` plus any backend responses that completed before it.
   *  If `session.closed` never arrives (15 s), resolves with the last known
   *  snapshot. Never rejects. */
  async disconnect(): Promise<LiveUsageSnapshot> {
    if (this.disconnecting) return this.disconnecting;
    // The caller has already moved on (the UI is idle), so go quiet at once:
    // release the mic and silence the partner while we wait for the final
    // usage. The data channel stays open for session.close / session.closed.
    this.micStream?.getTracks().forEach((t) => t.stop());
    this.sink = null;
    this.setMuted(true);
    this.disconnecting = (async () => {
      if (this.dc?.readyState === 'open') {
        const closed = new Promise<void>((resolve) => {
          this.onClosed = resolve;
        });
        this.sendEvent({ type: 'session.close', event_id: randomEventId() });
        try {
          await this.withTimeout(
            closed,
            SESSION_CLOSED_TIMEOUT_MS,
            'Timed out waiting for session.closed',
          );
        } catch {
          console.warn(
            'GPT-Live: no session.closed within 15s; tearing down with last known usage',
          );
        }
      }
      try {
        await this.teardown();
      } catch (err) {
        console.error('GPT-Live teardown failed:', err);
      }
      this.callbacks.onStateChange('disconnected');
      return this.getUsage();
    })();
    return this.disconnecting;
  }

  // ---------------------------------------------------------------- internals

  private attachRemoteStream(stream: MediaStream): void {
    // Chrome will not route a remote WebRTC track into Web Audio unless the
    // stream is also attached to a media element. It stays muted; our own
    // graph below does the audible playback.
    const el = document.createElement('audio');
    el.autoplay = true;
    el.muted = true;
    el.srcObject = stream;
    el.play().catch(() => {});
    this.remoteAudioEl = el;

    const ctx = this.audioContext ?? new AudioContext({ sampleRate: 24000 });
    this.audioContext = ctx;
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});

    const source = ctx.createMediaStreamSource(stream);

    const analyser = ctx.createAnalyser();
    analyser.fftSize = 64;
    analyser.smoothingTimeConstant = 0.5;
    this.aiAnalyser = analyser;

    const gain = ctx.createGain();
    gain.gain.value = this.muted ? 0 : 1;
    this.gain = gain;

    source.connect(analyser);
    analyser.connect(gain);
    gain.connect(ctx.destination);

    if (this.micStream && !this.userAnalyser) {
      const micSource = ctx.createMediaStreamSource(this.micStream);
      const micAnalyser = ctx.createAnalyser();
      micAnalyser.fftSize = 64;
      micAnalyser.smoothingTimeConstant = 0.5;
      micSource.connect(micAnalyser);
      this.userAnalyser = micAnalyser;
    }

    // The worklet tap feeds the avatar and the speaking detector. It is
    // deliberately not connected to the destination — the gain path above is
    // the only audible one.
    void ctx.audioWorklet
      .addModule('/audio-worklet-processor.js')
      .then(() => {
        if (this.stopped || this.audioContext !== ctx) return;
        const node = new AudioWorkletNode(ctx, 'pcm-processor');
        node.port.onmessage = (ev: MessageEvent) => {
          this.handleOutputFrame(ev.data as Float32Array);
        };
        source.connect(node);
        this.worklet = node;
      })
      .catch((err) => console.error('GPT-Live worklet failed to load:', err));
  }

  /** Converts a Float32 frame to the same 24 kHz Int16 shape AudioPlayer feeds
   *  the avatar sink, and derives speaking state from its RMS. */
  private handleOutputFrame(float32: Float32Array): void {
    const int16 = new Int16Array(float32.length);
    let sumSquares = 0;
    for (let i = 0; i < float32.length; i++) {
      const s = Math.max(-1, Math.min(1, float32[i]));
      sumSquares += s * s;
      int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    this.sink?.push(int16);

    const rms = Math.sqrt(sumSquares / (float32.length || 1));
    if (rms > SPEAKING_RMS_THRESHOLD) {
      if (this.silenceTimer) {
        clearTimeout(this.silenceTimer);
        this.silenceTimer = null;
      }
      if (!this.speaking) {
        this.speaking = true;
        this.callbacks.onAiSpeakingChange(true);
      }
    } else if (this.speaking && !this.silenceTimer) {
      this.silenceTimer = setTimeout(() => {
        this.silenceTimer = null;
        this.speaking = false;
        this.callbacks.onAiSpeakingChange(false);
      }, SPEAKING_SILENCE_MS);
    }
  }

  private handleMessage(ev: MessageEvent): void {
    if (typeof ev.data !== 'string') return;
    let msg: LiveServerEvent;
    try {
      msg = JSON.parse(ev.data) as LiveServerEvent;
    } catch {
      return;
    }

    switch (msg.type) {
      case 'session.started':
        this.sessionId = msg.session?.id ?? this.sessionId;
        console.log('GPT-Live session.started', this.sessionId);
        this.onStarted?.();
        this.onStarted = null;
        this.onStartFailed = null;
        break;

      case 'session.input_transcript.delta':
        if (msg.delta) this.callbacks.onInputTranscription(msg.delta);
        break;

      case 'session.output_transcript.delta':
        if (msg.delta) this.callbacks.onOutputTranscription(msg.delta);
        break;

      case 'session.usage.updated':
        if (typeof msg.usage?.seconds === 'number') {
          this.lastSeconds = msg.usage.seconds;
          this.callbacks.onUsageSeconds(msg.usage.seconds);
        }
        break;

      case 'session.delegation.created': {
        const id = msg.delegation?.id;
        if (id) {
          const info: DelegationInfo = {
            delegationId: id,
            target: msg.delegation?.target ?? 'unknown',
            responseId: msg.delegation?.response_id,
          };
          console.log('GPT-Live delegation created', info);
          this.callbacks.onDelegation(info);
        }
        break;
      }

      case 'response.event': {
        // Nested Responses streaming events from the delegated backend model.
        // Each terminal response event carries that one response's token
        // usage. Incomplete (e.g. cut off at a token limit) and failed
        // responses are billed for what they consumed too.
        const nested = msg.event;
        if (
          nested?.type === 'response.completed' ||
          nested?.type === 'response.incomplete' ||
          nested?.type === 'response.failed'
        ) {
          this.recordBackendUsage(nested, msg);
        }
        break;
      }

      case 'error': {
        const message = msg.error?.message ?? 'GPT-Live error';
        console.error('GPT-Live error event', msg.error);
        this.callbacks.onError(message);
        if (this.onStartFailed) {
          const fail = this.onStartFailed;
          this.onStarted = null;
          this.onStartFailed = null;
          fail(new Error(message));
        }
        break;
      }

      case 'session.closed':
        if (typeof msg.usage?.seconds === 'number') {
          this.lastSeconds = msg.usage.seconds;
          this.callbacks.onUsageSeconds(msg.usage.seconds);
        }
        console.log('GPT-Live session.closed', msg.reason, this.lastSeconds);
        this.onClosed?.();
        this.onClosed = null;
        break;

      default:
        break;
    }
  }

  /**
   * Adds one backend response's tokens to the session total. Per the `openai`
   * SDK types, the nested event is a `ResponseCompletedEvent` whose
   * `response.usage` is a `ResponseUsage` (`input_tokens`,
   * `input_tokens_details.cached_tokens` / `.cache_write_tokens`,
   * `output_tokens`). A top-level `usage` on the nested event is accepted as a
   * fallback in case the Live envelope flattens it. Responses are separate
   * usage records, so they are summed, deduped by response id.
   */
  private recordBackendUsage(
    nested: { [key: string]: unknown },
    envelope: LiveServerEvent,
  ): void {
    const response =
      nested.response && typeof nested.response === 'object'
        ? (nested.response as { id?: unknown; usage?: unknown })
        : null;
    const usage = (response?.usage ?? nested.usage) as
      | {
          input_tokens?: unknown;
          output_tokens?: unknown;
          input_tokens_details?: { cached_tokens?: unknown; cache_write_tokens?: unknown } | null;
        }
      | null
      | undefined;

    console.log(
      `GPT-Live backend ${String(nested.type)}`,
      envelope.delegation_id ?? null,
      usage ?? null,
    );
    if (!usage || typeof usage !== 'object') return;

    const id = typeof response?.id === 'string' ? response.id : null;
    if (id) {
      if (this.countedResponseIds.has(id)) return;
      this.countedResponseIds.add(id);
    }

    const input = nonNegative(usage.input_tokens);
    const details = usage.input_tokens_details ?? null;
    this.backendUsage.inputTokens += input;
    this.backendUsage.cachedInputTokens += Math.min(nonNegative(details?.cached_tokens), input);
    this.backendUsage.cacheWriteTokens += Math.min(
      nonNegative(details?.cache_write_tokens),
      input,
    );
    this.backendUsage.outputTokens += nonNegative(usage.output_tokens);
    this.backendUsage.responses += 1;
  }

  private sendEvent(event: Record<string, unknown>): void {
    if (this.dc?.readyState !== 'open') return;
    try {
      this.dc.send(JSON.stringify(event));
    } catch (err) {
      console.error('GPT-Live failed to send event:', err);
    }
  }

  private waitForIceGathering(pc: RTCPeerConnection): Promise<void> {
    if (pc.iceGatheringState === 'complete') return Promise.resolve();
    return new Promise<void>((resolve) => {
      const onChange = () => {
        if (pc.iceGatheringState === 'complete') finish();
      };
      const finish = () => {
        clearTimeout(timer);
        pc.removeEventListener('icegatheringstatechange', onChange);
        resolve();
      };
      const timer = setTimeout(finish, ICE_GATHERING_TIMEOUT_MS);
      pc.addEventListener('icegatheringstatechange', onChange);
    });
  }

  private withTimeout<T>(p: Promise<T>, ms: number, message: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(message)), ms);
      p.then(
        (v) => {
          clearTimeout(timer);
          resolve(v);
        },
        (err) => {
          clearTimeout(timer);
          reject(err);
        },
      );
    });
  }

  private async teardown(): Promise<void> {
    if (this.stopped) return;
    this.stopped = true;

    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }
    if (this.speaking) {
      this.speaking = false;
      this.callbacks.onAiSpeakingChange(false);
    }

    this.sink = null;
    this.micStream?.getTracks().forEach((t) => t.stop());
    this.micStream = null;

    this.worklet?.disconnect();
    this.worklet = null;
    this.aiAnalyser?.disconnect();
    this.aiAnalyser = null;
    this.userAnalyser?.disconnect();
    this.userAnalyser = null;
    this.gain?.disconnect();
    this.gain = null;

    if (this.remoteAudioEl) {
      this.remoteAudioEl.pause();
      this.remoteAudioEl.srcObject = null;
      this.remoteAudioEl = null;
    }

    try {
      this.dc?.close();
    } catch {
      // already closing
    }
    this.dc = null;

    try {
      this.pc?.close();
    } catch {
      // already closing
    }
    this.pc = null;

    if (this.audioContext) {
      await this.audioContext.close().catch(() => {});
      this.audioContext = null;
    }
  }
}
