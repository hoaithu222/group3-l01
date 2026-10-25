export const DOCUMENT_VISIBILITIES = ["WORKSPACE", "PRIVATE"] as const;
export type DocumentVisibilityValue = (typeof DOCUMENT_VISIBILITIES)[number];

export const DOCUMENT_STATUSES = ["ACTIVE", "ARCHIVED"] as const;
export type DocumentStatusValue = (typeof DOCUMENT_STATUSES)[number];

export const COLLABORATOR_ROLES = ["EDITOR", "VIEWER"] as const;
export type CollaboratorRoleValue = (typeof COLLABORATOR_ROLES)[number];

export const SNAPSHOT_KINDS = ["AUTO", "MANUAL", "PRE_RESTORE"] as const;
export type SnapshotKindValue = (typeof SNAPSHOT_KINDS)[number];

/** Metadata tài liệu — KHÔNG mang `yjsState` (nặng, chỉ tải khi cần qua `DocumentWithState`). */
export interface DocumentEntity {
  id: string;
  workspaceId: string;
  title: string;
  normalizedTitle: string;
  visibility: DocumentVisibilityValue;
  status: DocumentStatusValue;
  yjsVersion: number;
  stateBytes: number;
  wordCount: number;
  lastEditedBy: string | null;
  lastEditedAt: Date | null;
  createdBy: string;
  /** Phiên bản optimistic của METADATA (đổi tên/visibility/lưu trữ/khôi phục snapshot). */
  version: number;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface DocumentWithState extends DocumentEntity {
  yjsState: Uint8Array | null;
}

export interface CollaboratorEntity {
  id: string;
  documentId: string;
  userId: string;
  role: CollaboratorRoleValue;
  addedBy: string;
  createdAt: Date;
}

export interface SnapshotMeta {
  id: string;
  documentId: string;
  kind: SnapshotKindValue;
  label: string | null;
  yjsVersion: number;
  sizeBytes: number;
  createdBy: string | null;
  at: Date;
}

export interface SnapshotWithState extends SnapshotMeta {
  yjsState: Uint8Array;
}

/** Người dùng rút gọn hiển thị cạnh tài liệu/bản lưu (KHÔNG email/SĐT). */
export interface PersonRef {
  id: string;
  name: string;
}

export type MyRole = "CREATOR" | "EDITOR" | "VIEWER" | "MEMBER";

export interface DocumentView {
  id: string;
  workspaceId: string;
  title: string;
  visibility: DocumentVisibilityValue;
  status: DocumentStatusValue;
  wordCount: number;
  lastEditedBy: PersonRef | null;
  lastEditedAt: Date | null;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  version: number;
  yjsVersion: number;
  myRole: MyRole;
}

export interface DocumentDetailView extends DocumentView {
  myPermissions: { edit: boolean; manage: boolean; snapshot: boolean; restore: boolean };
}

export interface CursorPage<T> {
  data: T[];
  nextCursor: string | null;
  hasMore: boolean;
  limit: number;
}
