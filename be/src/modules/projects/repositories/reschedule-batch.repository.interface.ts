import type { RescheduleBatch, RescheduleBatchCreateInput } from "../entities/reschedule.interface";
import type { TxContext } from "./unit-of-work";

/** Đã có lô đang chạy trên bảng (P2002 `activeKey`) — ném ra khỏi transaction; service trả `TASK_020` NGOÀI transaction. */
export class DuplicateActiveBatchError extends Error {
  constructor() {
    super("Bảng đang có một lô dời lịch chưa kết thúc");
    this.name = "DuplicateActiveBatchError";
  }
}

export interface RescheduleProgress {
  /** Id thẻ đã áp trong lượt này. */
  applied: string[];
  /** Id thẻ xung đột (đã sửa/xoá/DONE giữa chừng) trong lượt này. */
  conflicts: string[];
  nextCursor: number;
}

export interface IRescheduleBatchRepository {
  /** Ghi `activeKey = board:<boardId>`, `QUEUED`, null tường minh cho `startedAt/finishedAt/error`. Có thể ném `DuplicateActiveBatchError`. */
  create(input: RescheduleBatchCreateInput, tx: TxContext): Promise<RescheduleBatch>;
  findById(id: string, tx?: TxContext): Promise<RescheduleBatch | null>;
  /** Lô chưa kết thúc của bảng (`activeKey = board:<boardId>`). */
  findActiveByBoard(boardId: string, tx?: TxContext): Promise<RescheduleBatch | null>;
  /**
   * Lô còn chặn bảng (`QUEUED`/`RUNNING`, `activeKey = board:<boardId>`) mà mốc bắt đầu quá hạn: `QUEUED` tính từ `createdAt`, `RUNNING`
   * tính từ `startedAt` (`< cutoff`). Cũ nhất trước, tối đa `limit`. Chỉ đọc — quét lô treo (`reschedule-batch.sweep`).
   */
  findStale(cutoff: Date, limit: number): Promise<RescheduleBatch[]>;
  /** `QUEUED → RUNNING` (CAS theo trạng thái, đặt `startedAt`); trả lô hiện tại (đã `RUNNING` khi retry) hoặc `null` nếu không còn. */
  markRunning(id: string, now: Date): Promise<RescheduleBatch | null>;
  /**
   * Ghi kết quả MỘT lượt cùng transaction với việc dời thẻ: CAS theo `cursor` (worker khác đã đi trước ⇒ `false`, caller huỷ
   * transaction). Cập nhật `items[].result`, `cursor`, `appliedCount`, `conflictCount`.
   */
  recordProgress(id: string, expectedCursor: number, progress: RescheduleProgress, tx: TxContext): Promise<boolean>;
  /** Kết thúc: `status`, `activeKey = batch:<id>`, `finishedAt`, `error` — chỉ khi CHƯA kết thúc. Trả `false` nếu đã kết thúc. */
  finish(id: string, status: "DONE" | "PARTIAL" | "FAILED", now: Date, error: string | null, tx: TxContext): Promise<boolean>;
}
