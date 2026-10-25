import type { ReactNode } from 'react';

import type * as LiveKitSdk from 'livekit-client';

import type { CallMediaConnectionState, CallVideoStyle } from '@/core/media/call-media.types';
import { loadLiveKit, startCallAudio, type LiveKitModule, type LiveKitNative } from '@/core/media/livekit-loader';

import { REACTION_EMOJIS } from '../constants/meeting-room.constants';
import { createPreview, roomOptionsFor, videoElement, type Facing } from './livekit-meeting-controls';
import { LiveKitDevices } from './livekit-meeting-devices';
import { bindMeetingRoomEvents } from './livekit-meeting-events';
import { parseReaction, snapshotOf } from './livekit-meeting-snapshot';
import { VideoSubscriptions } from './livekit-video-subscriptions';
import { MeetingMediaEmitter } from './meeting-media.emitter';
import type { MeetingConnectOptions, MeetingMediaEvent, MeetingMediaPort } from './meeting-media.types';
import { pinTracks, SnapshotPump } from './meeting-snapshot-pump';

/**
 * Adapter LiveKit của `MeetingMediaPort` (nạp SDK lười — `loadLiveKit` của `core/media`). Vòng đời + sự kiện + xem trước ở đây; thiết bị cục
 * bộ (mic/camera/chia sẻ/giơ tay/loa/cảm xúc) do `LiveKitDevices`; subscribe video theo trang do `VideoSubscriptions`; snapshot người trong
 * phòng đi qua `SnapshotPump` (gộp sự kiện dồn dập, bỏ bản trùng).
 * ⚠️ CHƯA XÁC MINH trên dev-client/thiết bị thật (spike p0-08/p2-02 chưa chạy): camera/mic/chia sẻ màn hình, subscribe theo trang,
 * data channel, PiP. Viết theo `livekit-client@2.22` + `@livekit/react-native@3.0` + `@livekit/react-native-webrtc@144`.
 */
class LiveKitMeetingMedia implements MeetingMediaPort {
  private readonly context = () => ({ native: this.native, room: this.room, sdk: this.sdk });
  // Thao tác của CHÍNH MÌNH (bật/tắt mic, camera, chia sẻ) dựng snapshot NGAY — nút phải theo track thật tức thì.
  private readonly devices = new LiveKitDevices(this.context, () => this.snapshots.flush());
  private readonly events = new MeetingMediaEmitter();
  private readonly snapshots = new SnapshotPump(
    () => (this.room && this.sdk ? pinTracks(snapshotOf(this.room, this.sdk)) : null),
    (participants) => this.events.emit({ participants, type: 'participants' }),
  );
  private readonly videos = new VideoSubscriptions(this.context);
  /** Tăng mỗi lần `disconnect()` — lượt `connect` đang chuẩn bị mà thấy số đổi thì tự bỏ (đã rời giữa chừng). */
  private epoch = 0;
  private native: LiveKitNative | null = null;
  private preview: LiveKitSdk.LocalVideoTrack | null = null;
  private room: LiveKitSdk.Room | null = null;
  private sdk: LiveKitModule | null = null;
  private state: CallMediaConnectionState = 'idle';
  private unbind: (() => void) | null = null;

  async connect(options: MeetingConnectOptions): Promise<void> {
    const epoch = this.epoch;
    // ⚠️ Bỏ phòng cũ nhưng GIỮ phiên âm thanh: dừng rồi bật lại liền nhau là đua trên Android — `AudioSwitchManager.stop()` hẹn việc dừng sang
    // luồng chính, `start()` ngay sau thấy phiên cũ chưa dừng nên bỏ qua ⇒ nối lại xong KHÔNG còn phiên âm thanh (mất focus/chế độ thoại).
    await this.closeRoom();
    [this.sdk, this.native] = await loadLiveKit();
    this.state = 'connecting';
    this.devices.facing = options.facing;
    await startCallAudio(this.native, options.speaker === false ? 'earpiece' : 'speaker');
    if (epoch !== this.epoch) {
      await this.native.AudioSession.stopAudioSession().catch(() => undefined); // đã rời trong lúc chuẩn bị: trả phiên âm thanh vừa bật
      return;
    }
    const room = new this.sdk.Room(roomOptionsFor(this.sdk, options.facing));
    this.room = room;
    this.unbind = this.bind(room, this.sdk);
    try {
      await room.connect(options.url, options.token);
      // Không tự bật mic/camera: chỉ bật khi tầng UI đã xin được quyền VÀ người dùng chọn bật ở pre-join (app.md §7).
      if (options.audio) await room.localParticipant.setMicrophoneEnabled(true);
      if (options.video) await room.localParticipant.setCameraEnabled(true);
    } catch (error) {
      if (this.room === room) await this.disconnect(); // phòng đã bị thay giữa chừng thì thôi — dọn là ngắt nhầm phòng MỚI
      throw error;
    }
    if (this.room !== room) return; // đã rời trong lúc nối: không báo "đã kết nối" cho một phòng đã bỏ
    this.mark('connected', { type: 'connected' });
    this.snapshots.flush(true);
  }

