import type { ReactNode } from 'react';

import type {
  CallMediaConnectionState,
  CallMediaDisconnectReason,
  CallVideoStyle,
} from '@/core/media/call-media.types';

/**
 * CỔNG media của PHÒNG HỌP — mở rộng `CallMediaPort` (p0-08 `core/media`) bằng thứ cuộc họp cần mà cuộc gọi 1-1 không cần: tên người
 * tham gia, giơ tay (participant attribute), chia sẻ màn hình, chất lượng mạng, cảm xúc (data channel), chọn video nào được subscribe
 * (lưới phân trang — chỉ nhận video của trang đang xem), xem trước camera trước khi vào. Lý do đặt trong feature: `core/media` là của
 * p0-08/p2-02, cổng cuộc gọi giữ nguyên; adapter dùng LẠI `loadLiveKit`/`startCallAudio` của `core/media`.
 *
 * ⚠️ CHƯA XÁC MINH trên thiết bị thật (cần dev-client + LiveKit staging): mọi hành vi WebRTC/camera/mic/chia sẻ màn hình. Test dùng
 * `FakeMeetingMedia` (điều khiển tay) — không nạp SDK native.
 */

export type ConnectionQuality = 'excellent' | 'good' | 'lost' | 'poor' | 'unknown';

export interface MeetingMediaParticipant {
  cameraEnabled: boolean;
  connectionQuality: ConnectionQuality;
  /** Attribute `handRaisedAt` (ISO) do CHÍNH người đó đặt — `null` = hạ tay. */
  handRaisedAt: string | null;
  identity: string;
  isLocal: boolean;
  isSpeaking: boolean;
  micEnabled: boolean;
  name: string;
  /** Mảnh mờ đục do adapter cấp cho `renderVideo` — UI KHÔNG đọc nội dung. `null` = không có video. */
  screenShareRef: unknown;
  videoRef: unknown;
}

export type MeetingMediaEvent =
  | { participants: MeetingMediaParticipant[]; type: 'participants' }
  | { reason: CallMediaDisconnectReason; type: 'disconnected' }
  | { type: 'connected' }
  | { type: 'reconnected' }
  | { type: 'reconnecting' }
  | { at: number; emoji: string; identity: string; type: 'reaction' };

export interface MeetingConnectOptions {
  /** `true` = bật mic ngay (đã có quyền); `false` = vào ở chế độ mic tắt. */
  audio: boolean;
  facing: 'back' | 'front';
  /**
   * Đường ra âm thanh ƯU TIÊN lúc nối (`speakerOn` của store): `true`/bỏ trống = loa ngoài, `false` = loa trong. Chỉ là thứ tự ưu tiên —
   * tai nghe dây/Bluetooth đang cắm vẫn được chọn (không ép loa như `setSpeakerOn`, vốn để người dùng tự đổi trong phòng).
   */
  speaker?: boolean;
  token: string;
  url: string;
  video: boolean;
}

export interface MeetingMediaPort {
  connect: (options: MeetingConnectOptions) => Promise<void>;
  /** Idempotent. Dừng MỌI track (không giữ camera sau khi rời — VC-07) và tắt phiên âm thanh. */
  disconnect: () => Promise<void>;
  flipCamera: () => Promise<void>;
  getState: () => CallMediaConnectionState;
  renderVideo: (videoRef: unknown, style?: CallVideoStyle) => ReactNode;
  /** Gửi cảm xúc (data topic `meeting.reaction`, `reliable=false`) — throttle do hook lo. */
  sendReaction: (emoji: string) => Promise<void>;
  setCameraEnabled: (enabled: boolean) => Promise<boolean>;
  /** Đặt/xoá attribute `handRaisedAt` của chính mình (ISO hoặc `null`). */
  setHandRaised: (at: string | null) => Promise<void>;
  setMicrophoneEnabled: (enabled: boolean) => Promise<boolean>;
  /** `null` = thiết bị/bản dựng không chia sẻ được màn hình → UI ẩn nút (iOS cần Broadcast Extension — theo spike p2-02). */
  setScreenShareEnabled: ((enabled: boolean) => Promise<boolean>) | null;
  setSpeakerOn: (on: boolean) => Promise<void>;
  /**
   * Chỉ subscribe VIDEO (camera/chia sẻ) của các identity này; âm thanh luôn nhận từ mọi người. Gọi lại với danh sách mới mỗi khi
   * trang lưới/ghim đổi (app.md §6 "Subscribe").
   */
  setVideoSubscriptions: (identities: readonly string[]) => void;
  /** Xem trước camera cục bộ TRƯỚC khi vào phòng — trả mảnh mờ đục cho `renderVideo`, `null` khi không mở được. */
  startPreview: (facing: 'back' | 'front') => Promise<unknown>;
  stopPreview: () => Promise<void>;
  /** Mỗi người đăng ký có hàm huỷ RIÊNG — ⛔ không `removeAllListeners` (bài học Sun). */
  subscribe: (listener: (event: MeetingMediaEvent) => void) => () => void;
}
