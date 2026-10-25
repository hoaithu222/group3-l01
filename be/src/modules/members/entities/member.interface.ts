/**
 * Khai ĐỘC LẬP với `modules/workspaces/entities/workspace.interface.ts` (cùng
 * giá trị, cùng nguồn Prisma `WorkspaceRole`/`MembershipStatus`) — module
 * không import chéo module (`.claude/rules/architecture.md`), giống cách
 * `modules/assets` tự khai `ASSET_STATUSES` thay vì import kiểu Prisma thẳng.
 */
export const WORKSPACE_ROLES = ["OWNER", "ADMIN", "MEMBER", "GUEST"] as const;
export type WorkspaceRoleValue = (typeof WORKSPACE_ROLES)[number];

export const MEMBERSHIP_STATUSES = ["ACTIVE", "PENDING", "LEFT", "REMOVED", "BANNED"] as const;
export type MembershipStatusValue = (typeof MEMBERSHIP_STATUSES)[number];

export interface WorkspaceMembership {
  id: string;
  workspaceId: string;
  userId: string;
  role: WorkspaceRoleValue;
  status: MembershipStatusValue;
  displayName: string | null;
  joinedAt: Date;
  leftAt: Date | null;
  expiresAt: Date | null;
  invitedBy: string | null;
  inviteLinkId: string | null;
  banReason: string | null;
  removedBy: string | null;
  // ── p3-04 — optional để mã/test Phase 1 dựng `WorkspaceMembership` không phải điền ──
  /** Tăng mỗi lần đổi/gia hạn hạn khách; đồng thời là "version" (`expectedVersion`) của `PATCH …/guest`. */
  expiryVersion?: number;
  /** LEFT | REMOVED | BANNED | EXPIRED | REJECTED. */
  leftReason?: string | null;
  requestMessage?: string | null;
  requestedAt?: Date | null;
  decidedBy?: string | null;
  decidedAt?: Date | null;
  invitationId?: string | null;
  /** p6-03 — nhãn hiển thị (vd `"MENTOR"` cho khách là cố vấn), KHÔNG phải quyền. */
  displayTag?: string | null;
}

export type PresenceStateValue = "ONLINE" | "IDLE" | "DND" | "OFFLINE" | "HIDDEN";

/** `GET /workspaces/:id/members` item (be.md p1-02 §4) — KHÔNG có email (MB-07). */
export interface MemberRow {
  userId: string;
  name: string;
  displayName: string | null;
  avatarUrl: string | null;
  role: WorkspaceRoleValue;
  status: MembershipStatusValue;
  joinedAt: Date;
  presence: PresenceStateValue;
  isMe: boolean;
  /** p3-04 — hạn của KHÁCH; chỉ OWNER/ADMIN thấy (vắng với người xem khác và với vai trò không phải GUEST). */
  expiresAt?: Date | null;
  /** p6-03 — nhãn hiển thị cạnh tên (vd `"MENTOR"` → "Cố vấn"); vắng khi không có. */
  displayTag?: string;
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
  /** p3-04 — chỉ thẻ KHÁCH mà người xem là OWNER/ADMIN: `expectedVersion` của `PATCH …/guest` (= `expiryVersion`) + kênh đang chỉ định. */
  version?: number;
  guestChannelIds?: string[];
}

export interface ListMembersParams {
  q?: string;
  role?: WorkspaceRoleValue;
  status: "ACTIVE" | "BANNED";
  sort: "role" | "name" | "joinedAt";
  page: number;
  limit: number;
}

export interface AdminMemberRow {
  user: { id: string; name: string; email?: string };
  role: WorkspaceRoleValue;
  status: MembershipStatusValue;
  joinedAt: Date;
  invitedBy: string | null;
  expiresAt: Date | null;
  banReason: string | null;
  /** p3-04 — thời điểm xin tham gia (status PENDING). */
  requestedAt: Date | null;
}

export interface AdminListMembersParams {
  q?: string;
  role?: WorkspaceRoleValue;
  status?: MembershipStatusValue;
  sort: "role" | "name" | "joinedAt";
  page: number;
  limit: number;
}
