import { mediaErrors } from "./media.errors";
import type { IMediaServer, MediaPing } from "./media.types";

/**
 * Adapter khi LiveKit CHƯA cấu hình (`getLiveKit()` chọn tự động): không mạng, mọi thao tác ném `MEDIA_001`
 * (503) — giống `NoopPushSender` ở chỗ không chặn khởi động, khác ở chỗ KHÔNG nuốt lỗi (gọi/họp không thể
 * "giả vờ thành công"). Đường gọi/họp đã chặn trước bằng `requireFeature("voice"|"meeting")`.
 */
export class NoopMediaServer implements IMediaServer {
  readonly kind = "noop" as const;

  isConfigured(): boolean {
    return false;
  }

  createRoom = (): Promise<never> => Promise.reject(mediaErrors.notConfigured());
  listRooms = (): Promise<never> => Promise.reject(mediaErrors.notConfigured());
  deleteRoom = (): Promise<never> => Promise.reject(mediaErrors.notConfigured());
  listParticipants = (): Promise<never> => Promise.reject(mediaErrors.notConfigured());
  removeParticipant = (): Promise<never> => Promise.reject(mediaErrors.notConfigured());
  mutePublishedTrack = (): Promise<never> => Promise.reject(mediaErrors.notConfigured());
  updateParticipant = (): Promise<never> => Promise.reject(mediaErrors.notConfigured());
  startRoomCompositeEgress = (): Promise<never> => Promise.reject(mediaErrors.notConfigured());
  stopEgress = (): Promise<never> => Promise.reject(mediaErrors.notConfigured());
  listEgress = (): Promise<never> => Promise.reject(mediaErrors.notConfigured());

  ping(): Promise<MediaPing> {
    return Promise.reject(mediaErrors.notConfigured());
  }
}
