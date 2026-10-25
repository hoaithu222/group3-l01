/**
 * Kiểu DTO phòng thoại kênh VOICE (BE `voice-preview.service.ts`, `call-host.service.ts`, p2-03 be.md §4) — khai TAY khớp mã BE thật.
 * Cuộc gọi của phòng dùng lại `CallDto`/`CreateCallResult` của `calls` (`mode: 'ROOM'`, `scopeType: 'CHANNEL'`).
 */

/** Lý do `myActions.canJoin = false` của preview (client chỉ vẽ nút theo đây, không tự suy quyền). */
export type JoinBlockedReason = 'ARCHIVED' | 'FULL' | 'REMOVED';

export interface VoicePreviewParticipant {
  avatarUrl: string | null;
  cameraEnabled: boolean;
  handRaisedAt: string | null;
  isHost: boolean;
  /** ⚠️ QUYỀN phát mic (chủ phòng chưa chặn), không phải mic đang bật — BE chưa có snapshot track thật (be.md, điểm lệch #4). */
  micEnabled: boolean;
  name: string;
  sharingScreen: boolean;
  userId: string;
}

export interface VoicePreview {
  call: { hostId: string | null; id: string; startedAt: string; version: number } | null;
  channel: { id: string; name: string; voiceSettings: { allowVideo: boolean; maxParticipants: number } };
  limits: { maxParticipants: number; maxScreenShares: number };
  myActions: { canJoin: boolean; joinBlockedReason?: JoinBlockedReason };
  participants: VoicePreviewParticipant[];
  seatsLeft: number;
  serverNow: string;
}

/**
 * Thao tác của chủ phòng (BE `POST /calls/:id/host/:action`). Khai dạng UPPER_SNAKE (cùng kiểu `call:host-action.type`); đường dẫn dựng ở
 * `hostActionSlug` (`voice-room.api.ts`) — chuỗi thường viết dấu gạch (`block-audio`…) giống hệt một class Tailwind nên `check:classes`
 * báo nhầm "class chết" ở mọi nơi nó xuất hiện.
 */
export type HostAction =
  | 'BLOCK_AUDIO'
  | 'END'
  | 'END_SHARE'
  | 'INVITE_SPEAK'
  | 'MUTE_REQUEST'
  | 'REMOVE'
  | 'TRANSFER'
  | 'UNBLOCK_AUDIO';

export interface HostActionPayload {
  /** Bắt buộc khi ≠ `end`. */
  targetUserId?: string;
  /** `Call.version` client đang biết — lệch → 409 `CALL_011` (refetch rồi thử lại). */
  expectedVersion: number;
  reason?: string;
}

export interface LeaveRoomPayload {
  /** Chủ phòng chọn người nhận quyền (phải đang KẾT NỐI trong phòng, không phải mình) — `CALL_019` nếu không hợp lệ. */
  transferToUserId?: string;
  /** Chủ phòng "Kết thúc cho mọi người". */
  endForEveryone?: boolean;
}
