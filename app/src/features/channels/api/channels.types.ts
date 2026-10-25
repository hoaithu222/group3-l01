/**
 * Kiểu DTO của backend (be.md p1-03 §2, §4) — khai ĐỘC LẬP với các feature
 * khác (`workspaces`, `members`): cùng GIÁ TRỊ (`NotifyMode`, `PresenceState`…)
 * nhưng không import chéo feature (`feature-structure.md`).
 */

import type { ChannelVoiceActivity } from '@/shared/calls';

export type ChannelType = 'TEXT' | 'VOICE' | 'POMODORO';
export type ChannelVisibility = 'PUBLIC' | 'PRIVATE';
export type PostingPolicy = 'MEMBERS' | 'ADMINS_ONLY';
export type ChannelStatus = 'ACTIVE' | 'ARCHIVED';
export type ChannelArchiveReason = 'MANUAL' | 'NO_MANAGER' | 'PLATFORM';
export type GrantLevel = 'MEMBER' | 'MANAGER';
export type GrantSource = 'DIRECT' | 'ROLE';
export type NotifyMode = 'INHERIT' | 'ALL_MESSAGES' | 'MENTIONS_AND_THREADS' | 'MUTED';
export type PresenceState = 'ONLINE' | 'IDLE' | 'DND' | 'OFFLINE' | 'HIDDEN';

/**
 * `unreadCount`/`mentionCount` phụ thuộc `UnreadSummaryPort` của p1-07
 * (be.md §5.2: "chưa có thì bỏ field") — luôn `optional`, KHÔNG coi vắng mặt
 * là lỗi hợp đồng. Cùng cách p1-01 đã xử lý `WorkspaceListItem.unreadCount`.
 *
 * ⚠️ `GET /workspaces/:id/channels` HIỆN KHÔNG trả hai số này (BE `toChannelListItem` không nhận tham số chưa đọc):
 * số thật của danh sách kênh đến từ `GET /me/unread?workspaceId=` — màn danh sách gộp vào bằng `withChannelUnread`
 * (`screens/channel-list.utils.ts`), nên `unreadCapped` (server chạm trần đếm → "99+") cũng chỉ do lần gộp đó đặt.
 */
export interface ChannelListItem {
  id: string;
  name: string;
  type: ChannelType;
  visibility: ChannelVisibility;
  postingPolicy: PostingPolicy;
  status: ChannelStatus;
  isDefault: boolean;
  pinned: boolean;
  position: number;
  notifyMode: NotifyMode;
  lastMessageAt: string | null;
  unreadCount?: number;
  mentionCount?: number;
  /** Server đếm chạm trần (`capped` của `/me/unread`) — số thật LỚN HƠN `unreadCount`; hiện "99+" thay vì con số. */
  unreadCapped?: boolean;
  /** Kênh VOICE đang có người trong phòng (BE p2-03 `voice` của danh sách kênh) — vắng = phòng trống. Realtime: `channel:voice-activity`. */
  voice?: ChannelVoiceActivity;
}

export interface ChannelMyPermissions {
  canWrite: boolean;
  canReact: boolean;
  canPin: boolean;
  canModerate: boolean;
  canManage: boolean;
  canArchive: boolean;
  canManageGrants: boolean;
  canLeave: boolean;
}

/**
 * Bản ghi thành viên/grant CỦA CHÍNH MÌNH — be.md §4 chỉ nêu tên trường
 * (`myMembership?`, `myGrant?`), không cho khuôn chi tiết. Khai TỐI THIỂU
 * những gì màn hình thật sự cần đọc (app.md §3 "Cá nhân": ghim/thông báo đã
 * có sẵn ở `ChannelListItem`, hai trường này chỉ còn cần cho hiển thị phụ).
 */
export interface ChannelMyMembership {
  joinedAt: string;
}

export interface ChannelMyGrant {
  level: GrantLevel;
  source: GrantSource;
  grantedBy: string;
}

export interface ChannelDetail extends ChannelListItem {
  description: string | null;
  memberCount: number;
  createdBy: string;
  version: number;
  myMembership?: ChannelMyMembership | null;
  myGrant?: ChannelMyGrant | null;
  myPermissions: ChannelMyPermissions;
}

export interface ChannelListResponse {
  joined: ChannelListItem[];
  discoverable: ChannelListItem[];
}

