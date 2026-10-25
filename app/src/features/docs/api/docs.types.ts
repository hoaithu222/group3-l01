/**
 * Kiểu dữ liệu Real-time Docs (p6-01) — khớp `be/src/modules/documents/entities/document.interface.ts` + presenter/services
 * (đọc TRỰC TIẾP từ đó, không suy từ be.md). Ngày tháng là chuỗi ISO qua JSON. Nội dung tài liệu (Yjs) KHÔNG nằm ở đây:
 * nó sống trong Y.Doc của WebView, không đi qua React Query.
 */

export type DocumentVisibility = 'PRIVATE' | 'WORKSPACE';
export type DocumentStatus = 'ACTIVE' | 'ARCHIVED';
export type CollaboratorRole = 'EDITOR' | 'VIEWER';
/** Vai của MÌNH với tài liệu (server tính, client không tự suy): người tạo · cộng tác viên · thành viên nhóm. */
export type DocumentMyRole = 'CREATOR' | 'EDITOR' | 'MEMBER' | 'VIEWER';
export type SnapshotKind = 'AUTO' | 'MANUAL' | 'PRE_RESTORE';

export interface PersonRef {
  id: string;
  name: string;
}

export interface DocumentView {
  createdAt: string;
  createdBy: string;
  id: string;
  lastEditedAt: string | null;
  lastEditedBy: PersonRef | null;
  myRole: DocumentMyRole;
  status: DocumentStatus;
  title: string;
  updatedAt: string;
  /** Phiên bản của METADATA (đổi tên/visibility/lưu trữ/khôi phục) — gửi lại làm `expectedVersion`. */
  version: number;
  visibility: DocumentVisibility;
  wordCount: number;
  workspaceId: string;
  yjsVersion: number;
}

/** 4 cờ do SERVER tính — app chỉ đọc, không tự suy từ `myRole`. */
export interface DocumentPermissions {
  edit: boolean;
  manage: boolean;
  restore: boolean;
  snapshot: boolean;
}

export interface DocumentDetail extends DocumentView {
  myPermissions: DocumentPermissions;
}

export interface DocumentsFilter {
  q: string;
  status: DocumentStatus;
}

export interface CursorPage<T> {
  items: T[];
  nextCursor: string | null;
}

export interface Collaborator {
  addedAt: string;
  name: string;
  role: CollaboratorRole;
  userId: string;
}

export interface SnapshotView {
  at: string;
  createdBy: PersonRef | null;
  id: string;
  kind: SnapshotKind;
  label: string | null;
  sizeBytes: number;
}

/** Chi tiết bản lưu: `yjsState` base64 để editor dựng bản xem chỉ đọc (KHÔNG có ở danh sách). */
export interface SnapshotDetail extends SnapshotView {
  yjsState: string;
  yjsVersion: number;
}

export interface RestoreResult {
  preRestoreSnapshotId: string | null;
  restoredVersion: number;
  /** `version` metadata mới — dùng làm `expectedVersion` lần sau. */
  version: number;
}

/** Thành viên nhóm để chọn làm người cộng tác (`GET /workspaces/:id/members`). */
export interface MemberOption {
  name: string;
  role: string;
  userId: string;
}

export interface CreateDocumentPayload {
  title: string;
  visibility: DocumentVisibility;
}

/** `expectedVersion` BẮT BUỘC (BE `updateDocumentSchema`); `confirmPublic` bắt buộc khi đổi PRIVATE → WORKSPACE (`DOC_002`). */
export interface UpdateDocumentPayload {
  confirmPublic?: boolean;
  expectedVersion: number;
  title?: string;
  visibility?: DocumentVisibility;
}

/** Payload socket `document:updated` (chỉ metadata; `be/.../document-events-publisher.ts` — chưa có `v`, kế hoạch nói có). */
export interface DocumentUpdatedPayload {
  id: string;
  lastEditedAt: string | null;
  status: DocumentStatus;
  title: string;
  version: number;
  visibility: DocumentVisibility;
  workspaceId: string;
}
