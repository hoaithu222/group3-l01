export const WORKSPACE_STATUSES = ["ACTIVE", "ARCHIVED"] as const;
export type WorkspaceStatusValue = (typeof WORKSPACE_STATUSES)[number];

export const WORKSPACE_ARCHIVE_REASONS = ["MANUAL", "PLATFORM"] as const;
export type WorkspaceArchiveReasonValue = (typeof WORKSPACE_ARCHIVE_REASONS)[number];

export const WORKSPACE_ROLES = ["OWNER", "ADMIN", "MEMBER", "GUEST"] as const;
export type WorkspaceRoleValue = (typeof WORKSPACE_ROLES)[number];

export const MEMBERSHIP_STATUSES = ["ACTIVE", "PENDING", "LEFT", "REMOVED", "BANNED"] as const;
export type MembershipStatusValue = (typeof MEMBERSHIP_STATUSES)[number];

export const JOIN_POLICIES = ["OPEN", "APPROVAL"] as const;
export type JoinPolicyValue = (typeof JOIN_POLICIES)[number];

export const NOTIFY_MODES = ["INHERIT", "ALL_MESSAGES", "MENTIONS_AND_THREADS", "MUTED"] as const;
export type NotifyModeValue = (typeof NOTIFY_MODES)[number];

/**
 * Mẫu nền bìa dựng sẵn khi nhóm CHƯA có ảnh bìa — server chỉ lưu KHOÁ, client tự vẽ gradient bằng token màu của mình
 * (app: `WorkspaceCover`, admin: `WorkspaceCoverBanner`). ⚠️ Thêm/bớt khoá thì sửa cả hai client (bảng khoá → token).
 * `null` = chưa chọn ⇒ client chọn ổn định theo id nhóm (mỗi nhóm một màu, không đổi giữa các lần mở).
 */
export const WORKSPACE_COVER_PRESETS = ["violet", "amber", "ocean", "forest", "sunset", "rose", "slate"] as const;
export type WorkspaceCoverPreset = (typeof WORKSPACE_COVER_PRESETS)[number];

/** Giá trị đọc từ DB (chuỗi tự do) → khoá hợp lệ hoặc `null` — khoá đã bỏ khỏi bảng không làm vỡ client. */
export function toWorkspaceCoverPreset(value: string | null | undefined): WorkspaceCoverPreset | null {
  return (WORKSPACE_COVER_PRESETS as readonly string[]).includes(value ?? "") ? (value as WorkspaceCoverPreset) : null;
}

/** Ảnh nhóm trong view (`GET /workspaces`, `GET /workspaces/:id`, socket `workspace:updated`, admin). URL ký sẵn, dùng thẳng làm nguồn ảnh. */
export interface WorkspaceImageView {
  /** Ảnh đại diện (bản THUMB) — `null` = chưa đặt, client vẽ chữ cái đầu tên. */
  avatarUrl: string | null;
  /** Ảnh bìa bản gốc (khổ lớn — đầu trang nhóm). `null` = chưa đặt, client vẽ nền theo `coverPreset`. */
  coverUrl: string | null;
  /** Ảnh bìa bản THUMB (≤ 320 px — ô nhỏ, danh sách admin). */
  coverThumbUrl: string | null;
  coverPreset: WorkspaceCoverPreset | null;
}

