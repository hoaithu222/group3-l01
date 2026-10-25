export const WHITEBOARD_VISIBILITIES = ["WORKSPACE", "PRIVATE"] as const;
export type WhiteboardVisibilityValue = (typeof WHITEBOARD_VISIBILITIES)[number];

export const WHITEBOARD_STATUSES = ["ACTIVE", "ARCHIVED"] as const;
export type WhiteboardStatusValue = (typeof WHITEBOARD_STATUSES)[number];

export const COLLABORATOR_ROLES = ["EDITOR", "VIEWER"] as const;
export type CollaboratorRoleValue = (typeof COLLABORATOR_ROLES)[number];

export const SNAPSHOT_KINDS = ["AUTO", "MANUAL", "PRE_RESTORE"] as const;
export type SnapshotKindValue = (typeof SNAPSHOT_KINDS)[number];

/** Metadata bảng trắng — KHÔNG mang `yjsState` (nặng, chỉ tải khi cần qua `WhiteboardWithState`). */
export interface WhiteboardEntity {
  id: string;
  workspaceId: string;
  name: string;
  normalizedName: string;
  visibility: WhiteboardVisibilityValue;
  status: WhiteboardStatusValue;
  yjsVersion: number;
  /** Số phần tử BE đếm từ Yjs ở lần nhận state gần nhất. */
  elementCount: number;
  thumbnailAssetId: string | null;
  lastEditedBy: string | null;
  lastEditedAt: Date | null;
  createdBy: string;
  /** Phiên bản optimistic của METADATA (đổi tên/visibility/ảnh thu nhỏ/lưu trữ/khôi phục snapshot). */
  version: number;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface WhiteboardWithState extends WhiteboardEntity {
  yjsState: Uint8Array | null;
}

export interface CollaboratorEntity {
  id: string;
  whiteboardId: string;
  userId: string;
  role: CollaboratorRoleValue;
  addedBy: string;
  createdAt: Date;
}

export interface SnapshotMeta {
  id: string;
  whiteboardId: string;
  kind: SnapshotKindValue;
  label: string | null;
  elementCount: number;
  createdBy: string | null;
  at: Date;
}

export interface SnapshotWithState extends SnapshotMeta {
  yjsState: Uint8Array;
}

/** Người dùng rút gọn hiển thị cạnh bảng/bản lưu (KHÔNG email/SĐT). */
export interface PersonRef {
  id: string;
  name: string;
}

export type MyRole = "CREATOR" | "EDITOR" | "VIEWER" | "MEMBER";

export interface WhiteboardView {
  id: string;
  workspaceId: string;
  name: string;
  visibility: WhiteboardVisibilityValue;
  status: WhiteboardStatusValue;
  elementCount: number;
  thumbnailAssetId: string | null;
  /** URL ký (≤ 60 s) của ảnh thu nhỏ; `null` khi chưa có/chưa xử lý xong. Chỉ có ở danh sách và chi tiết. */
  thumbnailUrl: string | null;
  lastEditedBy: PersonRef | null;
  lastEditedAt: Date | null;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  version: number;
  yjsVersion: number;
  myRole: MyRole;
}

export interface WhiteboardDetailView extends WhiteboardView {
  myPermissions: { edit: boolean; manage: boolean; snapshot: boolean; restore: boolean };
}

export interface CursorPage<T> {
  data: T[];
  nextCursor: string | null;
  hasMore: boolean;
  limit: number;
}
