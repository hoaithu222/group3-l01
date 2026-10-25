/**
 * Kiểu DTO của backend (be.md p1-01 §4) — CHUẨN HOÁ tên trường ở `workspaces.service.ts`
 * nếu backend đổi tên; component chỉ thấy kiểu ở đây.
 */

import type { TemplateApplyResult } from '@/shared/workspace-templates';

import type { GuestPolicy, JoinPolicy } from './access.types';

export type WorkspaceStatus = 'ACTIVE' | 'ARCHIVED';
export type WorkspaceArchiveReason = 'MANUAL' | 'PLATFORM';
export type WorkspaceRole = 'OWNER' | 'ADMIN' | 'MEMBER' | 'GUEST';
export type NotifyMode = 'INHERIT' | 'ALL_MESSAGES' | 'MENTIONS_AND_THREADS' | 'MUTED';

/**
 * Mẫu nền bìa khi nhóm CHƯA có ảnh bìa (be.md, `workspace.interface.ts` §`WORKSPACE_COVER_PRESETS`) — BE chỉ lưu
 * KHOÁ, client tự vẽ màu (`utils/workspace-cover.ts`). ⚠️ Thêm/bớt khoá thì sửa CẢ HAI phía (BE + bảng màu ở đây).
 */
export const WORKSPACE_COVER_PRESETS = ['violet', 'amber', 'ocean', 'forest', 'sunset', 'rose', 'slate'] as const;
export type WorkspaceCoverPreset = (typeof WORKSPACE_COVER_PRESETS)[number];

/**
 * Ảnh nhóm dùng chung cho danh sách/chi tiết (be.md §`WorkspaceImageView`) — URL đã ký sẵn từ BE, dùng THẲNG làm
 * nguồn ảnh (không qua `useAssetUrl`). `coverPreset: null` = nhóm chưa chọn ⇒ suy màu ổn định theo id nhóm
 * (`coverPresetFor`, `utils/workspace-cover.ts`).
 */
export interface WorkspaceImageFields {
  coverUrl: string | null;
  coverThumbUrl: string | null;
  coverPreset: WorkspaceCoverPreset | null;
}

export interface WorkspaceListItem extends WorkspaceImageFields {
  id: string;
  name: string;
  avatarUrl: string | null;
  descriptionShort: string | null;
  /**
   * `'PENDING'` (p3-04, be.md §5.5): nhóm bật duyệt thành viên và mình mới chỉ có
   * YÊU CẦU chờ duyệt — thẻ hiện "Đang chờ duyệt", chạm vào mở màn chờ chứ không mở nhóm.
   */
  status: WorkspaceStatus | 'PENDING';
  myRole: WorkspaceRole;
  /** Hạn của CHÍNH MÌNH khi `myRole === 'GUEST'` — ⚠️ tên trường chưa đối chiếu BE (be.md không khai). */
  myExpiresAt?: string | null;
  isFavorite: boolean;
  position: number | null;
  unreadCount: number;
  mentionCount: number;
  unreadAvailable: boolean;
  lastActivityAt: string;
}

export interface WorkspaceMyPermissions {
  canEdit: boolean;
  canArchive: boolean;
  canTransfer: boolean;
  canInvite: boolean;
  canCreateChannel: boolean;
  canLeave: boolean;
}

export interface WorkspaceDetail extends WorkspaceImageFields {
  id: string;
  name: string;
  description: string | null;
  avatarUrl: string | null;
  defaultChannelId: string | null;
  status: WorkspaceStatus;
  archivedAt: string | null;
  archivedReason: WorkspaceArchiveReason | null;
  /** Khách KHÔNG thấy số thành viên (be.md p3-04 §5.6 "không `memberCount`") — vắng mặt với GUEST. */
  memberCount?: number;
  myRole: WorkspaceRole;
  /** Hạn của CHÍNH MÌNH khi `myRole === 'GUEST'` — ⚠️ tên trường chưa đối chiếu BE (be.md không khai). */
  myExpiresAt?: string | null;
  /**
   * p3-04: chính sách vào nhóm/mời khách. ⚠️ be.md chỉ khai `PATCH …/settings`; đọc giá trị
   * hiện tại giả định nằm trong `WorkspaceDetail` (chưa đối chiếu BE).
   */
  joinPolicy?: JoinPolicy;
  guestPolicy?: GuestPolicy | null;
  myPermissions: WorkspaceMyPermissions;
  isFavorite: boolean;
  position: number | null;
  notifyMode: NotifyMode;
  version: number;
  createdAt: string;
}

export interface WorkspaceOverview {
  workspace: WorkspaceDetail;
  channels: unknown | null;
  needsResponse: unknown | null;
  recentGroups: unknown | null;
  memberCount: number;
  admin?: unknown;
  upcomingMeetings?: unknown;
}

export interface CreateWorkspacePayload {
  name: string;
  description?: string;
  avatarAssetId?: string;
  /** p5-04 — tạo nhóm từ mẫu (`GET /workspace-templates`); BE trả 404 `CFG_005` khi cờ phụ `workspaceTemplates` tắt. */
  templateCode?: string;
  /** Chỉ đi kèm `templateCode`. Vắng → kênh `defaultSelected` của mẫu; `[]` → không kênh nào (BE chấp nhận). */
  channelKeys?: string[];
}

export interface CreateWorkspaceResponse {
  workspace: WorkspaceDetail;
  defaultChannel: { id: string; name: string };
  /** p5-04 — kết quả áp mẫu, CHỈ có khi request gửi `templateCode`. `failed: true` = nhóm đã tạo nhưng áp mẫu lỗi. */
  template?: TemplateApplyResult;
}

export interface UpdateWorkspacePayload {
  name?: string;
  description?: string | null;
  avatarAssetId?: string | null;
  /** `null` = gỡ ảnh bìa (bìa quay về màu suy từ `coverPreset`/id nhóm) — cùng quy ước với `avatarAssetId`. */
  coverAssetId?: string | null;
  expectedVersion: number;
}

export interface WorkspaceMePayload {
  isFavorite?: boolean;
  position?: number;
  notifyMode?: NotifyMode;
}

export interface WorkspaceMeSettings {
  isFavorite: boolean;
  position: number | null;
  notifyMode: NotifyMode;
}

export interface ArchiveWorkspacePayload {
  expectedVersion: number;
  note?: string;
}

export interface TransferOwnerPayload {
  toUserId: string;
  confirmName: string;
  expectedVersion: number;
}

/**
 * Một dòng của `GET /workspaces/:id/members` (be.md p1-02 §4) — chỉ giữ trường
 * `TransferOwnerSheet` cần. Khai ĐỘC LẬP với `members.types.ts` (không import
 * chéo feature). `displayName` ưu tiên hơn `name` khi so khớp `confirmName`:
 * BE so với `membership.displayName ?? user.name` (`workspace-lifecycle.service.ts`).
 */
export interface TransferOwnerCandidate {
  userId: string;
  name: string;
  displayName: string | null;
  avatarUrl: string | null;
  role: WorkspaceRole;
  isMe: boolean;
}
