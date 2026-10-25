/**
 * Kiểu DTO của backend (be.md p1-02 §4) — khai ĐỘC LẬP với module `workspaces`
 * (cùng giá trị `WorkspaceRole`, không import chéo feature — `feature-structure.md`).
 */

export type WorkspaceRole = 'OWNER' | 'ADMIN' | 'MEMBER' | 'GUEST';
export type MembershipStatus = 'ACTIVE' | 'PENDING' | 'LEFT' | 'REMOVED' | 'BANNED';
export type PresenceState = 'ONLINE' | 'IDLE' | 'DND' | 'OFFLINE' | 'HIDDEN';

/** Vai trò lọc được ở `GET /workspaces/:id/members` — GUEST chưa vào P0 (p3-04). */
export type MemberRoleFilter = 'OWNER' | 'ADMIN' | 'MEMBER';
/** `status` lọc được — `BANNED` chỉ OWNER/ADMIN mới xem (PERM_001 với MEMBER). */
export type MemberStatusFilter = 'ACTIVE' | 'BANNED';

export interface MemberRow {
  userId: string;
  name: string;
  displayName: string | null;
  avatarUrl: string | null;
  role: WorkspaceRole;
  status: MembershipStatus;
  joinedAt: string;
  presence: PresenceState;
  isMe: boolean;
  /**
   * p3-04 — hạn của KHÁCH (`role === 'GUEST'`). BE chỉ gửi cho OWNER/ADMIN
   * (be.md §6); vắng mặt với mọi vai trò khác. ⚠️ Tên trường chưa đối chiếu BE
   * (be.md không khai `MemberDto` cho khách).
   */
  expiresAt?: string | null;
  /**
   * p6-03 — nhãn hiển thị do phân hệ khác gắn vào thành viên; hiện chỉ có `"MENTOR"` (cố vấn, là KHÁCH có hạn). BE gửi cho MỌI người xem
   * (`member.presenter.ts`), vắng mặt khi không có; `member:updated` mang cùng trường. Giá trị lạ thì bỏ qua (không vẽ nhãn).
   */
  displayTag?: string | null;
}

export interface MemberActions {
  canMessage: boolean;
  canCall: boolean;
  canChangeRole: boolean;
  canRemove: boolean;
  canBan: boolean;
}

export interface MemberCard extends MemberRow {
  actions: MemberActions;
  /**
   * p3-04 — chỉ có với thẻ của KHÁCH mà người xem là OWNER/ADMIN: `membership.version`
   * (`expectedVersion` của `PATCH …/guest`) và id kênh đang chỉ định. ⚠️ Giả định
   * theo be.md §3 `updateGuestSchema` — chưa đối chiếu BE.
   */
  version?: number;
  guestChannelIds?: string[];
}

export interface ListMembersFilter {
  q?: string;
  role?: MemberRoleFilter;
  status?: MemberStatusFilter;
}

/** Meta phân trang theo trang (`ResponseUtils.paginated`, khác `invites` là cursor). */
export interface PageMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export interface MemberListPage {
  items: MemberRow[];
  meta: PageMeta;
}

export interface PatchMemberPayload {
  role?: 'ADMIN' | 'MEMBER';
  displayName?: string | null;
}

/** Body chung của remove/ban/unban — lý do ≥ 10 ký tự (`reasonSchema`). */
export interface ModerateMemberPayload {
  reason: string;
}

/**
 * p7-03 (P1) — mức rủi ro burnout MỚI NHẤT của một thành viên đã TỰ chia sẻ với nhóm này (`GET /workspaces/:id/wellbeing/indicators`,
 * chỉ OWNER/ADMIN gọi được). KHÔNG điểm/phút hoạt động — chỉ đủ để vẽ chấm cam "Cần chú ý" khi `level` là `MEDIUM`/`HIGH`.
 */
export type WorkspaceWellbeingLevel = 'LOW' | 'MEDIUM' | 'HIGH';

export interface WorkspaceWellbeingIndicator {
  userId: string;
  level: WorkspaceWellbeingLevel;
  date: string;
}
