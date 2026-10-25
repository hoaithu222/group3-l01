import type { Board, BoardCreateInput, BoardPatch } from "../entities/board.interface";
import type { BoardReviewConfig } from "../entities/task-review.interface";
import type { TxContext } from "./unit-of-work";

export interface IBoardRepository {
  findById(id: string, tx?: TxContext): Promise<Board | null>;
  /** `archived=false` → chưa lưu trữ; `true` → đã lưu trữ. Cũ → mới theo `createdAt`. */
  listByWorkspace(workspaceId: string, archived: boolean): Promise<Board[]>;
  /** Mọi id bảng của workspace (kể cả đã lưu trữ) — cho `children()` của `revokeScope`. */
  listIdsByWorkspace(workspaceId: string): Promise<string[]>;
  countActive(workspaceId: string, tx?: TxContext): Promise<number>;
  /** Ghi `archivedAt: null` tường minh (quy ước Mongo null-vs-absent). */
  create(input: BoardCreateInput, tx?: TxContext): Promise<Board>;
  /** CAS `where { id, version }`, `version +1`; `null` khi lệch version (hoặc không còn). */
  updateCas(id: string, expectedVersion: number, patch: BoardPatch, tx?: TxContext): Promise<Board | null>;
  /** Lưu trữ/khôi phục — `version +1`, không CAS (thao tác một chiều, idempotent theo trạng thái). */
  setArchived(id: string, archivedAt: Date | null, tx?: TxContext): Promise<Board | null>;
  /** (p4-05) Ghi cấu hình chấm chéo — CAS `where { id, version }`, `version +1`; `null` khi lệch version (hoặc không còn). */
  updateReviewCas(id: string, expectedVersion: number, review: BoardReviewConfig, tx?: TxContext): Promise<Board | null>;
  /**
   * Ghi `updatedAt` của bảng để các giao dịch ghi cùng bảng đụng nhau (write-conflict → retry) ⇒ tính khoá
   * vị trí không bao giờ trùng dù nhiều instance. `false` khi bảng không còn.
   */
  touch(id: string, tx: TxContext): Promise<boolean>;
}
