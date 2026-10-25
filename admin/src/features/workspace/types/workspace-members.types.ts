/**
 * Kiểu dữ liệu tab `members` — khớp `AdminMemberRow` phía BE
 * (`be/src/modules/members/entities/member.interface.ts`, p1-02 be.md §4).
 */

export type WorkspaceRoleValue = 'OWNER' | 'ADMIN' | 'MEMBER' | 'GUEST';
export type MembershipStatusValue = 'ACTIVE' | 'PENDING' | 'LEFT' | 'REMOVED' | 'BANNED';

/**
 * Vai trò lọc được ở admin. `GUEST` thêm ở p3-04 — BE đã nhận (`adminListMembersQuerySchema.role`
 * ∈ OWNER/ADMIN/MEMBER/GUEST, đối chiếu 2026-09-21).
 */
export type MemberRoleFilter = 'OWNER' | 'ADMIN' | 'MEMBER' | 'GUEST';

export type MemberSort = 'role' | 'name' | 'joinedAt';

export interface AdminMemberRow {
  user: { id: string; name: string; email?: string };
  role: WorkspaceRoleValue;
  status: MembershipStatusValue;
  joinedAt: string;
  /**
   * ID người mời (`membership.invitedBy`) — BE trả THẲNG id, KHÔNG join tên
   * (`member.presenter.ts#toAdminMemberRow`). Cột "Mời bởi" vì vậy hiển thị
   * theo id (link `/user/:id` khi có `user:view`), không có tên đầy đủ.
   */
  invitedBy: string | null;
  /** Chỉ có giá trị với thành viên `GUEST` (p3-04) — hạn truy cập của khách, `null` với vai trò khác. */
  expiresAt: string | null;
  /**
   * Thời điểm gửi yêu cầu tham gia — chỉ có với thành viên `PENDING` (`joinPolicy = APPROVAL`, p3-04).
   * BE luôn trả (`toAdminMemberRow`: `requestedAt ?? null`); `null`/thiếu thì bảng yêu cầu chờ duyệt rơi về `joinedAt`.
   */
  requestedAt?: string | null;
  banReason: string | null;
}

export interface AdminListMembersParams {
  q?: string;
  role?: MemberRoleFilter;
  status?: MembershipStatusValue;
  sort: MemberSort;
  page: number;
  limit: number;
}

export interface RevokeMemberPayload {
  workspaceId: string;
  userId: string;
  reason: string;
  ban: boolean;
}
