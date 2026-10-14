import {
  LiveConfig,
  SetupMessage,
  RealtimeInputMessage,
  ServerContentMessage,
  LiveClientState,
  UsageMetadata,
} from './types';

export interface LiveClientCallbacks {
  onAudioData: (base64Pcm: string) => void;
  onInputTranscription: (text: string) => void;
  onOutputTranscription: (text: string) => void;
  onTurnComplete: () => void;
  onInterrupted: () => void;
  onStateChange: (state: LiveClientState) => void;
  onError: (error: string) => void;
  onUsageMetadata?: (m: UsageMetadata) => void;
}

const WS_BASE = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage';

export class LiveClient {
  private ws: WebSocket | null = null;
  private callbacks: LiveClientCallbacks;
  private state: LiveClientState = 'disconnected';

  constructor(callbacks: LiveClientCallbacks) {
    this.callbacks = callbacks;
  }

  /** `token` is always a short-lived ephemeral token. There is deliberately no
   *  raw-API-key path here — the key stays server-side, so the only endpoint
   *  we speak is the constrained one. */
  async connect(token: string, config: LiveConfig): Promise<void> {
    this.setState('connecting');

    const url = `${WS_BASE}.v1beta.GenerativeService.BidiGenerateContentConstrained?access_token=${token}`;
    this.ws = new WebSocket(url);

    return new Promise((resolve, reject) => {
      if (!this.ws) return reject(new Error('WebSocket not created'));

      this.ws.onopen = () => {
        const setupMsg: SetupMessage = { setup: config };
        this.ws!.send(JSON.stringify(setupMsg));
      };

      this.ws.onmessage = async (event) => {
        try {
          let raw: string;
          if (event.data instanceof Blob) {
            raw = await event.data.text();
          } else {
            raw = event.data;
          }
          const msg: ServerContentMessage = JSON.parse(raw);

          if (msg.setupComplete) {
            this.setState('connected');
            resolve();
            return;
          }

          if (msg.usageMetadata && this.callbacks.onUsageMetadata) {
            this.callbacks.onUsageMetadata(msg.usageMetadata);
          }

          if (msg.serverContent) {
            const content = msg.serverContent;

            if (content.inputTranscription?.text) {
              this.callbacks.onInputTranscription(content.inputTranscription.text);
            }

            if (content.outputTranscription?.text) {
              this.callbacks.onOutputTranscription(content.outputTranscription.text);
            }

            if (content.modelTurn?.parts) {
              for (const part of content.modelTurn.parts) {
                if (part.inlineData?.data) {
                  this.callbacks.onAudioData(part.inlineData.data);
                }
              }
            }

            if (content.interrupted) {
              this.callbacks.onInterrupted();
            }

            if (content.turnComplete) {
              this.callbacks.onTurnComplete();
            }
          }
        } catch (err) {
          console.error('Error parsing WS message:', err);
        }
      };

      this.ws.onerror = (event) => {
        console.error('WebSocket error event:', event);
        this.setState('error');
        this.callbacks.onError('WebSocket connection error');
        reject(new Error('WebSocket error'));
      };

      this.ws.onclose = (event) => {
        console.log('WebSocket closed:', event.code, event.reason);
        this.setState('disconnected');
      };
    });
  }

  sendAudio(base64Pcm: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    // `mediaChunks` is rejected outright on v1beta (close 1007, "media_chunks
    // is deprecated"). Both models take the `audio` shape.
    const msg: RealtimeInputMessage = {
      realtimeInput: {
        audio: {
          mimeType: 'audio/pcm;rate=16000',
          data: base64Pcm,
        },
      },
    };
    this.ws.send(JSON.stringify(msg));
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.setState('disconnected');
  }

  getState(): LiveClientState {
    return this.state;
  }

  private setState(state: LiveClientState): void {
    this.state = state;
    this.callbacks.onStateChange(state);
  }
}
