import { createElement, type ReactNode } from 'react';

import type * as LiveKitSdk from 'livekit-client';

import type {
  CallMediaConnectOptions,
  CallMediaConnectionState,
  CallMediaEvent,
  CallMediaPort,
  CallVideoStyle,
} from './call-media.types';
import { loadLiveKit, speakerOutputId, startCallAudio, type LiveKitModule, type LiveKitNative } from './livekit-loader';
import { snapshotOf } from './livekit-participants';
import { bindRoomEvents } from './livekit-room-events';

/**
 * Adapter LiveKit của `CallMediaPort` (nạp SDK lười — xem `livekit-loader.ts`).
 *
 * ⚠️ CHƯA XÁC MINH trên dev-client/thiết bị thật (p0-08 spike chưa chạy): viết theo `livekit-client@2.22` +
 * `@livekit/react-native@3.0` + `@livekit/react-native-webrtc@144`. Cấu hình native (plugin quyền, foreground
 * service Android) thuộc p0-08/p2-02.
 */
class LiveKitCallMedia implements CallMediaPort {
  private room: LiveKitSdk.Room | null = null;
  private sdk: LiveKitModule | null = null;
  private native: LiveKitNative | null = null;
  private state: CallMediaConnectionState = 'idle';
  private facing: 'environment' | 'user' = 'user';
  private readonly listeners = new Set<(event: CallMediaEvent) => void>();

  async connect(options: CallMediaConnectOptions): Promise<void> {
    await this.disconnect();
    [this.sdk, this.native] = await loadLiveKit();
    this.state = 'connecting';
    await startCallAudio(this.native);
    const room = new this.sdk.Room({
      adaptiveStream: true,
      dynacast: true,
      publishDefaults: { simulcast: true, videoCodec: 'vp8' },
    });
    this.room = room;
    this.bind(room, this.sdk);
    try {
      await room.connect(options.url, options.token);
      // Chỉ bật mic/camera khi tầng UI đã xin được quyền (không tự bật khi người dùng chưa cho phép).
      if (options.audio) await room.localParticipant.setMicrophoneEnabled(true);
      if (options.video) await room.localParticipant.setCameraEnabled(true);
    } catch (error) {
      await this.disconnect();
      throw error;
    }
    this.state = 'connected';
    this.emit({ type: 'connected' });
    this.publishSnapshot();
  }

  async disconnect(): Promise<void> {
    const room = this.room;
    this.room = null;
    if (room) {
      // `disconnect(true)` dừng cả track mic/camera — không giữ đèn camera sau khi rời (VC-07).
      await room.disconnect(true).catch(() => undefined);
      await this.native?.AudioSession.stopAudioSession().catch(() => undefined);
    }
    if (this.state !== 'idle') this.state = 'disconnected';
  }

  async flipCamera(): Promise<void> {
    if (!this.room || !this.sdk) return;
    const publication = this.room.localParticipant.getTrackPublication(this.sdk.Track.Source.Camera);
    if (!publication?.videoTrack) return;
    this.facing = this.facing === 'user' ? 'environment' : 'user';
    await publication.videoTrack.restartTrack({ facingMode: this.facing });
  }

  getState(): CallMediaConnectionState {
    return this.state;
  }

  renderVideo(videoRef: unknown, style: CallVideoStyle = {}): ReactNode {
    const VideoTrack = this.native?.VideoTrack;
    if (!VideoTrack || !videoRef) return null;
    return createElement(VideoTrack, {
      mirror: style.mirror,
      objectFit: style.objectFit ?? 'cover',
      // ⛔ PHỦ TUYỆT ĐỐI, không phải `flex: 1` (lỗi đã sửa 01/10/2026): `VideoTrack` không có kích
      // thước nội tại, `flex: 1` chỉ nở theo trục CHÍNH — đặt trong khung `items-center` (đúng như ô
      // người tham gia đang làm) thì bề rộng tính ra **0** và màn hình đen, không lỗi nào báo.
      style: { bottom: 0, left: 0, position: 'absolute', right: 0, top: 0 },
      trackRef: videoRef as never,
    });
  }

  async setCameraEnabled(enabled: boolean): Promise<boolean> {
    await this.room?.localParticipant.setCameraEnabled(enabled);
    this.publishSnapshot();
    return this.room?.localParticipant.isCameraEnabled ?? false;
  }

  async setMicrophoneEnabled(enabled: boolean): Promise<boolean> {
    await this.room?.localParticipant.setMicrophoneEnabled(enabled);
    this.publishSnapshot();
    return this.room?.localParticipant.isMicrophoneEnabled ?? false;
  }

  async setSpeakerOn(on: boolean): Promise<void> {
    await this.native?.AudioSession.selectAudioOutput(speakerOutputId(on)).catch(() => undefined);
  }

  subscribe(listener: (event: CallMediaEvent) => void): () => void {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  }

  private bind(room: LiveKitSdk.Room, sdk: LiveKitModule): void {
    bindRoomEvents(room, sdk.RoomEvent, {
      isCurrent: () => this.room === room,
      onDisconnected: (reason) => {
        this.state = 'disconnected';
        this.emit({ reason, type: 'disconnected' });
      },
      onReconnected: () => {
        this.state = 'connected';
        this.emit({ type: 'reconnected' });
      },
      onReconnecting: () => {
        this.state = 'reconnecting';
        this.emit({ type: 'reconnecting' });
      },
      refresh: () => this.publishSnapshot(),
    });
  }

  private publishSnapshot(): void {
    if (!this.room || !this.sdk) return;
    this.emit({ participants: snapshotOf(this.room, this.sdk.Track.Source.Camera), type: 'participants' });
  }

  private emit(event: CallMediaEvent): void {
    for (const listener of [...this.listeners]) listener(event);
  }
}

export function createLiveKitCallMedia(): CallMediaPort {
  return new LiveKitCallMedia();
}
