import type { ResolvedAccess } from "../../../core/permission";
import type { GuestPolicy } from "../../../core/constants/guest-policy";
import {
  toWorkspaceCoverPreset,
  type AdminWorkspaceRecord,
  type AdminWorkspaceRow,
  type Workspace,
  type WorkspaceMembership,
  type WorkspaceListItem,
  type WorkspaceImageView,
  type WorkspaceRoleValue,
  type NotifyModeValue,
} from "../entities/workspace.interface";
import { effectiveWorkspaceTimeZone } from "../../../core/config/workspace-timezone";
import { DEFAULT_TIME_ZONE } from "../../../core/utils/local-date";
import { avatarUrlOf, displayImageUrl } from "../../../shared/media";
import type { UnreadSummary } from "./unread-summary.port";

const DESCRIPTION_SHORT_MAX = 140;

/** be.md §4 — bảng nút do server tính, client không tự suy từ vai trò. */
export interface WorkspaceMyPermissions {
  canEdit: boolean;
  canArchive: boolean;
  canTransfer: boolean;
  canInvite: boolean;
  canCreateChannel: boolean;
  canLeave: boolean;
}

export interface WorkspaceDetail extends WorkspaceImageView {
  id: string;
  name: string;
  description: string | null;
  defaultChannelId: string | null;
  status: Workspace["status"];
  archivedAt: Date | null;
  archivedReason: Workspace["archivedReason"];
  /** Khách KHÔNG thấy số thành viên (p3-04 §5.6) — vắng mặt với GUEST. */
  memberCount?: number;
  myRole: WorkspaceRoleValue;
  /** p3-04 — hạn của CHÍNH MÌNH khi là khách. */
  myExpiresAt?: Date | null;
  /** p3-04 — chính sách vào nhóm/mời khách; KHÔNG trả cho khách. */
  joinPolicy?: "OPEN" | "APPROVAL";
  guestPolicy?: GuestPolicy;
  /**
   * Múi giờ tính "ngày" của nhóm (đồng bộ chéo #9): `timezone` = giá trị OWNER/ADMIN đã đặt (`null` = theo mặc định hệ thống), `effectiveTimezone` = múi giờ ĐANG được dùng
   * (luôn là IANA hợp lệ: `timezone` hoặc mặc định `pm.timezone` → `CRON_TZ`) — client hiển thị/chọn dựa trên hai trường này, không tự suy.
   */
  timezone: string | null;
  effectiveTimezone: string;
  myPermissions: WorkspaceMyPermissions;
  /** Thiết lập cá nhân (D-23) — app dùng để tô sẵn màn cài đặt, KHÔNG có ở `WorkspaceListItem`. */
  isFavorite: boolean;
  position: number | null;
  notifyMode: NotifyModeValue;
  version: number;
  createdAt: Date;
}

function shortDescription(description: string | null): string | null {
  if (!description) return null;
  return description.length > DESCRIPTION_SHORT_MAX
    ? `${description.slice(0, DESCRIPTION_SHORT_MAX)}…`
    : description;
}

/**
 * Ảnh nhóm cho mọi view (danh sách, chi tiết, socket, admin) — URL ký sẵn dựng từ asset id, KHÔNG truy vấn thêm
 * (`shared/media/display-image.ts`). Đọc CỘT `avatarAssetId`/`coverAssetId` (ghi cùng transaction với `AssetLink` ở
 * `WorkspaceService`); nhóm cũ chỉ có link mà cột trống → `npm run db:backfill-workspace-images`.
 */
export function workspaceImagesOf(
  workspace: Pick<Workspace, "avatarAssetId" | "coverAssetId" | "coverPreset">
): WorkspaceImageView {
  return {
    avatarUrl: avatarUrlOf(workspace.avatarAssetId),
    coverUrl: displayImageUrl(workspace.coverAssetId, "ORIGINAL"),
    coverThumbUrl: displayImageUrl(workspace.coverAssetId, "THUMB"),
    coverPreset: toWorkspaceCoverPreset(workspace.coverPreset),
  };
}

/** `GET /admin/workspaces*` — admin xem được ảnh nhóm để kiểm duyệt (URL cùng loại với người dùng thấy). */
export function toAdminWorkspaceRow(record: AdminWorkspaceRecord): AdminWorkspaceRow {
  const { avatarAssetId, coverAssetId, coverPreset, ...rest } = record;
  return { ...rest, ...workspaceImagesOf({ avatarAssetId, coverAssetId, coverPreset }) };
}

