import type { ExplicitWatchState, TaskWatcher } from "../entities/task-watcher.interface";

export interface ITaskWatcherRepository {
  find(taskId: string, userId: string): Promise<TaskWatcher | null>;
  /** Mọi hàng của thẻ (mới cập nhật trước), tối đa `limit`. */
  listByTask(taskId: string, limit: number): Promise<TaskWatcher[]>;
  /** Người dùng chủ động bật/tắt: tạo hàng hoặc GHI ĐÈ trạng thái cũ (idempotent). Đua tạo lần đầu (P2002) được xử lý bên trong. */
  setExplicit(taskId: string, userId: string, state: ExplicitWatchState): Promise<TaskWatcher>;
  /**
   * Tự theo dõi do tương tác (được giao, bình luận, được nhắc): CHỈ tạo hàng `AUTO_ON` cho người CHƯA có hàng — không bao giờ ghi đè lựa chọn
   * của người dùng (đã `EXPLICIT_OFF` thì bình luận tiếp cũng không tự bật lại). Trả số hàng mới tạo.
   */
  ensureAuto(taskId: string, userIds: string[]): Promise<number>;
}