export interface CreateChannelPayload {
  name: string;
  description?: string;
  type: ChannelType;
  visibility: ChannelVisibility;
  postingPolicy: PostingPolicy;
  initialMemberIds: string[];
}

export interface UpdateChannelPayload {
  name?: string;
  description?: string | null;
  postingPolicy?: PostingPolicy;
  expectedVersion: number;
}

export interface ArchiveChannelPayload {
  expectedVersion: number;
  replacementDefaultChannelId?: string;
}

export interface ChannelMePayload {
  notifyMode?: NotifyMode;
  pinned?: boolean;
  position?: number;
}

export interface ChannelMeResult {
  notifyMode: NotifyMode;
  pinned: boolean;
  position: number | null;
}

export interface ChannelMemberRow {
  userId: string;
  name: string;
  avatarUrl: string | null;
  level?: GrantLevel;
  source?: GrantSource;
  presence: PresenceState;
}

/** Cùng khuôn `ResponseUtils.paginated` mà `members` (p1-02) đã dùng cho `/workspaces/:id/members`. */
export interface PageMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export interface ChannelMemberListPage {
  items: ChannelMemberRow[];
  meta: PageMeta;
}

export interface ChannelGrant {
  userId: string;
  name: string;
  level: GrantLevel;
  source: GrantSource;
  roleRef?: string | null;
  grantedBy: string;
  createdAt: string;
}

export interface AddGrantsPayload {
  userIds: string[];
  level: GrantLevel;
}

export type GrantSkipReason = 'NOT_ACTIVE_MEMBER' | 'ALREADY';

export interface AddGrantsResult {
  added: string[];
  skipped: { userId: string; reason: GrantSkipReason }[];
}

export interface PatchGrantPayload {
  level: GrantLevel;
}

/**
 * Lát TỐI THIỂU của `WorkspaceDetail` (be.md p1-01 §4) mà `ChannelListScreen`
 * cần — chỉ để quyết định hiện/ẩn nút "Tạo kênh". Response thật đầy đủ hơn
 * nhiều field; khai hẹp ở đây không cắt bớt dữ liệu thật, chỉ là nơi gọi không
 * cần tới phần còn lại (xem `useCanCreateChannel`, `channels.queries.ts`).
 */
export interface WorkspaceChannelPermissions {
  myPermissions: {
    canCreateChannel: boolean;
  };
}

/** Lựa chọn thành viên nhóm — dùng cho `AudienceStep` (tạo kênh) và `AddGrantSheet`. */
export interface WorkspaceMemberOption {
  userId: string;
  name: string;
  displayName: string | null;
  avatarUrl: string | null;
}

// ── p3-04: cấp quyền kênh riêng tư THEO VAI TRÒ (be.md p3-04 §4–§5.2) ──────────────────

/** `ADMIN` = OWNER + ADMIN; `MEMBER` = OWNER + ADMIN + MEMBER, KHÔNG gồm khách (README p3-04 §2). */
export type RoleRef = 'ADMIN' | 'MEMBER';

/**
 * Một dòng "cấp cho CẢ vai trò" của `GET /channels/:id/grants` (subject `ROLE`). Role grant
 * chỉ cấp MEMBER (đọc/ghi), không MANAGER — nên `level` luôn `'MEMBER'` ở dữ liệu thật.
 */
export interface RoleGrant {
  roleRef: RoleRef;
  level: GrantLevel;
  grantedBy: string;
  createdAt: string;
}

/** `GET /channels/:id/grants` đã chuẩn hoá: người được cấp TRỰC TIẾP + các vai trò được cấp. */
export interface ChannelGrantsSnapshot {
  users: ChannelGrant[];
  roles: RoleGrant[];
}

/**
 * `GET /channels/:id/members/:userId/access` (PR-05) — nguồn quyền HIỆU LỰC của một người:
 * `effectiveSources` gồm `'DIRECT'` và/hoặc `'ROLE:ADMIN'` · `'ROLE:MEMBER'`. Gỡ grant trực tiếp
 * mà còn `ROLE:*` thì người đó VẪN đọc được — UI phải giải thích.
 */
export interface ChannelMemberAccess {
  read: boolean;
  write: boolean;
  manage: boolean;
  effectiveSources: string[];
}