/** Hàng admin từ một `Workspace` đầy đủ (chi tiết, sau khi gỡ ảnh) — cùng hình với hàng danh sách. */
export function toAdminWorkspaceRowOf(workspace: Workspace, owner: { id: string; name: string } | null): AdminWorkspaceRow {
  return toAdminWorkspaceRow({
    id: workspace.id,
    name: workspace.name,
    avatarAssetId: workspace.avatarAssetId,
    coverAssetId: workspace.coverAssetId ?? null,
    coverPreset: workspace.coverPreset ?? null,
    owner,
    memberCount: workspace.memberCount,
    status: workspace.status,
    createdAt: workspace.createdAt,
    lastActivityAt: workspace.lastActivityAt,
  });
}

export function toWorkspaceListItem(
  workspace: Workspace,
  membership: WorkspaceMembership,
  unread: UnreadSummary | undefined
): WorkspaceListItem {
  return {
    id: workspace.id,
    name: workspace.name,
    ...workspaceImagesOf(workspace),
    descriptionShort: shortDescription(workspace.description),
    // p3-04: người mới có yêu cầu chờ duyệt thấy thẻ "Đang chờ duyệt" (status PENDING).
    status: membership.status === "PENDING" ? "PENDING" : workspace.status,
    myRole: membership.role,
    ...(membership.role === "GUEST" && { myExpiresAt: membership.expiresAt }),
    isFavorite: membership.isFavorite,
    position: membership.position,
    unreadCount: unread?.unreadCount ?? 0,
    mentionCount: unread?.mentionCount ?? 0,
    unreadAvailable: unread !== undefined,
    lastActivityAt: workspace.lastActivityAt,
  };
}

export function buildWorkspaceMyPermissions(
  access: ResolvedAccess,
  role: WorkspaceRoleValue,
  policy?: GuestPolicy
): WorkspaceMyPermissions {
  return {
    canEdit: access.actions.has("workspace.update"),
    canArchive: access.actions.has("workspace.archive"),
    canTransfer: access.actions.has("workspace.transfer"),
    // OWNER/ADMIN, hoặc MEMBER khi nhóm bật `guestPolicy.memberCanInvite` (mời MEMBER qua email — be.md p3-04 §6).
    canInvite: access.actions.has("workspace.member.invite") || (role === "MEMBER" && policy?.memberCanInvite === true),
    canCreateChannel: access.actions.has("workspace.channel.create"),
    canLeave: role !== "OWNER",
  };
}

export function toWorkspaceDetail(
  workspace: Workspace,
  memberCount: number,
  access: ResolvedAccess,
  membership: Pick<WorkspaceMembership, "role" | "isFavorite" | "position" | "notifyMode"> & Partial<Pick<WorkspaceMembership, "expiresAt">>,
  policy?: GuestPolicy,
  /** Múi giờ mặc định của hệ thống (`systemDefaultTimeZone()`) — vắng thì dùng `Asia/Ho_Chi_Minh` (unit test cũ). */
  defaultTimezone: string = DEFAULT_TIME_ZONE
): WorkspaceDetail {
  const isGuest = membership.role === "GUEST";
  return {
    id: workspace.id,
    name: workspace.name,
    description: workspace.description,
    ...workspaceImagesOf(workspace),
    defaultChannelId: workspace.defaultChannelId,
    status: workspace.status,
    archivedAt: workspace.archivedAt,
    archivedReason: workspace.archivedReason,
    ...(!isGuest && { memberCount }),
    myRole: membership.role,
    ...(isGuest && { myExpiresAt: membership.expiresAt ?? null }),
    ...(!isGuest && { joinPolicy: workspace.joinPolicy ?? "OPEN", ...(policy && { guestPolicy: policy }) }),
    timezone: workspace.timezone ?? null,
    effectiveTimezone: effectiveWorkspaceTimeZone(workspace.timezone, defaultTimezone),
    myPermissions: buildWorkspaceMyPermissions(access, membership.role, policy),
    isFavorite: membership.isFavorite,
    position: membership.position,
    notifyMode: membership.notifyMode,
    version: workspace.version,
    createdAt: workspace.createdAt,
  };
}


