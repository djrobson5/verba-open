/** Anything that wants a copy of the model's raw output audio (e.g. the Simli
 *  avatar, which animates lips from the same PCM we'd otherwise just play). */
export interface AudioSink {
  push(int16: Int16Array): void;
}

export class AudioPlayer {
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private gain: GainNode | null = null;
  private sink: AudioSink | null = null;
  private nextStartTime = 0;

  constructor() {
    if (typeof window !== 'undefined') {
      this.audioContext = new AudioContext({ sampleRate: 24000 });
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 64;
      this.analyser.smoothingTimeConstant = 0.5;
      // The gain sits after the analyser so muting local playback (when the
      // avatar carries the voice instead) still leaves the visualizer fed.
      this.gain = this.audioContext.createGain();
      this.gain.gain.value = 1;
      this.analyser.connect(this.gain);
      this.gain.connect(this.audioContext.destination);
    }
  }

  ensureContext(): void {
    if (this.audioContext?.state === 'suspended') {
      this.audioContext.resume();
    }
  }

  setMuted(muted: boolean): void {
    if (this.gain) this.gain.gain.value = muted ? 0 : 1;
  }

  setSink(sink: AudioSink | null): void {
    this.sink = sink;
  }

  addData(base64Pcm: string): void {
    if (!this.audioContext || !this.analyser) return;

    const binaryString = atob(base64Pcm);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    const int16 = new Int16Array(bytes.buffer);
    this.sink?.push(int16);

    const float32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) {
      float32[i] = int16[i] / 32768;
    }

    const audioBuffer = this.audioContext.createBuffer(1, float32.length, 24000);
    audioBuffer.getChannelData(0).set(float32);

    const currentTime = this.audioContext.currentTime;
    if (this.nextStartTime < currentTime) {
      this.nextStartTime = currentTime;
    }

    const source = this.audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(this.analyser);
    source.start(this.nextStartTime);
    this.nextStartTime += audioBuffer.duration;
  }

  getAnalyser(): AnalyserNode | null {
    return this.analyser;
  }

  clearQueue(): void {
    if (this.audioContext) {
      this.nextStartTime = this.audioContext.currentTime;
    }
  }

  stop(): void {
    this.clearQueue();
    this.sink = null;
    this.analyser?.disconnect();
    this.gain?.disconnect();
    this.audioContext?.close();
    this.analyser = null;
    this.gain = null;
    this.audioContext = null;
  }
}
