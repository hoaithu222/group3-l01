import type { CallEndReason, CallParticipantRole, CallParticipantState, IncomingCallView } from './calls.types';

/**
 * Payload Socket.IO của `call:*` (BE `call-signal.dispatcher.ts`, p2-01 be.md §6). Mọi payload qua `emitToUsers`/`emitToRoom`
 * đều được BE đóng dấu `v: 1` + `serverNow` (ISO); `version` là version `Call` sau thay đổi — client dùng để bỏ tín hiệu cũ.
 */
interface CallSocketBase {
  callId: string;
  serverNow: string;
  v: 1;
  version: number;
}

export interface CallIncomingPayload extends CallSocketBase {
  call: IncomingCallView;
  expiresAt: string;
  /** `false` = nhóm > 16 người: không đổ chuông, chỉ banner "Đang có cuộc gọi — Tham gia". */
  ring: boolean;
}

export interface CallAcceptedPayload extends CallSocketBase {
  originDeviceId: string;
  userId: string;
}

export type CallDeclinedPayload = CallAcceptedPayload;

export interface CallAnsweredElsewherePayload extends CallSocketBase {
  originDeviceId: string;
}

export interface CallCancelledPayload extends CallSocketBase {
  reason: 'CANCELLED' | 'NO_ANSWER';
}

export interface CallEndedPayload extends CallSocketBase {
  durationSec: number | null;
  endReason: CallEndReason;
}

export interface CallParticipantUpdatedPayload extends CallSocketBase {
  /** Phòng thoại kênh (p2-03): số người đang hiển thị trong phòng. Vắng ở cuộc gọi RING. */
  count?: number;
  participant: {
    /** Chỉ có ở phòng ROOM: BE gửi kèm để vá danh sách ngay, không phải tải lại `GET /calls/:id` mỗi lần có người vào. */
    avatarUrl?: string | null;
    handRaisedAt: string | null;
    isHost?: boolean;
    mutedByHost: boolean;
    name?: string;
    role: CallParticipantRole;
    sharingScreen?: boolean;
    state: CallParticipantState;
    userId: string;
  };
}

/**
 * Bản CÔNG KHAI của `call:participant-updated` tới room `ch:{channelId}` (BE `emitChannelParticipant`, p2-03 be.md §6) — KHÁC bản đầy đủ ở
 * trên: không có `role`/`mutedByHost`, thay bằng `micEnabled`/`cameraEnabled` (QUYỀN phát, chưa phải trạng thái track thật). Hai bản cùng
 * tên sự kiện; phân biệt bằng `'role' in participant` (`isPublicParticipantPayload`).
 */
export interface CallParticipantPublicPayload extends CallSocketBase {
  count: number;
  participant: {
    avatarUrl: string | null;
    cameraEnabled: boolean;
    handRaisedAt: string | null;
    isHost: boolean;
    micEnabled: boolean;
    name: string;
    sharingScreen: boolean;
    state: CallParticipantState;
    userId: string;
  };
}

/** Sự kiện điều khiển phòng của chủ phòng (BE `call-signal.dispatcher.ts`, p2-03 be.md §6) — tới `call:{id}` VÀ `user:{target}`. */
export const VOICE_HOST_ACTION_EVENT = 'call:host-action';

export type CallHostActionType =
  | 'AUDIO_BLOCKED'
  | 'AUDIO_UNBLOCKED'
  | 'HOST_CHANGED'
  | 'INVITE_SPEAK'
  | 'MUTE_REQUEST'
  | 'REMOVED'
  | 'SCREEN_SHARE_ENDED'
  | 'VIDEO_DISABLED';

export interface CallHostActionPayload extends CallSocketBase {
  byUserId: string | null;
  reason?: string;
  targetUserId: string | null;
  type: CallHostActionType;
}
