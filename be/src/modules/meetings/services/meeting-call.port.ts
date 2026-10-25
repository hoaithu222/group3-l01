import type { CallEndReason, CallParticipantRole, CallParticipantState, CallStatus } from "@prisma/client";
import type { AuthUser } from "../../../core/types/express";
import type { TxHandle } from "../repositories/tx";
import type { PublishPermissionsDto, RoomRole } from "../entities/meeting-room.interface";

/** Phiên họp = một `Call` (`scopeType MEETING`, `mode ROOM`) — chỉ những trường phòng họp cần (tập con của `CallEntity`). */
export interface RoomCall {
  id: string;
  livekitRoom: string;
  status: CallStatus;
  endReason: CallEndReason | null;
  startedAt: Date;
  endedAt: Date | null;
  durationSec: number | null;
  version: number;
}

export interface RoomParticipant {
  callId: string;
  userId: string;
  role: CallParticipantRole;
  state: CallParticipantState;
  handRaisedAt: Date | null;
  mutedByHost: boolean;
  publishPermissions: PublishPermissionsDto;
  joiningAt: Date | null;
  firstJoinedAt: Date | null;
  lastJoinedAt: Date | null;
  lastLeftAt: Date | null;
  connectedSeconds: number;
  respondedDeviceId: string | null;
  version: number;
}

export interface CreateRoomCallInput {
  callId: string;
  meetingId: string;
  workspaceId: string;
  livekitRoom: string;
  initiatorId: string;
}

export interface EnterRequest {
  callId: string;
  userId: string;
  deviceId: string;
  /** Vai trò khi vào: chủ trì/đồng chủ trì THEO LỊCH → `HOST`/`CO_HOST`; còn lại `MEMBER` (giữ `CO_HOST` phiên đã được cấp nếu có). */
  role: RoomRole;
  publish: PublishPermissionsDto;
  maxParticipants: number;
  /** Chủ trì/đồng chủ trì luôn vào được kể cả khi phòng đầy (LiveKit đặt dư `roomSpareSlots`). */
  bypassCapacity: boolean;
  locked: boolean;
  /** Chủ trì/đồng chủ trì vào được phòng khoá. */
  bypassLock: boolean;
  rejoinAfterLockSeconds: number;
  /** Cùng phiên, thiết bị khác đang kết nối: `false` → `OTHER_DEVICE`; `true` → đá thiết bị cũ. */
  force: boolean;
}

export type EnterResult =
  | { kind: "OK"; participant: RoomParticipant; rejoined: boolean; kickedOtherDevice: boolean }
  | { kind: "ENDED" | "BLOCKED" | "LOCKED" | "FULL" | "OTHER_DEVICE" };

/** Khoá `call:active:MEETING:<id>` (Redis) — tầng 1 chống hai phiên song song; tầng 2 là `Call.activeKey @unique` trong Mongo. */
export type ActiveLock = { acquired: true } | { acquired: false; existing: string };

/** Hai tiến trình cùng tạo phiên họp (`activeKey` trùng, P2002): bên thua thấy phiên của bên thắng. */
export class RoomCallConflictError extends Error {
  constructor() {
    super("Meeting call unique conflict");
    this.name = "RoomCallConflictError";
  }
}

/**
 * Cổng của `meetings` sang lõi cuộc gọi (p2-01/p2-03, be.md §1 `CallRoomPort`) — module `meetings` KHÔNG import `calls` ngoài file
 * adapter duy nhất `adapters/calls-room.adapter.ts` (điểm nối; test dùng container `calls` thật với Redis in-memory).
 * Trạng thái người tham gia (`CallParticipant`), khoá nóng `call:*`, kết thúc phiên (`endCall`) đều do `calls` sở hữu.
 */
export interface MeetingCallPort {
  acquireActive(meetingId: string, callId: string): Promise<ActiveLock>;
  promoteActive(meetingId: string, callId: string): Promise<boolean>;
  releaseActive(meetingId: string, callId: string): Promise<boolean>;
  /** Tạo `Call ACTIVE` (chưa có participant — người bắt đầu vào bằng `enter`). Ném `RoomCallConflictError` khi `activeKey` trùng. */
  createRoomCall(tx: TxHandle, input: CreateRoomCallInput): Promise<RoomCall>;

