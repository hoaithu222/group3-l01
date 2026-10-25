import type { CompletedOutcome, ReopenedInput, ReopenedOutcome, ReviewFact, TaskFact, TaskFactInput } from "../entities/contribution.interface";

export interface MemberTaskCursor {
  at: Date;
  taskId: string;
}

export interface MemberTaskPage {
  items: TaskFact[];
  nextCursor: MemberTaskCursor | null;
}

export interface FactRange {
  from: Date | null;
  to: Date | null;
}

/**
 * Fact đóng góp (p4-06 be.md §5.1) — MỘT bản ghi/thẻ (`taskId` duy nhất) và MỘT bản ghi/lượt chấm (`reviewId` duy nhất).
 * `applyCompleted`/`applyReopened` idempotent theo `completionCount` và chịu được sự kiện tới LỆCH THỨ TỰ; không dùng transaction
 * (mọi thao tác là một ghi có điều kiện) nên hai consumer đua ghi cùng thẻ không làm hỏng nhau.
 */
export interface IContributionFactRepository {
  /** `n > đã lưu` → ghi đè + `active=true`; `n ≤ đã lưu` → bỏ (retry/sự kiện cũ); chưa có → tạo. */
  applyCompleted(input: TaskFactInput): Promise<CompletedOutcome>;
  /** `n = đã lưu && active` → `active=false`; chưa có → bản giữ chỗ `{ n, active: false }` để `completed c<n>` tới sau bị bỏ; khác → bỏ. */
  applyReopened(input: ReopenedInput): Promise<ReopenedOutcome>;
  /** Insert-only theo `reviewId`; `false` khi đã có (retry). */
  insertReviewFact(fact: ReviewFact): Promise<boolean>;
  /** Mọi fact `active` của bảng (đầu vào bộ tính; bảng ≤ `LIMITS.task.perBoardMax` thẻ). */
  listActiveTaskFacts(boardId: string): Promise<TaskFact[]>;
  listReviewFacts(boardId: string): Promise<ReviewFact[]>;
  /** Thẻ được tính của MỘT người trong kỳ, mới → cũ theo `(completedAt, taskId)`. */
  listMemberTaskFacts(boardId: string, userId: string, range: FactRange, cursor: MemberTaskCursor | null, limit: number): Promise<MemberTaskPage>;
  /** Lượt chấm của các thẻ (cho cột điểm chấm trong danh sách thẻ theo người) — trong kỳ. */
  listReviewFactsForTasks(boardId: string, taskIds: readonly string[], range: FactRange): Promise<ReviewFact[]>;
  /** Fact (kể cả `inactive`) theo id thẻ — đối soát. */
  findTaskFacts(taskIds: readonly string[]): Promise<TaskFact[]>;
  /** Đặt `active=false` cho các thẻ (đối soát: thẻ đã rời DONE mà không nhận được `task.reopened`). */
  deactivate(taskIds: readonly string[]): Promise<number>;
  /** Số fact thẻ `active` + số lượt chấm của MỘT bảng — thống kê/kiểm thử. */
  countBoardFacts(boardId: string): Promise<{ tasks: number; reviews: number }>;
}
