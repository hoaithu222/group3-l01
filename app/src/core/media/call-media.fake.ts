import type {
  CallMediaConnectOptions,
  CallMediaConnectionState,
  CallMediaEvent,
  CallMediaParticipant,
  CallMediaPort,
} from './call-media.types';

/**
 * Bản GIẢ của `CallMediaPort` — dùng trong test (điều khiển tay: `emit`, `failNextConnect`) và làm mẫu hành vi cho
 * adapter thật. ⛔ KHÔNG dùng làm phương án dự phòng ở production: "kết nối thành công" mà không có âm thanh là lời nói dối.
 */
export class FakeCallMedia implements CallMediaPort {
  private state: CallMediaConnectionState = 'idle';
  private mic = false;
  private camera = false;
  private failure: Error | null = null;
  private readonly listeners = new Set<(event: CallMediaEvent) => void>();
  readonly connectCalls: CallMediaConnectOptions[] = [];
  disconnectCalls = 0;
  speakerOn = false;

  failNextConnect(error: Error): void {
    this.failure = error;
  }

  async connect(options: CallMediaConnectOptions): Promise<void> {
    this.connectCalls.push(options);
    this.state = 'connecting';
    if (this.failure) {
      const error = this.failure;
      this.failure = null;
      this.state = 'disconnected';
      throw error;
    }
    this.mic = options.audio;
    this.camera = options.video;
    this.state = 'connected';
    this.emit({ type: 'connected' });
    this.emit({ participants: [this.local()], type: 'participants' });
  }

  async disconnect(): Promise<void> {
    this.disconnectCalls += 1;
    if (this.state === 'idle' || this.state === 'disconnected') return;
    this.state = 'disconnected';
    this.mic = false;
    this.camera = false;
    this.emit({ reason: 'client', type: 'disconnected' });
  }

  async flipCamera(): Promise<void> {}

  getState(): CallMediaConnectionState {
    return this.state;
  }

  renderVideo(): null {
    return null;
  }

  async setCameraEnabled(enabled: boolean): Promise<boolean> {
    this.camera = enabled;
    return this.camera;
  }

  async setMicrophoneEnabled(enabled: boolean): Promise<boolean> {
    this.mic = enabled;
    return this.mic;
  }

  async setSpeakerOn(on: boolean): Promise<void> {
    this.speakerOn = on;
  }

  subscribe(listener: (event: CallMediaEvent) => void): () => void {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  }

  /** Test: phát sự kiện như SDK thật. */
  emit(event: CallMediaEvent): void {
    for (const listener of [...this.listeners]) listener(event);
  }

  get listenerCount(): number {
    return this.listeners.size;
  }

  private local(): CallMediaParticipant {
    return {
      cameraEnabled: this.camera,
      identity: 'me',
      isLocal: true,
      isSpeaking: false,
      micEnabled: this.mic,
      videoRef: null,
    };
  }
}
