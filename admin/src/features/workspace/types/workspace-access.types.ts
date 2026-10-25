/**
 * Kiểu dữ liệu quyền truy cập của nhóm (p3-04 admin.md §3) — khớp hai route ĐỌC của module
 * `workspaces` phía BE: `GET /admin/workspaces/:id/access-summary` và `GET /admin/workspaces/:id/invitations`.
 * (Danh sách thành viên, gồm khách + yêu cầu chờ duyệt, dùng lại `AdminMemberRow` của p1-02.)
 *
 * ⛔ Quản trị nền tảng chỉ XEM: không mời, không duyệt thay chủ nhóm. Lời mời KHÔNG có trường token,
 * và email phải được che (`l***@gmail.com`). `tests/features/workspace/access-privacy.test.tsx` quét
 * file này để chặn.
 *
 * ĐÃ ĐỐI CHIẾU BE (2026-09-21, `be/src/modules/members/services/admin-access.service.ts` +
 * `p3-04-…/be.md §13.3`): `AccessSummary`, `AdminInvitationRow` khớp; BE trả THÊM `createdAt` (hàng lời mời)
 * và `guestPolicy.memberCanInvite` — khai ở đây nhưng UI chưa dùng. Viết tay vì `openapi.json` chưa được sinh (p0-09).
 */

export type JoinPolicyValue = 'OPEN' | 'APPROVAL';

export interface GuestPolicyView {
  enabled: boolean;
  maxGuests: number;
  maxDays: number;
  /** Thành viên thường có được mời khách không (BE `GuestPolicy.memberCanInvite`, mặc định `false`). */
  memberCanInvite?: boolean;
}

export interface AccessSummaryView {
  joinPolicy: JoinPolicyValue;
  guestPolicy: GuestPolicyView;
  /** Thành viên ACTIVE (mọi vai trò) và bị chặn — thẻ số đầu tab "Thành viên" (p1-02 admin.md §2.1). */
  members: { active: number; banned: number };
  /** Link mời còn dùng được (chưa thu hồi/hết hạn/hết lượt) — CHỈ SỐ LƯỢNG, KHÔNG có token/đường dẫn mời. */
  inviteLinks: { active: number };
  guests: {
    active: number;
    /** Số khách còn ≤ 48 giờ là hết hạn. */
    expiringIn48h: number;
  };
  /** Yêu cầu tham gia đang chờ duyệt (membership `PENDING`). */
  pendingRequests: number;
  /** Lời mời email đang chờ chấp nhận (`PENDING`). */
  pendingInvitations: number;
  /** Chỉ SỐ LƯỢNG kênh riêng tư — không tên kênh. */
  privateChannels: {
    total: number;
    withRoleGrant: number;
  };
}

export type InvitationStatusValue = 'PENDING' | 'ACCEPTED' | 'REVOKED' | 'EXPIRED';
export type InvitationRoleValue = 'MEMBER' | 'GUEST';

export interface AdminInvitationRow {
  id: string;
  /** Email ĐÃ CHE ở server (`l***@gmail.com`); client che thêm nếu lỡ nhận email đầy đủ. */
  email: string;
  role: InvitationRoleValue;
  /** ID người mời — BE trả thẳng id, không join tên (cùng quy ước `AdminMemberRow.invitedBy`). */
  invitedBy: string | null;
  status: InvitationStatusValue;
  /** ISO-8601. */
  expiresAt: string;
  /** ISO-8601 — thời điểm tạo lời mời. */
  createdAt?: string;
}

export interface AdminListInvitationsParams {
  status?: InvitationStatusValue;
  page: number;
  limit: number;
}
