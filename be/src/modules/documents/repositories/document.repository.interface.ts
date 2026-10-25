import type { DocumentEntity, DocumentStatusValue, DocumentVisibilityValue, DocumentWithState } from "../entities/document.interface";
import type { TxHandle } from "./tx";

export interface NewDocument {
  workspaceId: string;
  title: string;
  normalizedTitle: string;
  visibility: DocumentVisibilityValue;
  createdBy: string;
}

export interface DocumentListParams {
  workspaceId: string;
  userId: string;
  /** MEMBER+ thấy mọi tài liệu WORKSPACE; GUEST chỉ thấy tài liệu mình tạo/được mời. PRIVATE luôn chỉ người tạo + cộng tác viên. */
  seesWorkspaceDocs: boolean;
  status: DocumentStatusValue;
  /** Đã chuẩn hoá (`normalizeSearch`). */
  q?: string;
  cursor?: { at: Date; id: string } | null;
  limit: number;
}

export interface MetaPatch {
  title?: string;
  normalizedTitle?: string;
  visibility?: DocumentVisibilityValue;
  status?: DocumentStatusValue;
  archivedAt?: Date | null;
}

export interface StateWrite {
  yjsState: Uint8Array;
  yjsVersion: number;
  stateBytes: number;
  /** Bỏ trống → giữ nguyên người sửa cuối. */
  lastEditedBy?: string | null;
  lastEditedAt: Date;
  /** Khôi phục snapshot thay nội dung "cả tài liệu" → tăng `version` metadata để client đang giữ `expectedVersion` cũ nhận 409. */
  bumpVersion?: boolean;
}

export interface PlainTextWrite {
  plainText: string;
  normalizedText: string;
  wordCount: number;
}

export interface IDocumentRepository {
  create(data: NewDocument, tx: TxHandle): Promise<DocumentEntity>;
  findById(id: string): Promise<DocumentEntity | null>;
  /** Kèm `yjsState` — `tx` để đọc trong cùng transaction với lần ghi. */
  findWithState(id: string, tx?: TxHandle): Promise<DocumentWithState | null>;
  /** Số tài liệu ACTIVE của workspace (trần `perWorkspaceMax`). */
  countActive(workspaceId: string): Promise<number>;
  /** Trả tối đa `limit + 1` dòng (dòng dư báo còn trang sau), đã sắp theo `updatedAt desc, id desc`. */
  list(params: DocumentListParams): Promise<DocumentEntity[]>;
  /** CAS theo `version`: lệch → `null`. Tăng `version` thêm 1. */
  updateMeta(id: string, expectedVersion: number, patch: MetaPatch, tx: TxHandle): Promise<DocumentEntity | null>;
  /** CAS theo `yjsVersion`: lệch (có ai ghi xen) → `null`. */
  writeState(id: string, expectedYjsVersion: number, write: StateWrite, tx: TxHandle): Promise<DocumentEntity | null>;
  /** CAS theo `yjsVersion` (bỏ qua nếu đã có bản mới hơn). */
  updatePlainText(id: string, yjsVersion: number, text: PlainTextWrite): Promise<boolean>;
  /** Tài liệu ACTIVE có state và `lastEditedAt >= since`, phân trang theo id tăng dần (cron snapshot hằng giờ). */
  findSnapshotCandidates(since: Date, afterId: string | null, limit: number): Promise<DocumentEntity[]>;
  /** Top tài liệu theo `stateBytes` (admin). */
  listLargest(limit: number): Promise<DocumentEntity[]>;
}
