import type { ReactNode } from 'react';

/**
 * CỔNG (port) tới máy chủ media của cuộc gọi/cuộc họp — `core/` không biết LiveKit là gì ngoài file adapter
 * (`livekit-call-media.ts`). Lý do: (1) test bằng bản giả, không cần WebRTC native; (2) p2-02/p2-03/p2-05 dùng
 * LẠI cùng cổng; (3) SDK LiveKit là module NATIVE — không nạp được trong Expo Go/Jest, adapter nạp LƯỜI khi kết nối.
 *
 * Thiết kế KHÔNG phụ thuộc React (p0-08 app.md §5): store/hook sở hữu vòng đời, cổng chỉ là đối tượng điều khiển.
 */

export type CallMediaConnectionState =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'disconnected';

/** Lý do mất kết nối đã chuẩn hoá (không lộ kiểu của SDK ra ngoài `core/media`). */
export type CallMediaDisconnectReason =
  | 'client'
  | 'duplicate-identity'
  | 'error'
  | 'removed'
  | 'room-closed';

export interface CallMediaConnectOptions {
  /** `true` = xin mic ngay (đã có quyền); `false` = vào chế độ chỉ nghe. */
  audio: boolean;
  token: string;
  url: string;
  video: boolean;
}

export interface CallMediaParticipant {
  cameraEnabled: boolean;
  identity: string;
  isLocal: boolean;
  isSpeaking: boolean;
  micEnabled: boolean;
  /** Mảnh mờ đục do adapter cấp cho `renderVideo` — UI KHÔNG đọc nội dung. `null` = không có video. */
  videoRef: unknown;
}

export type CallMediaEvent =
  | { type: 'connected' }
  | { type: 'reconnecting' }
  | { type: 'reconnected' }
  | { reason: CallMediaDisconnectReason; type: 'disconnected' }
  | { participants: CallMediaParticipant[]; type: 'participants' };

export interface CallVideoStyle {
  mirror?: boolean;
  objectFit?: 'contain' | 'cover';
  /**
   * Lớp xếp chồng của video trên Android (`RTCView` = `SurfaceView`): `0` (mặc định) cho video nền, `1` (`setZOrderMediaOverlay`) cho ô
   * video NỔI đè lên video khác (ô tự xem góc màn). ⚠️ Hai `SurfaceView` chồng nhau cùng lớp 0 thì cái nào nằm trên là KHÔNG xác định —
   * ô tự xem có thể bị video lớn che mất. ⛔ Không dùng `2` (`setZOrderOnTop`): video đè cả giao diện RN (nút, sheet). iOS bỏ qua.
   * Hiện adapter PHÒNG HỌP truyền xuống `VideoTrack`; adapter cuộc gọi 1-1 chưa.
   */
  zOrder?: 0 | 1;
}

export interface CallMediaPort {
  connect: (options: CallMediaConnectOptions) => Promise<void>;
  /** Idempotent. Dừng MỌI track (không giữ camera sau khi rời — VC-07) và tắt phiên âm thanh. */
  disconnect: () => Promise<void>;
  flipCamera: () => Promise<void>;
  getState: () => CallMediaConnectionState;
  /** Vẽ video của một participant; `null` khi không có video hoặc cổng không hỗ trợ vẽ (bản giả). */
  renderVideo: (videoRef: unknown, style?: CallVideoStyle) => ReactNode;
  /** Trả giá trị THỰC SAU khi đổi (SDK có thể từ chối khi thiếu quyền). */
  setCameraEnabled: (enabled: boolean) => Promise<boolean>;
  setMicrophoneEnabled: (enabled: boolean) => Promise<boolean>;
  /** Loa ngoài ↔ loa trong (route âm thanh đầy đủ — Bluetooth… — thuộc p2-02). */
  setSpeakerOn: (on: boolean) => Promise<void>;
  /** Mỗi người đăng ký có hàm huỷ RIÊNG — ⛔ không `removeAllListeners` (bài học Sun). */
  subscribe: (listener: (event: CallMediaEvent) => void) => () => void;
}

/** Ném khi SDK media không dùng được (Expo Go, web, thiếu module native) — UI báo "cần bản dev-client". */
export class MediaUnavailableError extends Error {
  constructor(
    message = 'Bản dựng này chưa có module media (cần dev-client, không chạy trên Expo Go).',
  ) {
    super(message);
    this.name = 'MediaUnavailableError';
  }
}
