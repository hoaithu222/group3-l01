export interface SourceDoneTask {
  id: string;
  boardId: string;
  workspaceId: string;
  assigneeIds: string[];
  storyPoints: number | null;
  dueDate: Date | null;
  completedAt: Date;
  completionCount: number;
  /** Thẻ đã xoá mềm — VẪN là dữ liệu đóng góp lịch sử. */
  deleted: boolean;
}

export interface SourceSubmittedReview {
  id: string;
  taskId: string;
  boardId: string;
  workspaceId: string;
  reviewerId: string;
  status: "APPROVED" | "REQUEST_CHANGES";
  score10: number | null;
  submittedAt: Date;
}

/**
 * Nguồn dữ liệu GỐC cho job đối soát (`contribution.reconcile`): dựng lại fact từ `Task`/`TaskReview` khi sự kiện outbox bị mất/tới lệch.
 * Chỉ đọc; đi xuyên collection của `projects`/`peer-review` (ngoại lệ có chủ đích như `IContributionDirectory`).
 */
export interface IContributionSourceRepository {
  /** Bảng CHƯA lưu trữ có `updatedAt ≥ since` (mọi lần kéo thẻ/tạo thẻ chạm `Board.updatedAt`), phân trang theo id tăng dần. */
  listBoardsTouchedSince(since: Date, limit: number, afterId: string | null): Promise<Array<{ id: string; workspaceId: string }>>;
  /** Thẻ đang ở cột `DONE` có `completedAt` (kể cả đã xoá mềm). */
  listDoneTasks(boardId: string): Promise<SourceDoneTask[]>;
  /** Lượt chấm đã nộp (Duyệt/Yêu cầu sửa) có `submittedAt ≥ since`, phân trang theo id tăng dần. */
  listSubmittedReviewsSince(since: Date, limit: number, afterId: string | null): Promise<SourceSubmittedReview[]>;
  /** Một lượt chấm theo id (kể cả chưa nộp → `null` nếu chưa `APPROVED`/`REQUEST_CHANGES`) — khi sự kiện `review.submitted` thiếu trường. */
  findSubmittedReview(reviewId: string): Promise<SourceSubmittedReview | null>;
  /** Trạng thái hiện tại của các thẻ còn trong DB (thẻ đã bị xoá hẳn vắng mặt — fact của chúng được GIỮ như dữ liệu lịch sử). */
  taskStates(taskIds: readonly string[]): Promise<Map<string, { columnKind: string }>>;
  /** Người làm HIỆN TẠI của các thẻ — dự phòng khi sự kiện chấm không mang `assigneeIds`. */
  currentAssignees(taskIds: readonly string[]): Promise<Map<string, string[]>>;
}