  findCall(callId: string): Promise<RoomCall | null>;
  listParticipants(callId: string): Promise<RoomParticipant[]>;
  findParticipant(callId: string, userId: string): Promise<RoomParticipant | null>;
  /** Số giây kết nối tích luỹ của từng người qua MỌI phiên của cuộc họp (điểm danh — ghi đè, không cộng dồn nên idempotent). */
  connectedSecondsByUser(meetingId: string, userIds: string[]): Promise<Map<string, number>>;

  /** Vào phòng NGUYÊN TỬ dưới `call:lock`: kiểm bị mời ra/khoá/đầy rồi tạo hoặc cập nhật participant `JOINING` + tín hiệu `participant-changed`. */
  enter(req: EnterRequest): Promise<EnterResult>;
  /** `call:busy:<user>` — đang ở cuộc gọi/phòng khác: `force=false` → `CALL_004 { activeCall }`; `force=true` → rời phòng cũ. */
  claimBusy(user: AuthUser, callId: string, force: boolean): Promise<void>;
  releaseBusy(userId: string, callId: string): Promise<void>;
  /** Cấp token LiveKit theo quyền publish đã lưu ở participant (`CallTokenService`, kiểm quyền còn hiệu lực). */
  issueToken(user: AuthUser, callId: string): Promise<{ token: string; livekitUrl: string; expiresAt: string }>;

  /** Người dùng rời phòng (idempotent): `LEFT` + đá khỏi LiveKit + nhả `call:busy`/slot chia sẻ. */
  leave(user: AuthUser, callId: string): Promise<void>;
  /** Kết thúc phiên (điểm DUY NHẤT — `CallEndService.endCall`): `deleteRoom`, nhả khoá Redis, tính `connectedSeconds`. `null` = đã kết thúc. */
  endCall(callId: string, reason: CallEndReason, actorId: string | null): Promise<RoomCall | null>;
  /** `REMOVED` + đá khỏi LiveKit + nhả khoá; `false` khi không có gì đổi. */
  removeParticipant(callId: string, userId: string, removedBy: string | null): Promise<boolean>;
  /** Đổi vai trò phiên (CAS theo `version` participant) + tín hiệu `participant-changed`; `null` khi lệch/không tìm thấy. */
  setRole(callId: string, userId: string, role: RoomRole): Promise<RoomParticipant | null>;
  /** Ghi cờ `mutedByHost` (CAS) + tín hiệu `participant-changed`. */
  setMutedByHost(callId: string, userId: string, muted: boolean): Promise<RoomParticipant | null>;
  /** (p2-06) Ghi quyền publish của một người (CAS) + tín hiệu `participant-changed` — token làm mới đọc lại giá trị này; `null` khi không còn trong phòng. */
  setPublishPermissions(callId: string, userId: string, publish: PublishPermissionsDto): Promise<RoomParticipant | null>;
  /**
   * (p2-06) Chạy `fn` dưới `call:lock:<callId>` — CÙNG khoá với `enter`, nên "đọc ai đang trong phòng + tạo bản ghi ghi hình" là nguyên tử so với người vào mới
   * (người vào sau đó thấy bản ghi đang chạy và bị hạn chế quyền phát tới khi đồng ý). KHÔNG gọi `enter`/`endCall` bên trong (cùng khoá).
   */
  withCallLock<T>(callId: string, fn: () => Promise<T>): Promise<T>;

  scheduleReconcile(callId: string, delayMs: number): Promise<void>;
  reconcile(callId: string): Promise<void>;
  /** Slot chia sẻ màn hình (`call:screen:<id>`, SET NX): người thứ hai bị từ chối. */
  acquireScreen(callId: string, userId: string): Promise<{ acquired: true } | { acquired: false; holder: string }>;
  releaseScreen(callId: string, userId: string): Promise<boolean>;
  /** Người này đã bị mời ra khỏi PHIÊN này (`participant.state = REMOVED`) — dùng cho `myActions.canJoin` và chặn vào lại (`MEET_013`). */
  isRemoved(callId: string, userId: string): Promise<boolean>;
}
