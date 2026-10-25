import { enqueue, toSafeJobId } from "../../../infrastructure/queue";
import { logger } from "../../../infrastructure/logger";

export const REBALANCE_QUEUE = "cron" as const;
export const REBALANCE_JOB = "board.rebalance-column" as const;
/** Gộp nhiều lần kéo liên tiếp thành MỘT lượt nén (jobId tất định + delay). */
export const REBALANCE_DELAY_MS = 5000;

export interface IRebalanceScheduler {
  /** Không chặn và không ném lỗi — mất một lượt nén chỉ làm khoá dài thêm đến lần kéo sau. */
  schedule(boardId: string, columnId: string): void;
}

/** `jobId` gốc có ≥ 3 dấu `:` ⇒ phải qua `toSafeJobId` (BullMQ từ chối `:`), ở cả lúc tạo lẫn huỷ. */
export const rebalanceJobId = (boardId: string, columnId: string): string =>
  toSafeJobId(`board.rebalance-column:board:${boardId}:${columnId}`);

/**
 * `enqueue` với ioredis `maxRetriesPerRequest: null` sẽ CHỜ VÔ HẠN khi Redis mất kết nối ⇒ tuyệt đối không `await`
 * trong đường xử lý request. `removeOnComplete/removeOnFail: true` để jobId được dùng lại ở lượt sau (BullMQ bỏ
 * qua `add` trùng jobId còn nằm trong tập completed).
 */
export class QueueRebalanceScheduler implements IRebalanceScheduler {
  schedule(boardId: string, columnId: string): void {
    void enqueue(
      REBALANCE_QUEUE,
      REBALANCE_JOB,
      { boardId, columnId },
      {
        jobId: rebalanceJobId(boardId, columnId),
        delay: REBALANCE_DELAY_MS,
        attempts: 2,
        removeOnComplete: true,
        removeOnFail: true,
      }
    ).catch((err: unknown) => {
      logger.warn("[projects] Không xếp được job board.rebalance-column", {
        boardId,
        columnId,
        error: err instanceof Error ? err.message : String(err),
      });
    });
  }
}