  async disconnect(): Promise<void> {
    this.epoch += 1;
    this.videos.reset();
    await this.stopPreview();
    if (await this.closeRoom()) await this.native?.AudioSession.stopAudioSession().catch(() => undefined);
    if (this.state !== 'idle') this.state = 'disconnected';
  }

  flipCamera = (): Promise<void> => this.devices.flipCamera();
  getState = (): CallMediaConnectionState => this.state;
  renderVideo = (videoRef: unknown, style: CallVideoStyle = {}): ReactNode => videoElement(this.native, videoRef, style);
  sendReaction = (emoji: string): Promise<void> => this.devices.react(emoji);
  setCameraEnabled = (enabled: boolean): Promise<boolean> => this.devices.setCamera(enabled);
  setHandRaised = (at: string | null): Promise<void> => this.devices.setHandRaised(at);
  setMicrophoneEnabled = (enabled: boolean): Promise<boolean> => this.devices.setMicrophone(enabled);
  setSpeakerOn = (on: boolean): Promise<void> => this.devices.setSpeaker(on);
  setVideoSubscriptions = (identities: readonly string[]): void => this.videos.set(identities);
  subscribe = (listener: (event: MeetingMediaEvent) => void): (() => void) => this.events.subscribe(listener);

  get setScreenShareEnabled(): ((enabled: boolean) => Promise<boolean>) | null {
    return this.devices.screenShare;
  }

  async startPreview(facing: Facing): Promise<unknown> {
    await this.stopPreview();
    const { ref, track } = await createPreview((this.sdk ??= (await loadLiveKit())[0]), facing);
    this.preview = track;
    return ref;
  }

  async stopPreview(): Promise<void> {
    this.preview?.stop();
    this.preview = null;
  }

  /** Bỏ phòng hiện tại: gỡ listener, huỷ snapshot/subscribe đang hẹn, ngắt + dừng track. KHÔNG đụng phiên âm thanh. `true` = có phòng để bỏ. */
  private async closeRoom(): Promise<boolean> {
    const room = this.room;
    this.room = null;
    this.unbind?.();
    this.unbind = null;
    this.snapshots.reset();
    this.videos.reset(false);
    if (!room) return false;
    // `disconnect(true)` dừng cả track mic/camera — không giữ đèn camera sau khi rời (VC-07).
    await room.disconnect(true).catch(() => undefined);
    return true;
  }

  private bind(room: LiveKitSdk.Room, sdk: LiveKitModule): () => void {
    return bindMeetingRoomEvents(room, sdk.RoomEvent, {
      isCurrent: () => this.room === room,
      onDisconnected: (reason) => this.mark('disconnected', { reason, type: 'disconnected' }),
      onReaction: (identity, payload) => {
        const emoji = parseReaction(payload, REACTION_EMOJIS);
        if (emoji) this.events.emit({ at: Date.now(), emoji, identity, type: 'reaction' });
      },
      onReconnected: () => {
        this.mark('connected', { type: 'reconnected' });
        this.snapshots.flush();
      },
      onReconnecting: () => this.mark('reconnecting', { type: 'reconnecting' }),
      onTrackPublished: () => this.videos.apply(),
      refresh: () => this.snapshots.schedule(),
      refreshNow: () => this.snapshots.flush(),
    });
  }

  private mark(state: CallMediaConnectionState, event: MeetingMediaEvent): void {
    this.state = state;
    this.events.emit(event);
  }
}

export function createLiveKitMeetingMedia(): MeetingMediaPort {
  return new LiveKitMeetingMedia();
}
