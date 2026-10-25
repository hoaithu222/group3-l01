import type { SrDueQuery, SrProgress, SrProgressCreateInput, SrProgressPatch, SrSuspendReason } from "../entities/sr.interface";
import type { TxHandle } from "./tx";

export interface ISrProgressRepository {
  findByUserItem(userId: string, itemId: string, tx?: TxHandle): Promise<SrProgress | null>;
  findByUserItems(userId: string, itemIds: readonly string[]): Promise<SrProgress[]>;
  /**
   * Tạo các hàng CHƯA có `(userId, itemId)` — NGOÀI transaction (Mongo: hai tx cùng tạo một khoá unique MỚI → P2002 không retry).
   * Đua ghi → bỏ hàng đã có, thử lại phần còn thiếu. Trả số hàng THẬT SỰ tạo.
   */
  createMissing(rows: readonly SrProgressCreateInput[]): Promise<number>;
  /** CAS `version` + `version + 1`; `null` = lệch phiên bản/không tồn tại. */
  updateIf(id: string, expectedVersion: number, patch: SrProgressPatch, tx?: TxHandle): Promise<SrProgress | null>;
  /** LEARNING/REVIEW đến hạn (`nextReviewAt < before`), `nextReviewAt asc`. */
  listDue(userId: string, query: SrDueQuery): Promise<SrProgress[]>;
  countDue(userId: string, before: Date, setIds?: readonly string[]): Promise<number>;
  /** Thẻ MỚI của bộ theo `itemOrder`. */
  listNew(userId: string, setId: string, limit: number): Promise<SrProgress[]>;
  countNew(userId: string, setId: string): Promise<number>;
  /** Mọi `setId` người này có tiến độ (kể cả đang tạm ngừng). */
  listSetIds(userId: string): Promise<string[]>;
  listSuspendedSetIds(userId: string): Promise<string[]>;
  suspendBySets(userId: string, setIds: readonly string[], reason: SrSuspendReason): Promise<number>;
  /** Mở lại thẻ tạm ngừng do mất quyền (`LOST_ACCESS`/`SET_HIDDEN`) — về `NEW | LEARNING | REVIEW` theo `resumeStatus`. */
  reopenBySet(userId: string, setId: string): Promise<number>;
  /** `nextReviewAt` của thẻ LEARNING/REVIEW trong `[from, to)` — bucket theo ngày địa phương ở service. */
  listDueDates(userId: string, from: Date, to: Date, setIds?: readonly string[]): Promise<Date[]>;
  /** Mục bị xoá khỏi bộ: xoá tiến độ của MỌI người. */
  deleteByItems(itemIds: readonly string[]): Promise<number>;
  deleteByUser(userId: string): Promise<number>;
  /** `userId` (không trùng, tăng dần, sau `afterUserId`) có thẻ NEW/LEARNING/REVIEW đến hạn trước `before` — cho job nhắc ôn. */
  listCandidateUserIds(before: Date, opts: { afterUserId?: string; limit: number }): Promise<string[]>;
}
