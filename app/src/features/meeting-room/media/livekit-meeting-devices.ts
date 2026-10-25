import { Platform } from 'react-native';

import type * as LiveKitSdk from 'livekit-client';

import { speakerOutputId, type LiveKitModule, type LiveKitNative } from '@/core/media/livekit-loader';

import { publishReaction, restartCameraFacing, type Facing } from './livekit-meeting-controls';
import { HAND_ATTRIBUTE } from './livekit-meeting-snapshot';

/** Những gì adapter đang giữ tại thời điểm gọi (rỗng khi chưa/không còn kết nối). */
export interface RoomContext {
  native: LiveKitNative | null;
  room: LiveKitSdk.Room | null;
  sdk: LiveKitModule | null;
}

/**
 * Thiết bị CỤC BỘ trong phòng đang kết nối — mic, camera, đổi camera, chia sẻ màn hình, giơ tay, loa, cảm xúc. Tách khỏi adapter để mỗi
 * file ≤ 150 dòng; chỉ đọc `context()` (không giữ `Room`) nên không bao giờ thao tác trên phòng đã bỏ. Mọi thay đổi track gọi `refresh`
 * để adapter phát lại snapshot người trong phòng.
 */
export class LiveKitDevices {
  facing: Facing = 'front';

  constructor(
    private readonly context: () => RoomContext,
    private readonly refresh: () => void,
  ) {}

  async flipCamera(): Promise<void> {
    const { room, sdk } = this.context();
    if (!room || !sdk) return;
    this.facing = this.facing === 'front' ? 'back' : 'front';
    await restartCameraFacing(room, sdk, this.facing);
  }

  async react(emoji: string): Promise<void> {
    const { room } = this.context();
    if (room) await publishReaction(room, emoji);
  }

  async setCamera(enabled: boolean): Promise<boolean> {
    const local = this.context().room?.localParticipant;
    await local?.setCameraEnabled(enabled);
    this.refresh();
    return local?.isCameraEnabled ?? false;
  }

  /**
   * ⚠️ livekit-client 2.22 `setAttributes` → `requestMetadataUpdate`: gửi yêu cầu rồi THĂM DÒ `localParticipant.attributes` tới khi server
   * echo; quá 5 s thì reject `SignalRequestError` lý do `'TimeoutError'` dù server VẪN có thể áp dụng sau đó ⇒ quá hạn KHÔNG phải thất bại:
   * resolve, để snapshot/hạn chờ của `hooks/meeting-room.hand.ts` đối soát. Lỗi khác (`NOT_ALLOWED`, mất kết nối) mới là bị từ chối thật.
   * Luôn phát lại snapshot sau cùng: store thấy attribute THẬT kể cả khi giá trị không đổi (LiveKit không phát sự kiện nào).
   */
  async setHandRaised(at: string | null): Promise<void> {
    const { room, sdk } = this.context();
    if (!room || !sdk) return;
    try {
      await room.localParticipant.setAttributes({ [HAND_ATTRIBUTE]: at ?? '' });
    } catch (error) {
      if (!(error instanceof sdk.SignalRequestError && error.reason === 'TimeoutError')) throw error;
    } finally {
      this.refresh();
    }
  }

  async setMicrophone(enabled: boolean): Promise<boolean> {
    const local = this.context().room?.localParticipant;
    await local?.setMicrophoneEnabled(enabled);
    this.refresh();
    return local?.isMicrophoneEnabled ?? false;
  }

  /** Android: MediaProjection + foreground service (p2-02). iOS cần Broadcast Upload Extension — chưa có ⇒ `null` (UI ẩn nút, README §10). */
  get screenShare(): ((enabled: boolean) => Promise<boolean>) | null {
    if (Platform.OS !== 'android') return null;
    return async (enabled) => {
      const local = this.context().room?.localParticipant;
      await local?.setScreenShareEnabled(enabled);
      this.refresh();
      return local?.isScreenShareEnabled ?? false;
    };
  }

  async setSpeaker(on: boolean): Promise<void> {
    await this.context().native?.AudioSession.selectAudioOutput(speakerOutputId(on)).catch(() => undefined);
  }
}
