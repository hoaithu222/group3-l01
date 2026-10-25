/**
 * Kiểu DTO của module `calls` (BE `be/src/modules/calls/entities/call.interface.ts`, p2-01 be.md §5).
 *
 * ⚠️ Khai TAY, khớp mã BE thật (chưa có kiểu sinh OpenAPI — p0-09). Enum giữ NGUYÊN chuỗi của Prisma
 * (`CallEndReason` có cả `FORCE_ENDED`/`EMPTY`/`MAX_DURATION` mà README p2-01 chưa liệt kê) — thêm giá trị
 * mới ở BE thì chỉ cần sửa file này, phần còn lại rơi về nhánh mặc định.
 */

export type CallScopeType = 'CONVERSATION' | 'CHANNEL' | 'MEETING';
export type CallMode = 'RING' | 'ROOM';
export type CallMediaKind = 'AUDIO' | 'VIDEO';
export type CallStatus = 'RINGING' | 'ACTIVE' | 'ENDED';
export type CallEndReason =
  | 'COMPLETED'
  | 'CANCELLED'
  | 'NO_ANSWER'
  | 'DECLINED'
  | 'BUSY'
  | 'FAILED'
  | 'REVOKED'
  | 'ARCHIVED'
  | 'HOST_ENDED'
  | 'FORCE_ENDED'
  | 'EMPTY'
  | 'MAX_DURATION';
export type CallParticipantRole = 'INITIATOR' | 'HOST' | 'CO_HOST' | 'MEMBER';
export type CallParticipantState =
  | 'INVITED'
  | 'RINGING'
  | 'DECLINED'
  | 'MISSED'
  | 'BUSY'
  | 'JOINING'
  | 'CONNECTED'
  | 'RECONNECTING'
  | 'LEFT'
  | 'REMOVED';
export type CallOutcome =
  | 'COMPLETED'
  | 'MISSED'
  | 'DECLINED'
  | 'BUSY'
  | 'CANCELLED'
  | 'NO_ANSWER'
  | 'OUTGOING_UNANSWERED';
export type CallDirection = 'OUTGOING' | 'INCOMING';

/** Phạm vi CÓ THỂ bắt đầu cuộc gọi RING (BE `createCallSchema`: `MEETING` bị từ chối `CALL_013`). */
export type CallStartScopeType = 'CONVERSATION' | 'CHANNEL';

export interface CallScopeRef {
  scopeId: string;
  scopeType: CallStartScopeType;
}

export interface CallUserRef {
  avatarUrl: string | null;
  id: string;
  name: string;
}

export interface CallScopeInfo {
  avatarUrl: string | null;
  kind: 'DIRECT' | 'GROUP' | 'CHANNEL' | 'MEETING';
  title: string;
}

export interface CallParticipantDto {
  avatarUrl: string | null;
  handRaisedAt: string | null;
  mutedByHost: boolean;
  name: string;
  role: CallParticipantRole;
  /** Phòng thoại kênh (p2-03): đang giữ slot chia sẻ màn hình. Vắng ở cuộc gọi RING. */
  screenSharing?: boolean;
  state: CallParticipantState;
  userId: string;
}

/** `myActions` do SERVER tính — client chỉ vẽ nút, không tự suy từ vai trò (be.md §5.12). */
export interface MyCallActions {
  canAnswer: boolean;
  canCancel: boolean;
  canDecline: boolean;
  canEnd: boolean;
  canInvite: boolean;
  canJoin: boolean;
  canLeave: boolean;
}

export interface CallDto {
  answeredAt: string | null;
  /** UUID v5 tất định của `id` (be.md p2-02 §13.2) — CallKit (iOS)/ConnectionService (Android) dùng CHÍNH giá trị này, không tự tính lại. */
  callUuid: string;
  durationSec: number | null;
  endedAt: string | null;
  endReason: CallEndReason | null;
  hostId: string | null;
  id: string;
  initiator: CallUserRef;
  mediaKind: CallMediaKind;
  mode: CallMode;
  myActions: MyCallActions;
  participants: CallParticipantDto[];
  scope: CallScopeInfo;
  scopeId: string;
  scopeType: CallScopeType;
  serverNow: string;
  startedAt: string;
  status: CallStatus;
  version: number;
  workspaceId: string | null;
}

/** Bản rút gọn trong `call:incoming` — dựng theo GÓC NHÌN người nhận. */
export interface IncomingCallView {
  /** Cùng UUID với `CallDto.callUuid` — xem chú thích ở đó. */
  callUuid: string;
  id: string;
  initiator: CallUserRef;
  mediaKind: CallMediaKind;
  mode: CallMode;
  participantsPreview: CallUserRef[];
  scope: CallScopeInfo;
  scopeId: string;
  scopeType: CallScopeType;
  startedAt: string;
  version: number;
  workspaceId: string | null;
}

export interface CallHistoryItem {
  callId: string;
  direction: CallDirection;
  durationSec: number | null;
  mediaKind: CallMediaKind;
  mode: CallMode;
  outcome: CallOutcome | null;
  participantsPreview: CallUserRef[];
  scope: CallScopeInfo;
  scopeId: string;
  scopeType: CallScopeType;
  startedAt: string;
}

/** Token kết nối LiveKit — TTL ngắn, chỉ để KẾT NỐI (renew qua `POST /calls/:id/token`). */
export interface CallToken {
  expiresAt: string;
  livekitUrl: string;
  token: string;
}

/** `POST /calls` — `token` vắng khi mọi người được gọi đều bận (`call.status === 'ENDED'`). */
export interface CreateCallResult {
  call: CallDto;
  joined: boolean;
  serverNow: string;
  token: CallToken | null;
}

/** `POST /calls/:id/answer|join`. */
export interface JoinCallResult {
  call: CallDto;
  serverNow: string;
  token: CallToken | null;
}

export interface DeclineCallResult {
  call: CallDto;
  /** `true` = máy khác đã trả lời trước — không đổi trạng thái (CL-03). */
  ignored: boolean;
}

export interface MyActiveCall {
  call: CallDto | null;
  myParticipant: { role: CallParticipantRole; state: CallParticipantState } | null;
}

export interface CursorMeta {
  hasMore: boolean;
  limit: number;
  nextCursor: string | null;
}

export interface CallHistoryPage {
  items: CallHistoryItem[];
  meta: CursorMeta;
}

export type CallHistoryFilter = 'all' | 'missed';

export interface CreateCallPayload extends CallScopeRef {
  clientCallId: string;
  deviceId: string;
  /** Phòng thoại kênh (p2-03): chuyển cuộc gọi khác/thiết bị khác sang phòng này sau khi người dùng xác nhận. */
  force?: boolean;
  mediaKind: CallMediaKind;
}
