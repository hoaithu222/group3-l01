import type { WorkspaceMembership, ListMembersParams, AdminListMembersParams } from "../entities/member.interface";

export interface MemberUserSummary {
  id: string;
  name: string;
  normalizedName: string;
  email: string;
  avatarAssetId: string | null;
}

export interface MembershipWithUser {
  membership: WorkspaceMembership;
  user: MemberUserSummary;
}

/**
 * Đọc `WorkspaceMembership` cho nhu cầu p1-02 (danh sách/thẻ thành viên) —
 * ghi (đổi role/status) đi qua `withTransaction` trực tiếp trong service
 * (be.md §5.4/§5.5, cùng mẫu `workspace.service.ts` — CAS + outbox trong 1
 * transaction, không qua repo).
 */
export interface IMembershipRepository {
  findByWorkspaceAndUser(workspaceId: string, userId: string): Promise<WorkspaceMembership | null>;
  /** Membership + hồ sơ User cơ bản (tên, avatar) cho `MemberCard` — 1 người, không phân trang. */
  findWithUser(workspaceId: string, userId: string): Promise<MembershipWithUser | null>;
  /** Số workspace user đang ACTIVE (xuyên suốt, không lọc theo 1 workspace) — dùng để chặn `perUserMax` khi chấp nhận lời mời (be.md §5.3). */
  countActiveByUser(userId: string): Promise<number>;
  /** p3-04 — kênh KHÁCH đang được chỉ định (grant DIRECT của họ trong workspace) — hiện ở thẻ khách cho OWNER/ADMIN. */
  listGuestChannelIds(workspaceId: string, userId: string): Promise<string[]>;
  /** p3-04 — yêu cầu tham gia (PENDING) mới nhất trước, phân trang cursor `(requestedAt, id)` — `GET …/join-requests`. */
  listPendingRequests(
    workspaceId: string,
    params: { cursor?: string; limit: number }
  ): Promise<{ data: MembershipWithUser[]; hasMore: boolean }>;
  /** p3-04 — khách ACTIVE đã quá hạn (`expiresAt <= now`), cũ nhất trước — cron `guests.expire-sweep`. */
  listExpiredGuests(now: Date, limit: number): Promise<WorkspaceMembership[]>;
  /**
   * Lọc theo `q` (tên) SAU KHI join với `User` (Mongo không JOIN được ở tầng
   * Prisma) — tải hết membership khớp role/status rồi lọc/paginate ở tầng
   * ứng dụng. Đủ dùng cho quy mô 1 workspace (`perUserMax=50`); nếu tương lai
   * cho phép workspace lớn hơn, đổi sang `aggregateRaw` + `$lookup`.
   */
  listMembers(workspaceId: string, params: ListMembersParams): Promise<{ data: MembershipWithUser[]; total: number }>;
  adminListMembers(
    workspaceId: string,
    params: AdminListMembersParams
  ): Promise<{ data: MembershipWithUser[]; total: number }>;
}
