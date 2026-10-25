/**
 * Kiểu dữ liệu Bảng trắng (p6-02) — khớp `be/src/modules/whiteboards/entities/whiteboard.interface.ts` + presenter/services (đọc TRỰC TIẾP từ
 * đó, không suy từ be.md). Ngày tháng là chuỗi ISO qua JSON. Nội dung bảng (Yjs) KHÔNG nằm ở đây: nó sống trong Y.Doc của phiên collab, không
 * đi qua React Query.
 */

export type WhiteboardVisibility = 'PRIVATE' | 'WORKSPACE';
export type WhiteboardStatus = 'ACTIVE' | 'ARCHIVED';
export type CollaboratorRole = 'EDITOR' | 'VIEWER';
/** Vai của MÌNH với bảng (server tính, client không tự suy): người tạo · cộng tác viên · thành viên nhóm. */
export type WhiteboardMyRole = 'CREATOR' | 'EDITOR' | 'MEMBER' | 'VIEWER';
export type SnapshotKind = 'AUTO' | 'MANUAL' | 'PRE_RESTORE';

export interface PersonRef {
  id: string;
  name: string;
}

export interface WhiteboardView {
  createdAt: string;
  createdBy: string;
  elementCount: number;
  id: string;
  lastEditedAt: string | null;
  lastEditedBy: PersonRef | null;
  myRole: WhiteboardMyRole;
  name: string;
  status: WhiteboardStatus;
  thumbnailAssetId: string | null;
  /** URL ký (≤ 60 s) của ảnh thu nhỏ; `null` khi chưa có — P0 chưa có luồng tải ảnh lên nên thường `null`. */
  thumbnailUrl: string | null;
  updatedAt: string;
  /** Phiên bản của METADATA (đổi tên/visibility/lưu trữ/khôi phục) — gửi lại làm `expectedVersion`. */
  version: number;
  visibility: WhiteboardVisibility;
  workspaceId: string;
  yjsVersion: number;
}

/** 4 cờ do SERVER tính — app chỉ đọc, không tự suy từ `myRole`. */
export interface WhiteboardPermissions {
  edit: boolean;
  manage: boolean;
  restore: boolean;
  snapshot: boolean;
}

export interface WhiteboardDetail extends WhiteboardView {
  myPermissions: WhiteboardPermissions;
}

export interface WhiteboardsFilter {
  q: string;
  status: WhiteboardStatus;
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

/** Bản lưu: khác tài liệu, BE trả `elementCount` (số phần tử) chứ không có dung lượng. */
export interface SnapshotView {
  at: string;
  createdBy: PersonRef | null;
  elementCount: number;
  id: string;
  kind: SnapshotKind;
  label: string | null;
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

export interface CreateWhiteboardPayload {
  name: string;
  visibility: WhiteboardVisibility;
}

/** `expectedVersion` BẮT BUỘC (BE `updateWhiteboardSchema`); `confirmPublic` bắt buộc khi đổi PRIVATE → WORKSPACE. */
export interface UpdateWhiteboardPayload {
  confirmPublic?: boolean;
  expectedVersion: number;
  name?: string;
  visibility?: WhiteboardVisibility;
}

/** Payload socket `whiteboard:updated` (chỉ metadata; `be/.../whiteboard-events-publisher.ts` — không có `v`, không có `lastEditedAt`). */
export interface WhiteboardUpdatedPayload {
  id: string;
  name: string;
  status: WhiteboardStatus;
  thumbnailAssetId: string | null;
  version: number;
  visibility: WhiteboardVisibility;
  workspaceId: string;
}
