/**
 * Khai ĐỘC LẬP với Prisma enum/model (cùng giá trị) — module không import
 * chéo kiểu Prisma thẳng vào tầng domain, giống `modules/members/entities`
 * (`.claude/rules/architecture.md`).
 */
export const CHANNEL_TYPES = ["TEXT", "VOICE", "POMODORO"] as const;
export type ChannelTypeValue = (typeof CHANNEL_TYPES)[number];

export const CHANNEL_VISIBILITIES = ["PUBLIC", "PRIVATE"] as const;
export type ChannelVisibilityValue = (typeof CHANNEL_VISIBILITIES)[number];

export const POSTING_POLICIES = ["MEMBERS", "ADMINS_ONLY"] as const;
export type PostingPolicyValue = (typeof POSTING_POLICIES)[number];

export const CHANNEL_STATUSES = ["ACTIVE", "ARCHIVED"] as const;
export type ChannelStatusValue = (typeof CHANNEL_STATUSES)[number];

export const CHANNEL_ARCHIVE_REASONS = ["MANUAL", "NO_MANAGER", "PLATFORM"] as const;
export type ChannelArchiveReasonValue = (typeof CHANNEL_ARCHIVE_REASONS)[number];

export const GRANT_LEVELS = ["MEMBER", "MANAGER"] as const;
export type GrantLevelValue = (typeof GRANT_LEVELS)[number];

export const GRANT_SOURCES = ["DIRECT", "ROLE"] as const;
export type GrantSourceValue = (typeof GRANT_SOURCES)[number];

/** Nguồn hiệu lực của quyền đọc một kênh riêng tư (`GET /channels/:id/members/:userId/access`, PR-05): `DIRECT` | `ROLE:ADMIN` | `ROLE:MEMBER`. */
export type EffectiveAccessSource = "DIRECT" | "ROLE:ADMIN" | "ROLE:MEMBER";

/** Cùng giá trị enum `NotifyMode` (Prisma, dùng chung `WorkspaceMembership`/`ChannelMembership`, D-23). */
export const CHANNEL_NOTIFY_MODES = ["INHERIT", "ALL_MESSAGES", "MENTIONS_AND_THREADS", "MUTED"] as const;
export type ChannelNotifyModeValue = (typeof CHANNEL_NOTIFY_MODES)[number];

/** Cấu hình phòng thoại của kênh VOICE (p2-03) — khớp `type ChannelVoiceSettings` trong schema. */
export interface ChannelVoiceSettings {
  allowVideo: boolean;
  maxParticipants: number;
}

export interface Channel {
  id: string;
  workspaceId: string;
  name: string;
  normalizedName: string;
  description: string | null;
  type: ChannelTypeValue;
  visibility: ChannelVisibilityValue;
  postingPolicy: PostingPolicyValue;
  status: ChannelStatusValue;
  archiveReason: ChannelArchiveReasonValue | null;
  archivedAt: Date | null;
  archivedBy: string | null;
  isDefault: boolean;
  position: number;
  lastSeq: number;
  lastMessageAt: Date | null;
  lastMessageId: string | null;
  memberCount: number;
  createdBy: string;
  /** Chỉ có ở kênh VOICE đã từng đặt cấu hình; vắng/`null` ⇒ mặc định (`effectiveVoiceSettings`). */
  voiceSettings?: ChannelVoiceSettings | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ChannelMembership {
  id: string;
  channelId: string;
  workspaceId: string;
  userId: string;
  notifyMode: ChannelNotifyModeValue;
  pinned: boolean;
  position: number | null;
  joinedAt: Date;
  updatedAt: Date;
}

export interface ChannelGrant {
  id: string;
  channelId: string;
  workspaceId: string;
  /** `null` khi `source = ROLE` (grant theo vai trò không thuộc riêng người nào). */
  userId: string | null;
  /** `userId` (DIRECT) | `"role:ADMIN"` | `"role:MEMBER"` (ROLE) — khoá unique `[channelId, subjectKey, source]`. */
  subjectKey: string;
  level: GrantLevelValue;
  source: GrantSourceValue;
  roleRef: string | null;
  grantedBy: string;
  createdAt: Date;
}

export interface ChannelUserSummary {
  id: string;
  name: string;
  normalizedName: string;
  avatarAssetId: string | null;
}

export interface ChannelMembershipWithUser {
  membership: ChannelMembership;
  user: ChannelUserSummary;
}

/** Grant DIRECT kèm người được cấp — grant ROLE không có người nên không xuất hiện ở kiểu này. */
export interface ChannelGrantWithUser {
  grant: ChannelGrant;
  user: ChannelUserSummary;
}

/** Trạng thái quyền đọc thật của 1 người với 1 kênh riêng tư (PR-05). */
export interface ChannelMemberAccess {
  read: boolean;
  write: boolean;
  manage: boolean;
  effectiveSources: EffectiveAccessSource[];
}

export interface ChannelMeUpdateInput {
  notifyMode?: ChannelNotifyModeValue;
  pinned?: boolean;
  position?: number;
}

export interface ListChannelMembersParams {
  q?: string;
  page: number;
  limit: number;
}

export interface AdminListChannelsParams {
  page: number;
  limit: number;
  /** Lọc phía server (admin.md §2.1) — vắng = mọi trạng thái/loại. */
  status?: ChannelStatusValue;
  type?: ChannelTypeValue;
}

/**
 * be.md §4 `GET /admin/workspaces/:workspaceId/channels` — `messages7d` đếm
 * `Message` của kênh trong 7 ngày (repository Prisma, 1 `groupBy`/trang); phản
 * hồi archive/restore (`toAdminChannelRow`) vẫn trả 0. `isDefault`/`archiveReason` KHÔNG có trong bảng
 * kiểu be.md §4 gốc nhưng admin.md §2.1/§2.2 cần cả hai (cột "Trạng thái"
 * kèm lý do; nút lưu trữ kênh mặc định phải disable) — bổ sung ở đây, be.md
 * §4 chưa cập nhật theo (điểm mở p1-03 README §10).
 */
export interface AdminChannelRow {
  id: string;
  name: string;
  type: ChannelTypeValue;
  postingPolicy: PostingPolicyValue;
  status: ChannelStatusValue;
  isDefault: boolean;
  archiveReason: ChannelArchiveReasonValue | null;
  memberCount: number;
  messages7d: number;
  createdAt: Date;
}
