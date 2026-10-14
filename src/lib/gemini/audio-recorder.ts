export class AudioRecorder {
  private stream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private analyser: AnalyserNode | null = null;
  private onData: ((base64Pcm: string) => void) | null = null;

  async start(onData: (base64Pcm: string) => void): Promise<void> {
    this.onData = onData;

    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        sampleRate: 16000,
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });

    this.audioContext = new AudioContext({ sampleRate: 16000 });
    await this.audioContext.audioWorklet.addModule('/audio-worklet-processor.js');

    const source = this.audioContext.createMediaStreamSource(this.stream);
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 64;
    this.analyser.smoothingTimeConstant = 0.5;
    source.connect(this.analyser);
    this.workletNode = new AudioWorkletNode(this.audioContext, 'pcm-processor');

    this.workletNode.port.onmessage = (event: MessageEvent) => {
      const float32 = event.data as Float32Array;
      const int16 = new Int16Array(float32.length);
      for (let i = 0; i < float32.length; i++) {
        const s = Math.max(-1, Math.min(1, float32[i]));
        int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
      }
      const bytes = new Uint8Array(int16.buffer);
      let binary = '';
      for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      const base64 = btoa(binary);
      this.onData?.(base64);
    };

    source.connect(this.workletNode);
    this.workletNode.connect(this.audioContext.destination);
  }

  getAnalyser(): AnalyserNode | null {
    return this.analyser;
  }

  stop(): void {
    this.workletNode?.disconnect();
    this.analyser?.disconnect();
    this.stream?.getTracks().forEach((t) => t.stop());
    this.audioContext?.close();
    this.workletNode = null;
    this.analyser = null;
    this.stream = null;
    this.audioContext = null;
  }
}
