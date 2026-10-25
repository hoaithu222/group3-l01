import { ErrorCode } from "../../../core/utils/error.codes";
import type { MeetingEntity } from "../entities/meeting.interface";
import type { JoinCategory, RoomRole } from "../entities/meeting-room.interface";
import type { WorkspaceRoleValue } from "../repositories/meeting-directory.reader";
import { meetError } from "./meeting-errors";
import type { RoomParticipant } from "./meeting-call.port";
import type { MeetingRoomDeps } from "./meeting-room.deps";

const CONNECTED_LIKE = new Set(["JOINING", "CONNECTED", "RECONNECTING"]);
export const isInRoom = (p: Pick<RoomParticipant, "state"> | null | undefined): boolean => !!p && CONNECTED_LIKE.has(p.state);

/** Người thao tác trong phòng: vai theo LỊCH (`MeetingAttendee`) + vai trong PHIÊN (`CallParticipant.role`, có thể được cấp tạm). */
export interface RoomActor {
  userId: string;
  category: JoinCategory;
  wsRole: WorkspaceRoleValue | null;
  /** Đã bị chủ trì xoá khỏi danh sách tham dự (`removedAt`) — không vào lại bằng link. */
  removed: boolean;
  /** Chủ trì/đồng chủ trì theo lịch — điều khiển được kể cả khi chưa vào phòng. */
  scheduleHostLike: boolean;
  /** Vai trong phiên hiện tại; `null` khi chưa vào/đã rời. Chỉ tính khi còn trong phòng. */
  sessionRole: RoomRole | null;
  isHost: boolean;
  isHostLike: boolean;
}

const toRoomRole = (role: string): RoomRole => (role === "HOST" ? "HOST" : role === "CO_HOST" ? "CO_HOST" : "MEMBER");

/**
 * Xác định "ai đang thao tác" cho mọi service phòng họp — MỘT nơi tính vai (lịch ⊕ phiên) và MỘT nơi ném lỗi quyền (`MEET_002`), để
 * `CO_HOST` được cấp TẠM trong phiên (host-grace, giao quyền khi rời) điều khiển được phòng mà không cần sửa lịch họp (p2-04).
 * Quyền xem/vào của người dùng vẫn do `requireMeeting(...)` (PermissionService) kiểm ở route trước khi tới đây.
 */
export class MeetingRoomAccess {
  constructor(private readonly d: MeetingRoomDeps) {}

  async load(meeting: MeetingEntity, userId: string): Promise<RoomActor> {
    const [attendee, roles, mine] = await Promise.all([
      this.d.repo.findAttendee(meeting.id, userId),
      this.d.dir.getActiveMemberRoles(meeting.workspaceId, [userId]),
      meeting.currentCallId ? this.d.calls.findParticipant(meeting.currentCallId, userId) : Promise.resolve(null),
    ]);
    const active = attendee && !attendee.removedAt ? attendee : null;
    const category: JoinCategory = active ? (active.role === "HOST" ? "HOST" : active.role === "CO_HOST" ? "CO_HOST" : "ATTENDEE") : "GUEST_LINK";
    const sessionRole = isInRoom(mine) && mine ? toRoomRole(mine.role) : null;
    const scheduleHostLike = category === "HOST" || category === "CO_HOST";
    // Đã bị mời ra khỏi PHIÊN này thì mất quyền điều khiển phòng dù vẫn là đồng chủ trì theo lịch (chủ trì mời ra là ý định dứt khoát).
    const kicked = mine?.state === "REMOVED";
    return {
      userId,
      category,
      wsRole: roles.get(userId) ?? null,
      removed: !!attendee?.removedAt,
      scheduleHostLike,
      sessionRole,
      isHost: !kicked && (category === "HOST" || sessionRole === "HOST"),
      isHostLike: !kicked && (scheduleHostLike || sessionRole === "HOST" || sessionRole === "CO_HOST"),
    };
  }

  assertHostLike(actor: RoomActor): void {
    if (!actor.isHostLike) throw meetError(ErrorCode.MEET_002, 403);
  }

  /** Người nhận tín hiệu phòng chờ: chủ trì/đồng chủ trì theo lịch + người đang giữ `HOST`/`CO_HOST` trong phiên. */
  async hostLikeUserIds(meeting: MeetingEntity): Promise<string[]> {
    const ids = new Set<string>();
    for (const a of await this.d.repo.findActiveAttendees(meeting.id)) if (a.role === "HOST" || a.role === "CO_HOST") ids.add(a.userId);
    if (meeting.currentCallId) {
      for (const p of await this.d.calls.listParticipants(meeting.currentCallId)) if (isInRoom(p) && (p.role === "HOST" || p.role === "CO_HOST")) ids.add(p.userId);
    }
    return [...ids];
  }
}
