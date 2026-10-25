import type { MeetingAttendeeDto, MeetingDetailDto } from '../api/meetings.types';

/** Việc người xem làm được với MỘT người tham dự — menu của hàng hiện đúng các mục này. */
export interface AttendeeActions {
  /** `grant` = đặt làm đồng chủ trì, `revoke` = bỏ vai đồng chủ trì, `null` = không được đổi vai. */
  coHost: 'grant' | 'revoke' | null;
  remove: boolean;
  transfer: boolean;
}

const NONE: AttendeeActions = { coHost: null, remove: false, transfer: false };

/**
 * Quyền trên một hàng người tham dự (README p2-04 §6.1). Cờ gốc do SERVER tính (`myActions.canManageAttendees` cho thêm/xoá,
 * `canManageRoles` cho đổi vai/chuyển chủ trì — chỉ HOST); ở đây chỉ thu hẹp theo NGƯỜI BỊ CHỌN, đúng luật BE:
 *  · không ai đụng được HOST (`MEET_016`) — muốn đổi thì "Giao chủ trì" cho người khác;
 *  · CO_HOST chỉ xoá được ATTENDEE, không xoá được HOST/CO_HOST (`MEET_002`) — chỉ HOST xoá được đồng chủ trì;
 *  · ENDED/CANCELLED: danh sách ĐÓNG BĂNG làm lịch sử ⇒ không có việc nào.
 * Không suy quyền từ vai trò khi server chưa cho: `canManage*` = false thì mọi mục tắt.
 */
export function attendeeActions(
  meeting: Pick<MeetingDetailDto, 'myActions' | 'myRole' | 'status'>,
  target: Pick<MeetingAttendeeDto, 'role'>,
): AttendeeActions {
  const open = meeting.status === 'SCHEDULED' || meeting.status === 'LIVE';
  if (!open || target.role === 'HOST') return NONE;

  const { canManageAttendees, canManageRoles } = meeting.myActions;
  return {
    coHost: canManageRoles ? (target.role === 'CO_HOST' ? 'revoke' : 'grant') : null,
    remove: canManageAttendees && (target.role === 'ATTENDEE' || meeting.myRole === 'HOST'),
    transfer: canManageRoles,
  };
}

export function hasAnyAttendeeAction(actions: AttendeeActions): boolean {
  return actions.coHost !== null || actions.remove || actions.transfer;
}
