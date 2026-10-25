import type { AttendeeEntity, MeetingEntity, MyMeetingActions } from "../entities/meeting.interface";
import type { WorkspaceRoleValue } from "../repositories/meeting-directory.reader";

export interface ActionFlags {
  /** p2-05: người này bị loại khỏi PHIÊN họp hiện tại (Redis) — không vào lại được. */
  blockedFromCall?: boolean;
  /** (p2-06) Đã có biên bản CÔNG BỐ / số bản ghi READY chưa xoá — mặc định false/0. */
  hasPublishedRecap?: boolean;
  readyRecordingCount?: number;
  /** (p2-06) Người này là tác giả (tạo nháp đầu tiên) của biên bản — sửa được dù không còn là chủ trì/đồng chủ trì. */
  isRecapAuthor?: boolean;
}

const NONE: MyMeetingActions = {
  canEdit: false,
  canEditLimited: false,
  canManageAttendees: false,
  canManageRoles: false,
  canCancel: false,
  cancelRequiresReason: false,
  canDelete: false,
  canStart: false,
  canJoin: false,
  joinVia: null,
  canEnd: false,
  canOpenExternal: false,
  canRsvp: false,
  canLeaveAttendance: false,
  canViewRecap: false,
  canEditRecap: false,
  canRecord: false,
};

/** Cửa sổ vào phòng: `startAt − joinWindowMinutes ≤ now` (README §6.2 ký hiệu `W`). */
export const joinOpensAt = (m: Pick<MeetingEntity, "startAt" | "joinWindowMinutes">): Date => new Date(m.startAt.getTime() - m.joinWindowMinutes * 60_000);

/**
 * `myActions` do SERVER tính (README §6.2, be.md §5.7) — hàm THUẦN, test table-driven (MT-12). Client chỉ vẽ nút.
 * `W` = đã tới `joinOpensAt`; `R` = còn trong `restartWindowMinutes` sau `endAt`; `INT` = nền tảng nội bộ (LiveKit).
 */
export function computeMyActions(
  m: MeetingEntity,
  attendee: Pick<AttendeeEntity, "role" | "removedAt"> | null,
  wsRole: WorkspaceRoleValue | null,
  now: Date,
  opts: { restartWindowMinutes: number; flags?: ActionFlags }
): MyMeetingActions {
  const flags = opts.flags ?? {};
  const member = attendee && !attendee.removedAt ? attendee : null;
  const isHost = member?.role === "HOST";
  const isHostLike = member?.role === "HOST" || member?.role === "CO_HOST";
  const wsAdmin = wsRole === "OWNER" || wsRole === "ADMIN";
  const wsMember = !!wsRole && wsRole !== "GUEST";
  const publicMember = !member && m.visibility === "WORKSPACE" && wsMember;
  const INT = m.platform === "INTERNAL";
  const W = now.getTime() >= joinOpensAt(m).getTime();
  const R = now.getTime() <= m.endAt.getTime() + opts.restartWindowMinutes * 60_000;
  const hasRecapData = !!flags.hasPublishedRecap || (flags.readyRecordingCount ?? 0) > 0;
  const blocked = !!flags.blockedFromCall;

  const a: MyMeetingActions = { ...NONE };
  // Quản trị workspace KHÔNG tham dự: chỉ huỷ (có lý do) + OWNER xoá — không thấy link/agenda (README §6.1/§6.2 dòng `*`).
  if (!member && !publicMember) {
    if (wsAdmin && m.status === "SCHEDULED") {
      a.canCancel = true;
      a.cancelRequiresReason = true;
    }
    a.canDelete = wsRole === "OWNER" && (m.status === "SCHEDULED" || m.status === "CANCELLED" || m.status === "ENDED");
    return a;
  }

  switch (m.status) {
    case "SCHEDULED": {
      a.canOpenExternal = !INT;
      if (member) {
        a.canRsvp = true;
        a.canLeaveAttendance = !isHost;
      }
      if (isHostLike) {
        a.canEdit = true;
        a.canManageAttendees = true;
        a.canManageRoles = isHost;
        a.canCancel = true;
        a.canDelete = isHost;
        a.canStart = INT && W;
      } else if (INT && W) {
        // ATTENDEE vào phòng chờ chủ trì; thành viên workspace (WORKSPACE) qua lobby khi lobbyMode ≠ OFF, còn OFF thì chờ như attendee.
        a.canJoin = !blocked;
        a.joinVia = member || m.lobbyMode === "OFF" ? "WAIT_FOR_HOST" : "LOBBY";
      }
      if (wsAdmin && !isHostLike) {
        a.canCancel = true;
        a.cancelRequiresReason = true;
      }
      if (wsRole === "OWNER" && !isHost) a.canDelete = true;
      break;
    }
    case "LIVE": {
      a.canOpenExternal = !INT;
      if (member) a.canRsvp = true;
      if (isHostLike) {
        a.canEditLimited = true;
        a.canManageAttendees = true;
        a.canManageRoles = isHost;
        a.canEnd = INT;
        a.canViewRecap = true;
        a.canEditRecap = true;
        a.canRecord = INT && m.recordingAllowed;
      }
      if (INT && !blocked) {
        a.canJoin = true;
        a.joinVia = member ? "DIRECT" : m.lobbyMode === "OFF" ? "DIRECT" : "LOBBY";
      }
      if (!isHostLike) {
        a.canViewRecap = !!flags.hasPublishedRecap || !!(member && flags.isRecapAuthor);
        a.canEditRecap = !!(member && flags.isRecapAuthor);
      }
      break;
    }
    case "ENDED": {
      if (isHostLike) {
        a.canStart = INT && R;
        a.canDelete = isHost && !hasRecapData;
        a.canViewRecap = true;
        a.canEditRecap = true;
      } else {
        a.canViewRecap = !!flags.hasPublishedRecap || !!(member && flags.isRecapAuthor);
        a.canEditRecap = !!(member && flags.isRecapAuthor);
      }
      if (wsRole === "OWNER" && !a.canDelete) a.canDelete = true; // OWNER xoá kèm lý do + audit khi có dữ liệu (service kiểm)
      break;
    }
    case "CANCELLED": {
      a.canDelete = isHost || wsRole === "OWNER";
      break;
    }
  }
  return a;
}
