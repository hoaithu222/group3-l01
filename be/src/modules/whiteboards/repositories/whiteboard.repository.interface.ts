import type { WhiteboardEntity, WhiteboardStatusValue, WhiteboardVisibilityValue, WhiteboardWithState } from "../entities/whiteboard.interface";
import type { TxHandle } from "./tx";

export interface NewWhiteboard {
  workspaceId: string;
  name: string;
  normalizedName: string;
  visibility: WhiteboardVisibilityValue;
  createdBy: string;
}

export interface WhiteboardListParams {
  workspaceId: string;
  userId: string;
  /** MEMBER+ thấy mọi bảng WORKSPACE; GUEST chỉ thấy bảng mình tạo/được mời. PRIVATE luôn chỉ người tạo + cộng tác viên. */
  seesWorkspaceBoards: boolean;
  status: WhiteboardStatusValue;
  /** Đã chuẩn hoá (`normalizeSearch`). */
  q?: string;
  cursor?: { at: Date; id: string } | null;
  limit: number;
}

export interface MetaPatch {
  name?: string;
  normalizedName?: string;
  visibility?: WhiteboardVisibilityValue;
  status?: WhiteboardStatusValue;
  archivedAt?: Date | null;
  thumbnailAssetId?: string | null;
}

export interface StateWrite {
  yjsState: Uint8Array;
  yjsVersion: number;
  elementCount: number;
  /** Bỏ trống → giữ nguyên người sửa cuối. */
  lastEditedBy?: string | null;
  lastEditedAt: Date;
  /** Khôi phục snapshot thay nội dung "cả bảng" → tăng `version` metadata để client đang giữ `expectedVersion` cũ nhận 409. */
  bumpVersion?: boolean;
}

export interface IWhiteboardRepository {
  create(data: NewWhiteboard, tx: TxHandle): Promise<WhiteboardEntity>;
  findById(id: string): Promise<WhiteboardEntity | null>;
  /** Kèm `yjsState` — `tx` để đọc trong cùng transaction với lần ghi. */
  findWithState(id: string, tx?: TxHandle): Promise<WhiteboardWithState | null>;
  /** Số bảng ACTIVE của workspace (trần `perWorkspaceMax`). */
  countActive(workspaceId: string): Promise<number>;
  /** Trả tối đa `limit + 1` dòng (dòng dư báo còn trang sau), đã sắp theo `updatedAt desc, id desc`. */
  list(params: WhiteboardListParams): Promise<WhiteboardEntity[]>;
  /** CAS theo `version`: lệch → `null`. Tăng `version` thêm 1. */
  updateMeta(id: string, expectedVersion: number, patch: MetaPatch, tx: TxHandle): Promise<WhiteboardEntity | null>;
  /** CAS theo `yjsVersion`: lệch (có ai ghi xen) → `null`. */
  writeState(id: string, expectedYjsVersion: number, write: StateWrite, tx: TxHandle): Promise<WhiteboardEntity | null>;
  /** Bảng ACTIVE có state và `lastEditedAt >= since`, phân trang theo id tăng dần (cron snapshot hằng giờ). */
  findSnapshotCandidates(since: Date, afterId: string | null, limit: number): Promise<WhiteboardEntity[]>;
}
