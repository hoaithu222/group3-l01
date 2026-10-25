import type { CallMediaConnectionState } from '@/core/media/call-media.types';

import { MeetingMediaEmitter } from './meeting-media.emitter';
import type { MeetingConnectOptions, MeetingMediaEvent, MeetingMediaParticipant, MeetingMediaPort } from './meeting-media.types';

/**
 * Bản GIẢ của `MeetingMediaPort` — dùng trong test (điều khiển tay: `emit`, `failNextConnect`, `setParticipants`) và làm mẫu hành vi
 * cho adapter thật. ⛔ KHÔNG dùng làm phương án dự phòng ở production: "kết nối thành công" mà không có âm thanh là lời nói dối.
 * Người trong phòng mẫu: `fakeParticipant` ở `tests/fixtures.ts`.
 */
export class FakeMeetingMedia implements MeetingMediaPort {
  private readonly events = new MeetingMediaEmitter();
  private failure: Error | null = null;
  private participantList: MeetingMediaParticipant[] = [];
  private state: CallMediaConnectionState = 'idle';
  readonly connectCalls: MeetingConnectOptions[] = [];
  readonly reactions: string[] = [];
  readonly subscriptions: (readonly string[])[] = [];
  camera = false;
  disconnectCalls = 0;
  flipCalls = 0;
  handRaisedAt: string | null = null;
  holdHandEcho = false;
  mic = false;
  previewCalls = 0;
  previewing = false;
  screenShare = false;
  /** `true` = mô phỏng thiết bị chia sẻ được màn hình. */
  screenShareSupported = true;
  speakerOn = false;

  get listenerCount(): number {
    return this.events.size;
  }

  failNextConnect(error: Error): void {
    this.failure = error;
  }

  connect(options: MeetingConnectOptions): Promise<void> {
    this.connectCalls.push(options);
    if (this.failure) {
      const error = this.failure;
      this.failure = null;
      this.state = 'disconnected';
      return Promise.reject(error);
    }
    this.mic = options.audio;
    this.camera = options.video;
    this.state = 'connected';
    this.emit({ type: 'connected' });
    this.emit({ participants: this.participantList, type: 'participants' });
    return Promise.resolve();
  }

  disconnect(): Promise<void> {
    this.disconnectCalls += 1;
    if (this.state !== 'idle' && this.state !== 'disconnected') {
      this.state = 'disconnected';
      this.mic = false;
      this.camera = false;
      this.emit({ reason: 'client', type: 'disconnected' });
    }
    return Promise.resolve();
  }

  flipCamera(): Promise<void> {
    this.flipCalls += 1;
    return Promise.resolve();
  }

  getState(): CallMediaConnectionState {
    return this.state;
  }

  renderVideo(): null {
    return null;
  }

  sendReaction(emoji: string): Promise<void> {
    this.reactions.push(emoji);
    return Promise.resolve();
  }

  setCameraEnabled(enabled: boolean): Promise<boolean> {
    this.camera = enabled;
    return Promise.resolve(enabled);
  }

  /** Như LiveKit: server echo ⇒ attribute người CỤC BỘ đổi + snapshot mới. Test đặt `holdHandEcho` (mạng chậm) rồi tự gọi `echoHand()`. */
  setHandRaised(at: string | null): Promise<void> {
    this.handRaisedAt = at;
    if (!this.holdHandEcho) this.echoHand();
    return Promise.resolve();
  }

  echoHand(): void {
    if (!this.participantList.some((p) => p.isLocal)) return;
    this.setParticipants(this.participantList.map((p) => (p.isLocal ? { ...p, handRaisedAt: this.handRaisedAt } : p)));
  }

  setMicrophoneEnabled(enabled: boolean): Promise<boolean> {
    this.mic = enabled;
    return Promise.resolve(enabled);
  }

  get setScreenShareEnabled(): ((enabled: boolean) => Promise<boolean>) | null {
    if (!this.screenShareSupported) return null;
    return (enabled) => {
      this.screenShare = enabled;
      return Promise.resolve(enabled);
    };
  }

  setSpeakerOn(on: boolean): Promise<void> {
    this.speakerOn = on;
    return Promise.resolve();
  }

  setVideoSubscriptions(identities: readonly string[]): void {
    this.subscriptions.push([...identities]);
  }

  startPreview(): Promise<unknown> {
    this.previewing = true;
    this.previewCalls += 1;
    return Promise.resolve({ preview: true });
  }

  stopPreview(): Promise<void> {
    this.previewing = false;
    return Promise.resolve();
  }

  subscribe(listener: (event: MeetingMediaEvent) => void): () => void {
    return this.events.subscribe(listener);
  }

  /** Test: phát sự kiện như SDK thật. */
  emit(event: MeetingMediaEvent): void {
    this.events.emit(event);
  }

  /** Test: đặt danh sách người trong phòng và phát snapshot. */
  setParticipants(participants: MeetingMediaParticipant[]): void {
    this.participantList = participants;
    this.emit({ participants, type: 'participants' });
  }
}
