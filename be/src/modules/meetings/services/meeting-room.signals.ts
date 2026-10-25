import { SocketEvent } from "../../../infrastructure/socket/socket.events";
import { ROOM } from "../../../infrastructure/socket/socket.rooms";
import type { MeetingEntity } from "../entities/meeting.interface";
import type { LobbyState } from "../entities/meeting-room.interface";
import type { MeetingRoomAccess } from "./meeting-room.access";
import type { MeetingRoomDeps } from "./meeting-room.deps";

/** `HAND_LOWERED` = chủ trì/đồng chủ trì hạ tay RIÊNG một người (`POST /meetings/:id/hands/:userId/lower`) — chỉ tới `user:{target}`. */
export type HostActionType = "MUTED" | "REMOVED" | "ROLE_CHANGED" | "SCREEN_SHARE_REJECTED" | "LOWER_ALL_HANDS" | "HAND_LOWERED";

/**
 * Tín hiệu socket của phòng họp (be.md §6). Phát TRỰC TIẾP trong request của người thao tác (tiến trình API có `getIO()`); đường outbox → worker
 * là bản dự phòng và nay THẬT SỰ tới client nhờ cầu nối Redis (`socket.bridge.ts`, p0-03) — `started`/`updated`/`ended` mang `version` nên bản trùng bị
 * client bỏ (client luôn đồng bộ lại qua REST `GET /meetings/:id/room`). Emit lỗi chỉ log, không làm hỏng thao tác — quyền/trạng thái thật nằm ở
 * Mongo + LiveKit, socket chỉ để giao diện cập nhật tức thì.
 */
export class MeetingRoomSignals {
  constructor(
    private readonly d: MeetingRoomDeps,
    private readonly access: MeetingRoomAccess
  ) {}

  /** `REQUESTED`/`CANCELLED` → chủ trì + đồng chủ trì (lịch và phiên); số `lobbyCount` luôn là số MỚI. */
  async lobbyToHosts(meeting: MeetingEntity, state: Extract<LobbyState, "REQUESTED" | "CANCELLED">, userId: string, extra: { displayName?: string; reason?: string } = {}): Promise<void> {
    const [hosts, lobbyCount] = await Promise.all([this.access.hostLikeUserIds(meeting), this.d.store.lobbyCount(meeting.id)]);
    this.d.emitter.toUsers(hosts, SocketEvent.MEETING_LOBBY, { meetingId: meeting.id, state, userId, lobbyCount, ...extra });
  }

  /** `ADMITTED`/`DENIED` → chỉ người xin vào (họ đã ở room `meet:{id}` nhưng nhận qua `user:` để chắc chắn tới mọi thiết bị của họ). */
  async lobbyToRequester(meeting: MeetingEntity, state: Extract<LobbyState, "ADMITTED" | "DENIED">, userId: string): Promise<void> {
    const lobbyCount = await this.d.store.lobbyCount(meeting.id);
    this.d.emitter.toUsers([userId], SocketEvent.MEETING_LOBBY, { meetingId: meeting.id, state, userId, lobbyCount });
  }

  async started(meeting: MeetingEntity, p: { callId: string; startedBy: string; restarted: boolean }): Promise<void> {
    const attendees = (await this.d.repo.findActiveAttendees(meeting.id)).map((a) => a.userId);
    const payload = { meetingId: meeting.id, callId: p.callId, startedBy: p.startedBy, version: meeting.version, restarted: p.restarted };
    this.d.emitter.toRoom(ROOM.meeting(meeting.id), SocketEvent.MEETING_STARTED, payload);
    this.d.emitter.toUsers(attendees, SocketEvent.MEETING_STARTED, payload);
  }

  ended(meeting: MeetingEntity, p: { callId: string | null; reason: string; durationSec: number }): void {
    const payload = { meetingId: meeting.id, callId: p.callId, reason: p.reason, durationSec: p.durationSec, version: meeting.version };
    this.d.emitter.toRoom(ROOM.meeting(meeting.id), SocketEvent.MEETING_ENDED, payload);
    if (p.callId) this.d.emitter.toRoom(ROOM.call(p.callId), SocketEvent.MEETING_ENDED, payload);
  }

  /** `meeting:updated` (khoá/mở khoá, cảnh báo sắp đóng) → `meet:{id}` + `call:{callId}`; giữ khuôn p2-04 (`changedFields`, `status`). */
  updated(meeting: MeetingEntity, callId: string | null, extra: { lockedAt?: string | null; closingAt?: string | null }): void {
    const payload = { meetingId: meeting.id, version: meeting.version, status: meeting.status, changedFields: Object.keys(extra), ...extra };
    this.d.emitter.toRoom(ROOM.meeting(meeting.id), SocketEvent.MEETING_UPDATED, payload);
    if (callId) this.d.emitter.toRoom(ROOM.call(callId), SocketEvent.MEETING_UPDATED, payload);
  }

  /** `call:host-action` tới từng người bị tác động (`user:{id}`, gồm `HAND_LOWERED`); `LOWER_ALL_HANDS`/tắt mic tất cả → cả room `call:{callId}` (`toUserIds = null`). */
  hostAction(callId: string, toUserIds: string[] | null, payload: { type: HostActionType; byUserId: string | null; targetUserId?: string | null; source?: string; role?: string; all?: boolean }): void {
    const body = { callId, targetUserId: null, ...payload };
    if (toUserIds) this.d.emitter.toUsers(toUserIds, SocketEvent.CALL_HOST_ACTION, body);
    else this.d.emitter.toRoom(ROOM.call(callId), SocketEvent.CALL_HOST_ACTION, body);
  }
}
