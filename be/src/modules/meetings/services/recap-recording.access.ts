import type { AttendeeEntity, MeetingEntity } from "../entities/meeting.interface";
import type { RecapEntity } from "../entities/meeting-recap.interface";
import type { WorkspaceRoleValue } from "../repositories/meeting-directory.reader";
import type { MeetingRoomDeps } from "./meeting-room.deps";

/**
 * "Ai đang xem" một cuộc họp — MỘT nơi tính vai cho biên bản/ghi hình (README p2-06 §6): vai theo LỊCH (`MeetingAttendee`) ⊕ vai trong PHIÊN CUỐI
 * (`CallParticipant.role`, `CO_HOST` cấp tạm) ⊕ vai workspace. Quyền XEM cuộc họp (404 trung tính) đã kiểm ở route bằng `requireMeeting`; ở đây chỉ phân
 * loại để quyết định NHÁP/công bố/điều khiển.
 */
export interface MeetingViewer {
  userId: string;
  attendee: AttendeeEntity | null;
  wsRole: WorkspaceRoleValue | null;
  /** Chủ trì/đồng chủ trì theo lịch. */
  scheduleHostLike: boolean;
  /** Chủ trì/đồng chủ trì trong phiên họp cuối (kể cả được cấp tạm) và không bị mời ra. */
  sessionHostLike: boolean;
  isHostLike: boolean;
  /** Chủ trì THEO LỊCH (không phải đồng chủ trì) — được xoá bản ghi. */
  isScheduleHost: boolean;
  isOwner: boolean;
  /** Thấy phần nội dung của cuộc họp: người tham dự còn hiệu lực, hoặc thành viên (không phải khách) khi `visibility = WORKSPACE`. */
  canSeeDetail: boolean;
}

export async function loadViewer(d: MeetingRoomDeps, meeting: MeetingEntity, userId: string): Promise<MeetingViewer> {
  const [attendee, roles, session] = await Promise.all([
    d.repo.findAttendee(meeting.id, userId),
    d.dir.getActiveMemberRoles(meeting.workspaceId, [userId]),
    meeting.currentCallId ? d.calls.findParticipant(meeting.currentCallId, userId) : Promise.resolve(null),
  ]);
  const active = attendee && !attendee.removedAt ? attendee : null;
  const wsRole = roles.get(userId) ?? null;
  const scheduleHostLike = active?.role === "HOST" || active?.role === "CO_HOST";
  const sessionHostLike = !!session && session.state !== "REMOVED" && (session.role === "HOST" || session.role === "CO_HOST");
  return {
    userId,
    attendee: active,
    wsRole,
    scheduleHostLike,
    sessionHostLike,
    isHostLike: scheduleHostLike || sessionHostLike,
    isScheduleHost: active?.role === "HOST",
    isOwner: wsRole === "OWNER",
    canSeeDetail: !!active || (meeting.visibility === "WORKSPACE" && !!wsRole && wsRole !== "GUEST"),
  };
}

export interface RecapRights {
  /** Sửa được (khi cuộc họp LIVE/ENDED): chủ trì/đồng chủ trì hoặc người tạo bản nháp đầu. */
  isEditor: boolean;
  /** Công bố: CHỈ chủ trì/đồng chủ trì (người ghi chép chưa được công bố). */
  canPublish: boolean;
  /** Thấy bản NHÁP (người sửa) — người khác chỉ thấy bản đã công bố. */
  canViewDraft: boolean;
  canViewPublished: boolean;
}

export function recapRights(v: MeetingViewer, recap: Pick<RecapEntity, "authorId" | "publishedAt"> | null): RecapRights {
  const isAuthor = !!recap && recap.authorId === v.userId && v.canSeeDetail;
  const isEditor = v.isHostLike || isAuthor;
  return { isEditor, canPublish: v.isHostLike, canViewDraft: isEditor, canViewPublished: v.canSeeDetail && !!recap?.publishedAt };
}

export interface RecordingRights {
  /** Xem danh sách + phát bản READY. */
  canView: boolean;
  /** Yêu cầu đồng ý/bắt đầu/dừng/thử lại import; thấy cả bản FAILED/PROCESSING. */
  canControl: boolean;
  canDownload: boolean;
  canDelete: boolean;
}

export const recordingRights = (v: MeetingViewer): RecordingRights => ({
  canView: v.canSeeDetail,
  canControl: v.isHostLike,
  canDownload: v.isHostLike || v.isOwner,
  canDelete: v.isScheduleHost || v.isOwner,
});
