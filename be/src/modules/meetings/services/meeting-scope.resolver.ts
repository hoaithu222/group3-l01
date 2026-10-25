import { registerScopeResolver, type Action, type ResolvedAccess } from "../../../core/permission";
import { ROOM } from "../../../infrastructure/socket/socket.rooms";
import type { IMeetingRepository } from "../repositories/meeting.repository.interface";

/** Hành động của người THAM DỰ (mọi vai). `join`/`start`/`end`/`lobby.admit`/`record` chi tiết ở p2-05, `recap.*`/`recording.*` ở p2-06. */
const ATTENDEE: readonly Action[] = ["meeting.read", "meeting.detail.read", "meeting.rsvp", "meeting.join"];
const HOST_LIKE: readonly Action[] = [
  "meeting.edit",
  "meeting.invite",
  "meeting.attendee.remove",
  "meeting.cancel",
  "meeting.start",
  "meeting.end",
  "meeting.lobby.admit",
  "meeting.record",
  "meeting.recap.edit",
  "meeting.recap.publish",
  "meeting.recording.view",
];

/**
 * Đăng ký resolver scope `MEETING` vào `PermissionService` (p2-04 be.md §5.8; guard room `meet:{id}` ở `socket.guards.ts` dùng
 * action `meeting.read`). Ma trận (README §6.1):
 * - người tham dự CÒN HIỆU LỰC: xem chi tiết + RSVP + vào phòng; HOST/CO_HOST thêm sửa/mời/xoá/huỷ/bắt đầu/kết thúc; HOST thêm
 *   `meeting.role.manage` + `meeting.delete`;
 * - `visibility = WORKSPACE` + thành viên ACTIVE (không phải khách): xem chi tiết + vào (qua lobby theo `lobbyMode`);
 * - OWNER/ADMIN workspace không tham dự: CHỈ metadata (`meeting.read`) + huỷ (có lý do); OWNER xoá.
 * Người không còn là thành viên ACTIVE của workspace mất mọi quyền (ngay cả khi còn tên trong danh sách) — cache theo
 * `versionDeps: [WORKSPACE]` nên bump workspace vô hiệu hoá ngay.
 */
export function registerMeetingPermissionResolver(repo: Pick<IMeetingRepository, "findById" | "findAttendee">): void {
  registerScopeResolver({
    type: "MEETING",
    async resolve(user, meetingId, ctx): Promise<ResolvedAccess> {
      const invisible: ResolvedAccess = { visible: false, role: null, actions: new Set() };
      const meeting = await repo.findById(meetingId);
      if (!meeting) return invisible;
      const workspace = { type: "WORKSPACE" as const, id: meeting.workspaceId };
      const ws = await ctx.resolve(user, workspace);
      if (!ws.visible) return invisible;

      const attendee = await repo.findAttendee(meetingId, user.id);
      const member = attendee && !attendee.removedAt ? attendee : null;
      const wsMember = ws.role !== "GUEST";
      const wsAdmin = ws.role === "OWNER" || ws.role === "ADMIN";
      const actions = new Set<Action>();

      if (member) {
        ATTENDEE.forEach((a) => actions.add(a));
        if (member.role === "HOST" || member.role === "CO_HOST") HOST_LIKE.forEach((a) => actions.add(a));
        if (member.role === "HOST") {
          actions.add("meeting.role.manage");
          actions.add("meeting.delete");
        }
      } else if (meeting.visibility === "WORKSPACE" && wsMember) {
        (["meeting.read", "meeting.detail.read", "meeting.join"] as const).forEach((a) => actions.add(a));
      } else if (wsAdmin) {
        actions.add("meeting.read"); // metadata: tiêu đề, giờ, chủ trì, số người, trạng thái — không agenda/link
      } else {
        return invisible;
      }
      if (wsAdmin) actions.add("meeting.cancel");
      if (ws.role === "OWNER") actions.add("meeting.delete");

      return { visible: true, role: member?.role ?? ws.role, actions, parent: workspace, versionDeps: [workspace], expiresAt: ws.expiresAt };
    },
    roomsFor(meetingId) {
      return [ROOM.meeting(meetingId)];
    },
  });
}
