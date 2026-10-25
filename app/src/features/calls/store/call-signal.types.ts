import type {
  CallDirection,
  CallDto,
  CallEndReason,
  CallParticipantRole,
  CallParticipantState,
  CallToken,
  IncomingCallView,
} from '../api/calls.types';

/** Pha của cuộc gọi phía client (app.md p2-01 §5.1) — `ended` giữ ~2 giây để vẽ "Cuộc gọi đã kết thúc" rồi về `idle`. */
export type CallPhase = 'idle' | 'outgoing' | 'incoming' | 'connecting' | 'active' | 'ended';

/** Lý do kết thúc phía client = lý do của BE + các lý do CHỈ client biết. */
export type CallEndedReason =
  | CallEndReason
  | 'ANSWERED_ELSEWHERE'
  | 'CANCELLED_LOCAL'
  | 'CONNECT_FAILED'
  | 'DECLINED_ELSEWHERE'
  | 'DECLINED_LOCAL'
  | 'LEFT'
  /** Phòng thoại kênh (p2-03): cùng tài khoản vào phòng từ máy khác (`force`) — máy này bị ngắt (`DUPLICATE_IDENTITY`). */
  | 'MOVED_DEVICE'
  /** Phòng thoại kênh (p2-03): chủ phòng mời ra khỏi phòng — không vào lại được PHIÊN này. */
  | 'REMOVED_BY_HOST'
  | 'SYNC_LOST';

export interface CallEndedInfo {
  at: number;
  durationSec: number | null;
  reason: CallEndedReason;
}

export interface CallParticipantPatch {
  /** Phòng ROOM (p2-03): BE gửi kèm tên/avatar để người vừa vào hiện ngay đúng tên — vắng thì giữ giá trị đang có. */
  avatarUrl?: string | null;
  handRaisedAt: string | null;
  mutedByHost: boolean;
  name?: string;
  role: CallParticipantRole;
  screenSharing?: boolean;
  state: CallParticipantState;
  userId: string;
}

/**
 * Tín hiệu vào máy trạng thái — MỘT luồng cho mọi nguồn (socket · REST · media · người dùng). Mỗi tín hiệu do server
 * phát mang `callId` + `version` để bộ hợp nhất bỏ tín hiệu cũ/của cuộc gọi khác (README p2-01 §5.3).
 */
export type CallSignal =
  | { type: 'START_BEGIN'; clientCallId: string }
  | { type: 'START_FAILED' }
  | { call: CallDto; joined: boolean; token: CallToken | null; type: 'START_OK' }
  | { expiresAt: string; serverNow: string; type: 'INCOMING'; version: number; view: IncomingCallView }
  | { type: 'ANSWER_BEGIN' }
  | { type: 'ANSWER_FAILED' }
  | { call: CallDto; token: CallToken | null; type: 'ANSWER_OK' }
  | { callId: string; type: 'ACCEPTED'; version: number }
  | { byMe: boolean; callId: string; type: 'DECLINED'; userId: string; version: number }
  | { callId: string; reason: 'CANCELLED' | 'NO_ANSWER'; type: 'CANCELLED'; version: number }
  | { callId: string; durationSec: number | null; endReason: CallEndReason; type: 'ENDED'; version: number }
  | { callId: string; type: 'ANSWERED_ELSEWHERE'; version: number }
  | { callId: string; participant: CallParticipantPatch; type: 'PARTICIPANT_UPDATED'; version: number }
  /** Phòng thoại kênh (p2-03): chủ phòng đổi (chuyển quyền/failover) — `hostId` là nguồn để biết ai là chủ phòng. */
  | { callId: string; hostId: string; type: 'HOST_CHANGED'; version: number }
  | { callId: string; type: 'REVOKED' }
  | { call: CallDto | null; type: 'SYNC' }
  | { type: 'MEDIA_CONNECTED' }
  | { type: 'MEDIA_FAILED' }
  | { token: CallToken; type: 'TOKEN_RENEWED' }
  | { reason: CallEndedReason; type: 'LOCAL_ENDED' }
  | { minimized: boolean; type: 'MINIMIZE' }
  | { type: 'DISMISS' }
  | { type: 'RESET' };

export interface CallSessionState {
  /** Đang gọi `answer` — chặn bấm đúp (`answeringDeviceLock` của README). */
  answering: boolean;
  call: CallDto | null;
  callId: string | null;
  /** Sinh KHI BẤM gọi, giữ để thử lại thủ công dùng lại cùng id (CL-09). */
  clientCallId: string | null;
  direction: CallDirection | null;
  endedInfo: CallEndedInfo | null;
  incoming: IncomingCallView | null;
  minimized: boolean;
  phase: CallPhase;
  /** Tín hiệu tới TRƯỚC khi REST tạo cuộc gọi trả về (không biết `callId`) — phát lại khi có. */
  pending: CallSignal[];
  /** `epoch ms` (đã quy về đồng hồ máy): quá hạn + 5 s mà không có tín hiệu thì hỏi lại BE. */
  ringExpiresAt: number | null;
  /** `serverNow − Date.now()` lúc nhận — hai máy hiển thị cùng một đồng hồ. */
  serverOffsetMs: number;
  starting: boolean;
  token: CallToken | null;
  version: number;
}

export const INITIAL_CALL_STATE: CallSessionState = {
  answering: false,
  call: null,
  callId: null,
  clientCallId: null,
  direction: null,
  endedInfo: null,
  incoming: null,
  minimized: false,
  pending: [],
  phase: 'idle',
  ringExpiresAt: null,
  serverOffsetMs: 0,
  starting: false,
  token: null,
  version: 0,
};
