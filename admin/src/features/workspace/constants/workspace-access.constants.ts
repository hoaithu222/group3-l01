import type { JoinPolicyValue } from '../types/workspace-access.types';

export const JOIN_POLICY_LABELS: Readonly<Record<JoinPolicyValue, string>> = {
  OPEN: 'Tự do',
  APPROVAL: 'Cần duyệt',
};

/**
 * Khách còn ≤ 48 giờ là hết hạn thì gắn "Sắp hết hạn" — khớp `LIMITS.guest.expiringNoticeHours`
 * (mặc định 48) và `accessSummary.guests.expiringIn48h` phía BE.
 */
export const GUEST_EXPIRING_SOON_HOURS = 48;

/**
 * Mã hành động hiện ở khối "Nhật ký truy cập" của tab Thành viên (p3-04 admin.md §2): thành viên, liên kết mời,
 * lời mời email, duyệt tham gia, khách, chính sách truy cập, quyền kênh theo vai trò. Lọc theo `workspaceId` chứ
 * không theo `targetType` vì BE ghi chúng dưới nhiều loại đối tượng (Workspace/WorkspaceMembership/Channel/…).
 * Tối đa 30 mã (`actionFilterSchema` của BE) — `workspace-p3-utils.test.ts` khoá.
 */
export const ACCESS_AUDIT_ACTIONS: readonly string[] = [
  'member.role-change',
  'member.ban',
  'member.unban',
  'member.remove',
  'member.platform-revoke',
  'invite.create',
  'invite.revoke',
  'invitation.create',
  'invitation.resend',
  'invitation.revoke',
  'invitation.accept',
  'join-request.approve',
  'join-request.reject',
  'guest.update',
  'guest.expire',
  'workspace.settings-update',
  'channel.grant-role',
  'channel.grant-role-revoke',
];

/** Bảng lời mời: số dòng mỗi trang + khoá URL riêng (tab thành viên đã dùng `page`/`pageSize`). */
export const INVITATION_PAGE_SIZE = 10;
export const INVITATION_PAGE_PARAM = 'invPage';
export const INVITATION_PAGE_SIZE_PARAM = 'invSize';

/** Danh sách yêu cầu chờ duyệt: chỉ hiện các yêu cầu mới nhất, phần còn lại xem ở bộ lọc trạng thái. */
export const PENDING_REQUESTS_PREVIEW = 10;