export interface Workspace {
  id: string;
  name: string;
  normalizedName: string;
  description: string | null;
  avatarAssetId: string | null;
  ownerId: string;
  defaultChannelId: string | null;
  status: WorkspaceStatusValue;
  archivedAt: Date | null;
  archivedBy: string | null;
  archivedReason: WorkspaceArchiveReasonValue | null;
  archiveNote: string | null;
  memberCount: number;
  lastActivityAt: Date;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  // ── p3-04 — optional để mã/test Phase 1 dựng `Workspace` không phải điền ──
  /** `OPEN` (mặc định) | `APPROVAL` — link mời chỉ tạo yêu cầu chờ duyệt. */
  joinPolicy?: JoinPolicyValue;
  /** JSON thô `{ enabled, maxGuests, maxDays, memberCanInvite }` hoặc `null` (theo mặc định nền tảng) — chuẩn hoá bằng `resolveGuestPolicy`. */
  guestPolicy?: unknown;
  /** Múi giờ IANA của nhóm (đồng bộ chéo #9); vắng/`null` = theo mặc định hệ thống. */
  timezone?: string | null;
  /** Ảnh bìa (khớp `AssetLink(WORKSPACE_COVER)`); optional để fixture/test cũ không phải điền. */
  coverAssetId?: string | null;
  /**
   * Mẫu nền bìa khi chưa có ảnh — khoá `WORKSPACE_COVER_PRESETS`. Chuỗi THÔ như DB (service truyền thẳng hàng Prisma vào
   * presenter); presenter lọc qua `toWorkspaceCoverPreset` nên khoá lạ/đã bỏ ra `null`.
   */
  coverPreset?: string | null;
}

export interface WorkspaceCreateInput {
  name: string;
  normalizedName: string;
  description?: string;
  avatarAssetId?: string;
  ownerId: string;
}

export interface WorkspaceUpdateInput {
  name?: string;
  normalizedName?: string;
  description?: string | null;
  avatarAssetId?: string | null;
}

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
  isFavorite: boolean;
  position: number | null;
  notifyMode: NotifyModeValue;
  lastVisitedAt: Date | null;
  /** p3-04 — thời điểm xin tham gia (status PENDING). */
  requestedAt?: Date | null;
}

/** Item trả về `GET /workspaces` (be.md §4). */
export interface WorkspaceListItem extends WorkspaceImageView {
  id: string;
  name: string;
  descriptionShort: string | null;
  /** `PENDING` (p3-04): nhóm bật duyệt và người xem mới có YÊU CẦU chờ duyệt — thẻ hiện "Đang chờ duyệt". */
  status: WorkspaceStatusValue | "PENDING";
  myRole: WorkspaceRoleValue;
  /** p3-04 — hạn của CHÍNH MÌNH khi `myRole === "GUEST"`; vắng mặt với vai trò khác. */
  myExpiresAt?: Date | null;
  isFavorite: boolean;
  position: number | null;
  unreadCount: number;
  mentionCount: number;
  unreadAvailable: boolean;
  lastActivityAt: Date;
}

export interface WorkspaceMeUpdateInput {
  isFavorite?: boolean;
  position?: number;
  notifyMode?: NotifyModeValue;
}

/** Trả về sau `PATCH /workspaces/:id/me` — khác `WorkspaceMeUpdateInput` (input) vì `position` đọc từ DB có thể `null`. */
export interface WorkspaceMeSettings {
  isFavorite: boolean;
  position: number | null;
  notifyMode: NotifyModeValue;
}

export interface AdminListWorkspacesParams {
  page: number;
  limit: number;
  q?: string;
  status?: WorkspaceStatusValue;
  ownerId?: string;
  createdFrom?: Date;
  createdTo?: Date;
  sort: "lastActivityAt" | "createdAt" | "memberCount" | "name";
}

/** Hàng repository trả cho admin — asset id thô; presenter `toAdminWorkspaceRow` đổi thành URL (repo không dựng view). */
export type AdminWorkspaceRecord = Omit<AdminWorkspaceRow, keyof WorkspaceImageView> &
  Pick<Workspace, "avatarAssetId"> & { coverAssetId: string | null; coverPreset: string | null };

export interface AdminWorkspaceRow extends WorkspaceImageView {
  id: string;
  name: string;
  owner: { id: string; name: string } | null;
  memberCount: number;
  status: WorkspaceStatusValue;
  createdAt: Date;
  lastActivityAt: Date;
}
